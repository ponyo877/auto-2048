/* tools/train.cpp — native TD(0) trainer for 4x6patt N-Tuple network.
 *
 * Build: g++ -std=c++17 -O3 -o tools/train tools/train.cpp
 * Run:   tools/train <episodes> <alpha> <out_path>
 *        e.g. tools/train 200000 0.0025 public/weights/4x6patt.trained.w
 *
 * Implements afterstate TD(0):
 *   V(s_after_t) ← V(s_after_t) + α × (r_{t+1} + V(s_after_{t+1}) - V(s_after_t))
 *
 * Each pattern's weight update is divided by 32 (8 isomorphisms × 4
 * features) so that the per-feature learning rate stays at α.
 *
 * Output is the same .w format consumed by core/wrapper.cpp solver_load_weights.
 */

#include <cstdint>
#include <cstdio>
#include <cstdlib>
#include <cstring>
#include <fstream>
#include <random>
#include <vector>
#include <chrono>
#include <algorithm>

using u8  = uint8_t;
using u16 = uint16_t;
using u32 = uint32_t;
using u64 = uint64_t;

/* ===== bitboard ===== */
static inline u32 get_tile(u64 b, int p) { return (b >> (p * 4)) & 0xFu; }
static inline u64 set_tile(u64 b, int p, u32 v) {
    const u64 mask = u64(0xF) << (p * 4);
    return (b & ~mask) | (u64(v & 0xF) << (p * 4));
}

/* ===== row LUT (slide+merge) ===== */
struct RowOp { u16 row_left; u16 row_right; u32 reward_left; u32 reward_right; };
static RowOp ROW_LUT[1u << 16];

static void slide_line_left(u32 in[4], u32 out[4], u32* reward) {
    u32 buf[4] = {0,0,0,0};
    int n = 0;
    for (int i = 0; i < 4; i++) if (in[i]) buf[n++] = in[i];
    u32 r = 0;
    for (int i = 0; i + 1 < n; i++) {
        if (buf[i] && buf[i] == buf[i + 1]) {
            buf[i]++;
            r += (1u << buf[i]);
            buf[i + 1] = 0;
        }
    }
    int o = 0;
    for (int i = 0; i < 4; i++) if (buf[i]) out[o++] = buf[i];
    while (o < 4) out[o++] = 0;
    *reward = r;
}

static u16 pack_row(const u32 r[4]) {
    return u16((r[0] & 0xF) | ((r[1] & 0xF) << 4) | ((r[2] & 0xF) << 8) | ((r[3] & 0xF) << 12));
}
static void unpack_row(u16 row, u32 out[4]) {
    out[0] = (row >> 0)  & 0xF;
    out[1] = (row >> 4)  & 0xF;
    out[2] = (row >> 8)  & 0xF;
    out[3] = (row >> 12) & 0xF;
}

static void build_row_lut() {
    for (u32 r = 0; r < (1u << 16); r++) {
        u32 in[4]; unpack_row((u16)r, in);
        u32 out_left[4]; u32 rew_left;
        slide_line_left(in, out_left, &rew_left);
        u32 in_rev[4] = { in[3], in[2], in[1], in[0] };
        u32 out_rev[4]; u32 rew_right;
        slide_line_left(in_rev, out_rev, &rew_right);
        u32 out_right[4] = { out_rev[3], out_rev[2], out_rev[1], out_rev[0] };
        ROW_LUT[r].row_left = pack_row(out_left);
        ROW_LUT[r].row_right = pack_row(out_right);
        ROW_LUT[r].reward_left = rew_left;
        ROW_LUT[r].reward_right = rew_right;
    }
}

static u16 row_at(u64 b, int row) { return u16((b >> (row * 16)) & 0xFFFFu); }

static u64 transpose(u64 b) {
    u64 a1 = b & 0xF0F00F0FF0F00F0FULL;
    u64 a2 = b & 0x0000F0F00000F0F0ULL;
    u64 a3 = b & 0x0F0F00000F0F0000ULL;
    u64 a  = a1 | (a2 << 12) | (a3 >> 12);
    u64 b1 = a & 0xFF00FF0000FF00FFULL;
    u64 b2 = a & 0x00FF00FF00000000ULL;
    u64 b3 = a & 0x00000000FF00FF00ULL;
    return b1 | (b2 >> 24) | (b3 << 24);
}

static u64 move_left(u64 b, u32* rw) {
    u64 out = 0; u32 r = 0;
    for (int i = 0; i < 4; i++) {
        u16 row = row_at(b, i);
        const RowOp& op = ROW_LUT[row];
        out |= u64(op.row_left) << (i * 16);
        r   += op.reward_left;
    }
    *rw = r; return out;
}
static u64 move_right(u64 b, u32* rw) {
    u64 out = 0; u32 r = 0;
    for (int i = 0; i < 4; i++) {
        u16 row = row_at(b, i);
        const RowOp& op = ROW_LUT[row];
        out |= u64(op.row_right) << (i * 16);
        r   += op.reward_right;
    }
    *rw = r; return out;
}
static u64 move_up(u64 b, u32* rw)   { u64 t = transpose(b); u64 m = move_left(t, rw);  return transpose(m); }
static u64 move_down(u64 b, u32* rw) { u64 t = transpose(b); u64 m = move_right(t, rw); return transpose(m); }

static u64 simulate(u64 b, int action, u32* reward) {
    switch (action) {
        case 0: return move_up(b, reward);
        case 1: return move_right(b, reward);
        case 2: return move_down(b, reward);
        case 3: return move_left(b, reward);
    }
    *reward = 0; return b;
}

/* ===== spawn ===== */
static u64 spawn_tile_rng(u64 b, std::mt19937& rng) {
    int empties[16]; int n = 0;
    for (int i = 0; i < 16; i++) if (get_tile(b, i) == 0) empties[n++] = i;
    if (n == 0) return b;
    int pos = empties[rng() % (u32)n];
    u32 v = (rng() % 10) < 9 ? 1u : 2u;
    return set_tile(b, pos, v);
}

/* ===== 4x6patt features ===== */
constexpr int FEATURE_COUNT = 4;
constexpr int TILES_PER_PATTERN = 6;
constexpr u64 PATTERN_SIZE = 1ULL << (4 * TILES_PER_PATTERN);

static const int PATTERNS[FEATURE_COUNT][TILES_PER_PATTERN] = {
    {0, 1, 2, 3, 4, 5},
    {4, 5, 6, 7, 8, 9},
    {0, 1, 2, 4, 5, 6},
    {4, 5, 6, 8, 9, 10},
};

static int ISO_POS[8][FEATURE_COUNT][TILES_PER_PATTERN];

static void apply_iso(int iso, int p, int& xo, int& yo) {
    int x = p % 4, y = p / 4;
    if (iso & 4) x = 3 - x;
    int rot = iso & 3;
    for (int i = 0; i < rot; i++) {
        int nx = y, ny = 3 - x;
        x = nx; y = ny;
    }
    xo = x; yo = y;
}

static void build_iso_table() {
    for (int iso = 0; iso < 8; iso++)
        for (int f = 0; f < FEATURE_COUNT; f++)
            for (int t = 0; t < TILES_PER_PATTERN; t++) {
                int x, y;
                apply_iso(iso, PATTERNS[f][t], x, y);
                ISO_POS[iso][f][t] = y * 4 + x;
            }
}

static u32 pattern_index(u64 b, const int positions[TILES_PER_PATTERN]) {
    u32 idx = 0;
    for (int t = 0; t < TILES_PER_PATTERN; t++) {
        idx |= (get_tile(b, positions[t])) << (t * 4);
    }
    return idx;
}

/* ===== weights ===== */
static std::vector<float> WEIGHTS[FEATURE_COUNT];

static float V(u64 b) {
    float v = 0.0f;
    for (int iso = 0; iso < 8; iso++)
        for (int f = 0; f < FEATURE_COUNT; f++) {
            u32 idx = pattern_index(b, ISO_POS[iso][f]);
            v += WEIGHTS[f][idx];
        }
    return v;
}

static void update_weights(u64 b, float delta_per_feature) {
    for (int iso = 0; iso < 8; iso++)
        for (int f = 0; f < FEATURE_COUNT; f++) {
            u32 idx = pattern_index(b, ISO_POS[iso][f]);
            WEIGHTS[f][idx] += delta_per_feature;
        }
}

/* ===== select greedy action by reward + V(afterstate) ===== */
struct Pick { int action; u64 after; u32 reward; };

static Pick select_action(u64 b) {
    Pick best = { -1, b, 0 };
    float best_v = -1e30f;
    for (int a = 0; a < 4; a++) {
        u32 r = 0;
        u64 after = simulate(b, a, &r);
        if (after == b) continue;
        float v = (float)r + V(after);
        if (v > best_v) {
            best_v = v;
            best = { a, after, r };
        }
    }
    return best;
}

static int max_tile(u64 b) {
    int m = 0;
    for (int i = 0; i < 16; i++) {
        int t = (int)get_tile(b, i);
        if (t > m) m = t;
    }
    return m;
}

/* ===== one training episode ===== */
struct EpiResult { u32 score; int max_log; int moves; };

static EpiResult train_episode(std::mt19937& rng, float alpha) {
    u64 board = 0;
    board = spawn_tile_rng(board, rng);
    board = spawn_tile_rng(board, rng);
    u32 score = 0; int moves = 0;
    u64 prev_after = 0; bool has_prev = false;
    const float per_feature = alpha / 32.0f;
    while (true) {
        Pick p = select_action(board);
        if (p.action < 0) {
            if (has_prev) {
                /* terminal: target is 0 */
                float td = 0.0f - V(prev_after);
                update_weights(prev_after, td * per_feature);
            }
            break;
        }
        score += p.reward;
        moves++;
        if (has_prev) {
            float td = (float)p.reward + V(p.after) - V(prev_after);
            update_weights(prev_after, td * per_feature);
        }
        board = spawn_tile_rng(p.after, rng);
        prev_after = p.after;
        has_prev = true;
        if (moves > 30000) break;
    }
    return { score, max_tile(board), moves };
}

/* ===== weight save / load in our .w format ===== */
static const u32 SIGNATURES[FEATURE_COUNT] = {0x012345, 0x456789, 0x012456, 0x45689a};

static void save_weights(const char* path) {
    std::ofstream out(path, std::ios::binary);
    u8 wrap = 0;        out.write((char*)&wrap, 1);
    u32 num = FEATURE_COUNT; out.write((char*)&num, 4);
    for (int i = 0; i < FEATURE_COUNT; i++) {
        u8  code = 4;   out.write((char*)&code, 1);
        u32 sign = SIGNATURES[i]; out.write((char*)&sign, 4);
        u16 z16 = 0;    out.write((char*)&z16, 2);
        out.write((char*)&z16, 2);
        u16 blkz = 4;   out.write((char*)&blkz, 2);
        u64 length = PATTERN_SIZE; out.write((char*)&length, 8);
        out.write((char*)WEIGHTS[i].data(), length * sizeof(float));
        out.write((char*)&z16, 2);
    }
}

static bool load_weights(const char* path) {
    std::ifstream in(path, std::ios::binary);
    if (!in) return false;
    u8 wrap; in.read((char*)&wrap, 1);
    u32 num; in.read((char*)&num, 4);
    if (wrap != 0 || num != FEATURE_COUNT) return false;
    for (u32 i = 0; i < num; i++) {
        u8 code; in.read((char*)&code, 1);
        u32 sign; in.read((char*)&sign, 4);
        u16 z; in.read((char*)&z, 2); in.read((char*)&z, 2);
        u16 blkz; in.read((char*)&blkz, 2);
        u64 length; in.read((char*)&length, 8);
        if (blkz != 4 || length != PATTERN_SIZE) return false;
        in.read((char*)WEIGHTS[i].data(), length * sizeof(float));
        u16 term; in.read((char*)&term, 2);
        /* coherence extras: skip */
        while (term != 0) {
            u64 xlen; in.read((char*)&xlen, 8);
            in.seekg((std::streamoff)(xlen * term), std::ios::cur);
            in.read((char*)&term, 2);
        }
    }
    return (bool)in;
}

int main(int argc, char** argv) {
    int episodes = (argc > 1) ? std::atoi(argv[1]) : 100000;
    float alpha  = (argc > 2) ? (float)std::atof(argv[2]) : 0.0025f;
    const char* out_path = (argc > 3) ? argv[3] : "public/weights/4x6patt.trained.w";
    const char* in_path  = (argc > 4) ? argv[4] : "";

    std::printf("4x6patt TD(0) trainer\n");
    std::printf("episodes=%d alpha=%.4f out=%s in=%s\n", episodes, alpha, out_path, in_path);

    build_row_lut();
    build_iso_table();
    for (int i = 0; i < FEATURE_COUNT; i++) {
        WEIGHTS[i].assign(PATTERN_SIZE, 0.0f);
    }
    if (in_path[0] && load_weights(in_path)) {
        std::printf("loaded existing weights from %s\n", in_path);
    } else if (in_path[0]) {
        std::printf("WARNING: failed to load %s, starting from zero\n", in_path);
    }

    std::mt19937 rng(42);
    auto t0 = std::chrono::steady_clock::now();

    /* rolling stats over last 1000 episodes */
    constexpr int WIN = 1000;
    std::vector<u32> win_scores; win_scores.reserve(WIN);
    int hit_2048 = 0, hit_4096 = 0, hit_8192 = 0;
    int win_2048 = 0, win_4096 = 0, win_8192 = 0;

    for (int ep = 1; ep <= episodes; ep++) {
        EpiResult r = train_episode(rng, alpha);
        win_scores.push_back(r.score);
        if (r.max_log >= 11) hit_2048++, win_2048++;
        if (r.max_log >= 12) hit_4096++, win_4096++;
        if (r.max_log >= 13) hit_8192++, win_8192++;
        if (ep % WIN == 0) {
            u64 sum = 0;
            u32 mx = 0;
            for (u32 s : win_scores) { sum += s; if (s > mx) mx = s; }
            double avg = double(sum) / double(win_scores.size());
            auto now = std::chrono::steady_clock::now();
            double secs = std::chrono::duration<double>(now - t0).count();
            std::printf("ep=%d  avg=%.0f  max=%u  2048=%d/%d 4096=%d/%d 8192=%d/%d  rate=%.0f ep/s\n",
                ep, avg, mx, win_2048, WIN, win_4096, WIN, win_8192, WIN, double(ep) / secs);
            std::fflush(stdout);
            win_scores.clear();
            win_2048 = win_4096 = win_8192 = 0;
        }
    }

    auto t1 = std::chrono::steady_clock::now();
    double secs = std::chrono::duration<double>(t1 - t0).count();
    std::printf("training done: %d episodes in %.1f s (%.0f ep/s)\n", episodes, secs, episodes / secs);
    std::printf("cumulative: 2048=%d/%d (%.1f%%) 4096=%d/%d (%.1f%%) 8192=%d/%d (%.1f%%)\n",
        hit_2048, episodes, 100.0 * hit_2048 / episodes,
        hit_4096, episodes, 100.0 * hit_4096 / episodes,
        hit_8192, episodes, 100.0 * hit_8192 / episodes);

    std::printf("saving weights to %s ...\n", out_path);
    save_weights(out_path);
    std::printf("done.\n");
    return 0;
}
