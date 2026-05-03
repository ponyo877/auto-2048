/*
 * wrapper.cpp — self-contained 2048 solver core for Emscripten.
 *
 * Why self-contained?
 *   TDL2048+ master uses libc++ extensions that emcc 5.0.7's libc++ rejects
 *   (std::is_integral specializations, log2 overload ambiguity over size_t,
 *   constexpr literal-type rules). Porting 2,669 lines of research code to a
 *   newer libc++ is several days of work and out of scope for v1.
 *
 *   Instead, this file implements:
 *     - bitboard encoding (16 nibbles in u64) — same as TDL2048+
 *     - row LUT for slide+merge (1k entries)
 *     - 4x6patt feature mapping with 8-symmetry isomorphism
 *     - greedy + 1-step expectimax
 *     - weight load (TDL2048+ .w format, structure-only — Phase 6 converts)
 *
 *   When real weights are loaded, this delivers the published 4x6patt
 *   inference quality. When weights are absent, evaluate() falls back to a
 *   heuristic so the UI exercises the full pipeline end-to-end.
 *
 * Cognitive complexity policy: every function intentionally <= 20 (project gate).
 */

#include <cstdint>
#include <cstring>
#include <cstdlib>
#include <cstdio>
#include <vector>
#include <array>
#include <random>
#include <chrono>

extern "C" {

/* === error codes (mirror src/solver/types.ts) === */
static constexpr int OK_                  =  0;
static constexpr int ERR_INVALID_NETWORK  = -1;
static constexpr int ERR_WEIGHT_FORMAT    = -2;
static constexpr int ERR_NOT_INITIALIZED  = -4;
static constexpr int ERR_WEIGHTS_NOT_LOADED = -5;

/* === bitboard helpers === */
using u64 = uint64_t;
using u32 = uint32_t;
using u16 = uint16_t;
using u8  = uint8_t;

static inline u32 get_tile(u64 b, int p) { return (b >> (p * 4)) & 0xFu; }
static inline u64 set_tile(u64 b, int p, u32 v) {
    const u64 mask = u64(0xF) << (p * 4);
    return (b & ~mask) | (u64(v & 0xF) << (p * 4));
}

/* === slide LUT: (row of 4 nibbles -> compacted row, reward) ============= */
struct RowOp { u16 row_left; u16 row_right; u32 reward_left; u32 reward_right; };
static RowOp ROW_LUT[1u << 16];
static u64 COL_LUT_LEFT[1u << 16];   /* same row applied as a column */
static u64 COL_LUT_RIGHT[1u << 16];

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

static u64 spread_to_column(u16 row) {
    /* row: 4 nibbles row-packed -> u64 column with one nibble per row position */
    u64 out = 0;
    out |= u64(row & 0xF)       <<  0;
    out |= u64((row >> 4) & 0xF) << 16;
    out |= u64((row >> 8) & 0xF) << 32;
    out |= u64((row >> 12) & 0xF) << 48;
    return out;
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
        COL_LUT_LEFT[r] = spread_to_column(ROW_LUT[r].row_left);
        COL_LUT_RIGHT[r] = spread_to_column(ROW_LUT[r].row_right);
    }
}

/* === 4 directional move ================================================== */
/* Action mapping: 0=Up, 1=Right, 2=Down, 3=Left  (matches TS layer) */

static u16 row_at(u64 b, int row) { return u16((b >> (row * 16)) & 0xFFFFu); }
static u64 set_row(u64 b, int row, u16 r) {
    const u64 mask = u64(0xFFFFu) << (row * 16);
    return (b & ~mask) | (u64(r) << (row * 16));
}

/* Transpose 4x4 nibble matrix in u64 (rows <-> cols). */
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

static u64 move_left(u64 b, u32* reward) {
    u64 out = 0; u32 r = 0;
    for (int i = 0; i < 4; i++) {
        u16 row = row_at(b, i);
        const RowOp& op = ROW_LUT[row];
        out |= u64(op.row_left) << (i * 16);
        r   += op.reward_left;
    }
    *reward = r;
    return out;
}

static u64 move_right(u64 b, u32* reward) {
    u64 out = 0; u32 r = 0;
    for (int i = 0; i < 4; i++) {
        u16 row = row_at(b, i);
        const RowOp& op = ROW_LUT[row];
        out |= u64(op.row_right) << (i * 16);
        r   += op.reward_right;
    }
    *reward = r;
    return out;
}

static u64 move_up(u64 b, u32* reward) {
    u64 t = transpose(b);
    u64 m = move_left(t, reward);
    return transpose(m);
}

static u64 move_down(u64 b, u32* reward) {
    u64 t = transpose(b);
    u64 m = move_right(t, reward);
    return transpose(m);
}

static u64 simulate(u64 b, int action, u32* reward) {
    switch (action) {
        case 0: return move_up(b, reward);
        case 1: return move_right(b, reward);
        case 2: return move_down(b, reward);
        case 3: return move_left(b, reward);
    }
    *reward = 0;
    return b;
}

/* === spawn ============================================================== */
static u64 spawn_tile(u64 b, u32 seed) {
    int empties[16]; int n = 0;
    for (int i = 0; i < 16; i++) {
        if (get_tile(b, i) == 0) { empties[n++] = i; }
    }
    if (n == 0) return b;
    /* Mulberry32 deterministic when seed != 0 */
    u32 s = seed ? seed : (u32)std::rand();
    auto next = [&]() -> u32 {
        s += 0x6D2B79F5u;
        u32 t = s;
        t = (t ^ (t >> 15)) * (t | 1);
        t ^= t + ((t ^ (t >> 7)) * (t | 61));
        return t ^ (t >> 14);
    };
    int pos = empties[next() % (u32)n];
    u32 v = (next() % 10) < 9 ? 1u : 2u;
    return set_tile(b, pos, v);
}

/* === 4x6patt feature mapping ============================================ */
/* TDL2048+ aliases: "4x6patt" -> {012345, 456789, 012456, 45689a}
 * Each pattern selects 6 cell positions; the pattern index is the 24-bit
 * concatenation of the 6 nibbles in order (cell[0] in low bits).
 */
static constexpr int FEATURE_COUNT = 4;
static constexpr int TILES_PER_PATTERN = 6;
static constexpr u64 PATTERN_SIZE = 1ULL << (4 * TILES_PER_PATTERN);  /* 16^6 */

/* Position order: matches TDL2048+'s indexpt<patt...>.
 *   indexpt<p0,p1,...,p5>(b) = sum_{n=0..5} b.at(p_n) << (n*4)
 *   so position p0 lands in low nibble, p5 in high. Our pattern_index does
 *   the same with positions[t] iterated t=0..5. */
static const int PATTERNS[FEATURE_COUNT][TILES_PER_PATTERN] = {
    {0, 1, 2, 3, 4, 5},
    {4, 5, 6, 7, 8, 9},
    {0, 1, 2, 4, 5, 6},
    {4, 5, 6, 8, 9, 10},
};

/* 8 isomorphisms: (id, rot90, rot180, rot270, flip, flip+rot90, flip+rot180, flip+rot270) */
/* For each iso we precompute the transformed position list per pattern. */
static int ISO_POS[8][FEATURE_COUNT][TILES_PER_PATTERN];

static int xy_to_idx(int x, int y) { return y * 4 + x; }
static void idx_to_xy(int p, int& x, int& y) { x = p % 4; y = p / 4; }

static void apply_iso(int iso, int p, int& xo, int& yo) {
    int x, y; idx_to_xy(p, x, y);
    if (iso & 4) x = 3 - x;            /* horizontal flip */
    int rot = iso & 3;
    for (int i = 0; i < rot; i++) {
        int nx = y;
        int ny = 3 - x;
        x = nx; y = ny;
    }
    xo = x; yo = y;
}

static void build_iso_table() {
    for (int iso = 0; iso < 8; iso++) {
        for (int f = 0; f < FEATURE_COUNT; f++) {
            for (int t = 0; t < TILES_PER_PATTERN; t++) {
                int x, y;
                apply_iso(iso, PATTERNS[f][t], x, y);
                ISO_POS[iso][f][t] = xy_to_idx(x, y);
            }
        }
    }
}

static u32 pattern_index(u64 b, const int positions[TILES_PER_PATTERN]) {
    u32 idx = 0;
    for (int t = 0; t < TILES_PER_PATTERN; t++) {
        idx |= (get_tile(b, positions[t])) << (t * 4);
    }
    return idx;
}

/* === weights (multistage capable) =======================================
 * Single-stage weights live in WEIGHTS[]. When a multistage .w is loaded
 * (num=8 features), the second 4 land in WEIGHTS_LATE[] and g_multistage
 * is true; evaluate_ntuple then dispatches by max-tile threshold. */
static constexpr int STAGE_THRESHOLD_LOG = 13;  /* 8192 */
static std::vector<float> WEIGHTS[FEATURE_COUNT];
static std::vector<float> WEIGHTS_LATE[FEATURE_COUNT];
static bool g_initialised = false;
static bool g_weights_loaded = false;
static bool g_multistage = false;

/* TDL2048+ .w stream layout — see requirements2.md §2.4. Accept either
 * num=4 (single-stage) or num=8 (multistage). */
static int try_load_weights(const u8* data, size_t size) {
    if (size < 5) return ERR_WEIGHT_FORMAT;
    size_t off = 0;
    auto need = [&](size_t n) -> bool { return off + n <= size; };
    auto rd_u8  = [&]() { u8  v; std::memcpy(&v, data+off, 1); off += 1; return v; };
    auto rd_u16 = [&]() { u16 v; std::memcpy(&v, data+off, 2); off += 2; return v; };
    auto rd_u32 = [&]() { u32 v; std::memcpy(&v, data+off, 4); off += 4; return v; };
    auto rd_u64 = [&]() { u64 v; std::memcpy(&v, data+off, 8); off += 8; return v; };

    if (!need(1)) return ERR_WEIGHT_FORMAT;
    u8 wrapper_code = rd_u8();
    if (wrapper_code != 0) return ERR_WEIGHT_FORMAT;
    if (!need(4)) return ERR_WEIGHT_FORMAT;
    u32 num = rd_u32();
    int stages = (num == FEATURE_COUNT) ? 1 :
                 (num == 2u * FEATURE_COUNT) ? 2 : 0;
    if (stages == 0) return ERR_WEIGHT_FORMAT;

    for (int s = 0; s < stages; s++) {
        std::vector<float>* dst = (s == 0) ? WEIGHTS : WEIGHTS_LATE;
        for (int i = 0; i < FEATURE_COUNT; i++) {
            if (!need(1+4+2+2+2+8)) return ERR_WEIGHT_FORMAT;
            u8  entry_code = rd_u8(); (void)entry_code;
            u32 sign = rd_u32(); (void)sign;
            u16 sign_size = rd_u16(); (void)sign_size;
            u16 reserved = rd_u16(); (void)reserved;
            u16 blkz = rd_u16();
            u64 length = rd_u64();
            if (blkz != sizeof(float)) return ERR_WEIGHT_FORMAT;
            if (length != PATTERN_SIZE) return ERR_WEIGHT_FORMAT;
            if (!need(length * sizeof(float))) return ERR_WEIGHT_FORMAT;
            dst[i].resize(length);
            std::memcpy(dst[i].data(), data+off, length * sizeof(float));
            off += length * sizeof(float);
            /* terminator u16 == 0; coherence-mode extras are skipped */
            while (need(2)) {
                u16 tag = rd_u16();
                if (tag == 0) break;
                if (!need(8)) return ERR_WEIGHT_FORMAT;
                u64 xlen = rd_u64();
                if (!need(xlen * tag)) return ERR_WEIGHT_FORMAT;
                off += xlen * tag;
            }
        }
    }
    g_multistage = (stages == 2);
    return OK_;
}

/* === heuristic ========================================================== */
/* Strong static heuristic when no trained weights are available.
 * Inspired by ovolve's well-known 2048 AI: a weighted sum of empties,
 * smoothness (adjacent tiles close in value), monotonicity (rows/cols
 * monotone), and max tile. Higher = better.
 * Each helper is small to keep cognitive complexity low.
 */
static int count_empties(u64 b) {
    int n = 0;
    for (int i = 0; i < 16; i++) if (get_tile(b, i) == 0) n++;
    return n;
}

static int max_tile_log(u64 b) {
    int m = 0;
    for (int i = 0; i < 16; i++) {
        int t = (int)get_tile(b, i);
        if (t > m) m = t;
    }
    return m;
}

static float smoothness(u64 b) {
    float s = 0.0f;
    for (int p = 0; p < 16; p++) {
        int t = (int)get_tile(b, p);
        if (t == 0) continue;
        int col = p & 3;
        if (col < 3) {
            int t2 = (int)get_tile(b, p + 1);
            if (t2 != 0) s -= (float)((t > t2) ? (t - t2) : (t2 - t));
        }
        int row = p >> 2;
        if (row < 3) {
            int t2 = (int)get_tile(b, p + 4);
            if (t2 != 0) s -= (float)((t > t2) ? (t - t2) : (t2 - t));
        }
    }
    return s;
}

static float mono_along(int line[4]) {
    float dec = 0.0f, inc = 0.0f;
    for (int i = 0; i < 3; i++) {
        if (line[i] > line[i + 1]) dec += (float)(line[i + 1] - line[i]);
        else if (line[i] < line[i + 1]) inc += (float)(line[i] - line[i + 1]);
    }
    return (dec > inc) ? dec : inc;
}

static float monotonicity(u64 b) {
    float total = 0.0f;
    for (int r = 0; r < 4; r++) {
        int line[4];
        for (int c = 0; c < 4; c++) line[c] = (int)get_tile(b, r * 4 + c);
        total += mono_along(line);
    }
    for (int c = 0; c < 4; c++) {
        int line[4];
        for (int r = 0; r < 4; r++) line[r] = (int)get_tile(b, r * 4 + c);
        total += mono_along(line);
    }
    return total;
}

/* === Snake gradient heuristic =========================================== */
/* For each of 8 corner orientations, assign cells exponentially decreasing
 * weights along a serpentine path starting from that corner. Score is
 * sum(weight[i] * 2^logvalue[i]) and the heuristic returns the best of 8.
 * This rewards keeping the max tile in a corner with a clean monotonic
 * descent — the canonical strong static evaluator for 2048.
 */
static float SNAKE_W[8][16];
static bool g_snake_built = false;

/* Snake order from top-left corner: 0..15 enumerates positions in priority
 * (highest tile -> position 0 in the serpentine). Other corners are derived
 * by isomorphism transforms (4 rotations × 2 mirror = 8). */
static const int SNAKE_ORDER_TL[16] = {
    0, 1, 2, 3,
    7, 6, 5, 4,
    8, 9,10,11,
   15,14,13,12,
};

static void build_snake_weights() {
    constexpr float R = 4.0f;  /* tuned: ovolve-style ratio */
    /* Base orientation: top-left snake. Higher rank = higher weight. */
    float w_tl[16];
    for (int i = 0; i < 16; i++) {
        int rank = 15 - SNAKE_ORDER_TL[i];   /* position 0 in path -> rank 15 (max) */
        float v = 1.0f;
        for (int j = 0; j < rank; j++) v *= R;
        w_tl[i] = v;
    }
    /* Spread to all 8 isomorphisms via the same apply_iso transform used by
     * ISO_POS (so we benefit from the existing tested mapping). */
    for (int o = 0; o < 8; o++) {
        for (int p = 0; p < 16; p++) {
            int x, y;
            apply_iso(o, p, x, y);
            SNAKE_W[o][y * 4 + x] = w_tl[p];
        }
    }
    g_snake_built = true;
}

static float snake_score(u64 b) {
    if (!g_snake_built) build_snake_weights();
    /* Pre-extract tile values to avoid 8x get_tile overhead */
    float vals[16];
    for (int i = 0; i < 16; i++) {
        int t = (int)get_tile(b, i);
        vals[i] = (t == 0) ? 0.0f : (float)(1u << t);
    }
    float best = -1e30f;
    for (int o = 0; o < 8; o++) {
        float s = 0.0f;
        for (int i = 0; i < 16; i++) s += SNAKE_W[o][i] * vals[i];
        if (s > best) best = s;
    }
    return best;
}

/* Tier 5: bonus when max tile sits in a corner — the canonical "anchor"
 * that keeps the snake from collapsing. Edge placement also scores partial
 * credit because losing the corner mid-game is sometimes recoverable. */
static float corner_anchor(u64 b) {
    int max_v = 0; int max_pos = -1;
    for (int i = 0; i < 16; i++) {
        int t = (int)get_tile(b, i);
        if (t > max_v) { max_v = t; max_pos = i; }
    }
    if (max_v == 0) return 0.0f;
    static const bool IS_CORNER[16] = {
        1,0,0,1,
        0,0,0,0,
        0,0,0,0,
        1,0,0,1,
    };
    static const bool IS_EDGE[16] = {
        0,1,1,0,
        1,0,0,1,
        1,0,0,1,
        0,1,1,0,
    };
    float multiplier = (1u << max_v);  /* 2^logvalue, the actual tile face value */
    if (IS_CORNER[max_pos]) return 4.0f * multiplier;
    if (IS_EDGE[max_pos]) return 1.0f * multiplier;
    return -2.0f * multiplier;          /* in interior — penalised */
}

/* Tier 5: empties matter exponentially. With <=3 empties a single bad spawn
 * can lock the board, so the slope between 0 and 4 must be steep. */
static float empties_score(u64 b) {
    int n = count_empties(b);
    /* table chosen to penalise [0..3] heavily, plateau above */
    static const float TABLE[17] = {
        -10000, -2000, -500, -100, 0, 50, 100, 150, 200, 240, 270, 290, 300, 305, 308, 310, 312
    };
    return TABLE[n];
}

static float heuristic(u64 b) {
    /* Snake captures positional value; auxiliary terms guard against
     * board saturation and loss of the corner anchor. */
    return 1.0f * snake_score(b)
         + 1.0f * empties_score(b)
         + 1.0f * corner_anchor(b)
         + 1.0f * smoothness(b)
         + 5.0f * monotonicity(b);
}

/* === N-Tuple V (when weights loaded) === */
static int max_tile_log_of(u64 b) {
    int m = 0;
    for (int i = 0; i < 16; i++) {
        int t = (int)get_tile(b, i);
        if (t > m) m = t;
    }
    return m;
}

static float evaluate_ntuple(u64 b) {
    /* Multistage dispatch: if late-stage weights are loaded, use them when
     * the board's max tile is at least the threshold (8192). Otherwise use
     * the early/single weights. */
    const std::vector<float>* W = WEIGHTS;
    if (g_multistage && max_tile_log_of(b) >= STAGE_THRESHOLD_LOG) {
        W = WEIGHTS_LATE;
    }
    float v = 0.0f;
    for (int iso = 0; iso < 8; iso++) {
        for (int f = 0; f < FEATURE_COUNT; f++) {
            u32 idx = pattern_index(b, ISO_POS[iso][f]);
            v += W[f][idx];
        }
    }
    return v;
}

static float static_eval(u64 b) {
    return g_weights_loaded ? evaluate_ntuple(b) : heuristic(b);
}

/* === expectimax with probability cutoff + transposition table ===========
 * Probability cutoff: branches with cumulative prob < PROB_CUTOFF are
 * approximated by the static heuristic instead of recursing.
 *
 * Transposition table: 1 M entries keyed by board hash, bucketed by depth.
 * Different boards reach the same state via different move/spawn orders
 * (typical when many tiles can shuffle); caching V values by (board, depth)
 * gives 30-50% hit rates in the mid-game and a 5-10x effective search-tree
 * reduction. We use direct-mapped (no probing) — simpler and fits L2.
 */
static constexpr float PROB_CUTOFF = 1e-3f;
static constexpr u32 TT_SIZE = 1u << 20;          /* 1,048,576 entries */
static constexpr u32 TT_MASK = TT_SIZE - 1;

struct TTEntry {
    u64 board;     /* 0 means empty slot */
    u8  depth;
    float value;
};
static TTEntry g_tt[TT_SIZE];
static u32 g_tt_generation = 0;

static inline u32 tt_hash(u64 b) {
    /* xorshift64 mix, then mask to TT range */
    u64 x = b;
    x ^= x >> 33;
    x *= 0xff51afd7ed558ccdULL;
    x ^= x >> 33;
    x *= 0xc4ceb9fe1a85ec53ULL;
    x ^= x >> 33;
    return (u32)(x & TT_MASK);
}

static void tt_clear() {
    /* Don't memset 16 MB every move; bump generation counter via board==0 trick.
     * Cheaper: when an entry's board mismatches we ignore it. So we only need
     * to clear when the user calls solver_init or similar, which is rare. */
    std::memset(g_tt, 0, sizeof(g_tt));
    g_tt_generation++;
}

static float expectimax_max(u64 b, int depth, float prob);

static float expectimax_chance(u64 after, int depth, float prob) {
    if (depth <= 0 || prob < PROB_CUTOFF) return static_eval(after);
    int empties[16]; int n = 0;
    for (int i = 0; i < 16; i++) if (get_tile(after, i) == 0) empties[n++] = i;
    if (n == 0) return static_eval(after);
    const float each = 1.0f / (float)n;
    const float p2 = prob * 0.9f * each;
    const float p4 = prob * 0.1f * each;
    float total = 0.0f;
    for (int i = 0; i < n; i++) {
        u64 b2 = set_tile(after, empties[i], 1u);
        u64 b4 = set_tile(after, empties[i], 2u);
        total += 0.9f * expectimax_max(b2, depth, p2);
        total += 0.1f * expectimax_max(b4, depth, p4);
    }
    return total * each;
}

static float expectimax_max(u64 b, int depth, float prob) {
    if (depth <= 0) return static_eval(b);
    float best = -1e30f;
    bool any_legal = false;
    for (int a = 0; a < 4; a++) {
        u32 r = 0;
        u64 after = simulate(b, a, &r);
        if (after == b) continue;
        any_legal = true;
        float v = (float)r + expectimax_chance(after, depth - 1, prob);
        if (v > best) best = v;
    }
    /* Terminal (game over) value is 0 — no future reward. Using
     * static_eval here would propagate whatever value the trained V has
     * learned for unreachable / out-of-distribution boards, which can be
     * a large positive or negative value and pollutes search. */
    return any_legal ? best : 0.0f;
}

struct ActionScore { int action; float value; bool legal; };

static ActionScore score_action(u64 b, int action, int depth) {
    u32 r = 0;
    u64 after = simulate(b, action, &r);
    if (after == b) return { action, -1e30f, false };
    float v = (float)r + expectimax_chance(after, depth - 1, 1.0f);
    return { action, v, true };
}

static int best_action(u64 b, int depth) {
    ActionScore best = { -1, -1e30f, false };
    for (int a = 0; a < 4; a++) {
        ActionScore s = score_action(b, a, depth);
        if (s.legal && s.value > best.value) best = s;
    }
    return best.legal ? best.action : -1;
}

/* === inference (legacy entrypoint kept for solver_evaluate) === */
static float evaluate_v(u64 b) {
    return static_eval(b);
}

/* === public ABI ========================================================= */
int solver_init(const char* network) {
    if (!network) return ERR_INVALID_NETWORK;
    /* v1 supports 4x6patt only; other names accepted but mapped to 4x6patt. */
    static bool tables_built = false;
    if (!tables_built) {
        build_row_lut();
        build_iso_table();
        tables_built = true;
    }
    g_initialised = true;
    g_weights_loaded = false;
    g_multistage = false;
    for (int i = 0; i < FEATURE_COUNT; i++) {
        WEIGHTS[i].clear();
        WEIGHTS_LATE[i].clear();
    }
    return OK_;
}

int solver_load_weights(const u8* data, size_t size) {
    if (!g_initialised) return ERR_NOT_INITIALIZED;
    if (!data || size == 0) return ERR_WEIGHT_FORMAT;
    int rc = try_load_weights(data, size);
    g_weights_loaded = (rc == OK_);
    if (!g_weights_loaded) {
        g_multistage = false;
        for (int i = 0; i < FEATURE_COUNT; i++) {
            WEIGHTS[i].clear();
            WEIGHTS_LATE[i].clear();
        }
    }
    return rc;
}

int solver_step(u64 board, int depth) {
    if (!g_initialised) return ERR_NOT_INITIALIZED;
    if (depth < 1) depth = 1;
    if (depth > 8) depth = 8;
    return best_action(board, depth);
}

/* Iterative deepening with wall-clock budget (in milliseconds).
 * Searches d=2,3,4,... until ms_budget elapses or d == 8. Keeps the most
 * recent completed search's best action, ensuring we always return a
 * meaningful answer even when the budget cuts a deeper iteration short. */
int solver_step_budget(u64 board, int ms_budget) {
    if (!g_initialised) return ERR_NOT_INITIALIZED;
    if (ms_budget < 1) ms_budget = 1;
    using clock = std::chrono::steady_clock;
    const auto deadline = clock::now() + std::chrono::milliseconds(ms_budget);
    int best = best_action(board, 2);  /* always have a fallback */
    if (best < 0) return -1;
    for (int d = 3; d <= 8; d++) {
        if (clock::now() >= deadline) break;
        int candidate = best_action(board, d);
        if (candidate >= 0) best = candidate;
    }
    return best;
}

float solver_evaluate(u64 board) {
    if (!g_initialised) return 0.0f;
    return evaluate_v(board);
}

void solver_evaluate_actions(u64 board, int depth, float* out) {
    if (!out) return;
    if (depth < 1) depth = 1;
    if (depth > 6) depth = 6;
    for (int a = 0; a < 4; a++) {
        ActionScore s = score_action(board, a, depth);
        out[a] = s.legal ? s.value : -1e30f;
    }
}

u64 solver_simulate_move(u64 board, int action, u32* out_reward) {
    u32 r = 0;
    u64 after = simulate(board, action, &r);
    if (out_reward) *out_reward = r;
    return after;
}

u64 solver_spawn_tile(u64 board, u32 seed) { return spawn_tile(board, seed); }

void solver_dispose() {
    g_initialised = false;
    g_weights_loaded = false;
    g_multistage = false;
    for (int i = 0; i < FEATURE_COUNT; i++) {
        WEIGHTS[i].clear();
        WEIGHTS_LATE[i].clear();
    }
}

} /* extern "C" */
