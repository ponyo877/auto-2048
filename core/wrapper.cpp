/*
 * wrapper.cpp — minimal 4x6patt N-Tuple solver for the browser.
 *
 * Built into a WASM module via core/build.sh. Loaded by src/solver/wasm-solver.ts
 * over a small extern "C" ABI:
 *
 *   solver_init(network)             register the 4x6patt feature layout
 *   solver_load_weights(data, size)  parse the .w stream into WEIGHTS[]
 *   solver_step(board, depth)        return best action via expectimax
 *   solver_dispose()                 release weights / mark uninitialised
 *
 * The .w format is the structure-only TDL2048+ layout — see the bench
 * doc at docs/bench/100game_official_d3.md. Weights live in WEIGHTS[],
 * one std::vector<float> per feature (16,777,216 floats = 64 MB each).
 */

#include <cstdint>
#include <cstring>
#include <vector>

extern "C" {

/* === error codes (mirror src/solver/types.ts) === */
static constexpr int OK_                  =  0;
static constexpr int ERR_INVALID_NETWORK  = -1;
static constexpr int ERR_WEIGHT_FORMAT    = -2;
static constexpr int ERR_NOT_INITIALIZED  = -4;

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

/* === slide LUT: (row of 4 nibbles -> compacted row, reward) =============== */
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

/* === 4 directional move ================================================== */
/* Action mapping: 0=Up, 1=Right, 2=Down, 3=Left (matches the TS layer). */

static u16 row_at(u64 b, int row) { return u16((b >> (row * 16)) & 0xFFFFu); }

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

/* === 4x6patt feature mapping ============================================ */
/* "4x6patt" = "012345 456789 012456 45689a" (TDL2048+ alias).
 * indexpt<p0,p1,...,p5>(b) packs b.at(p0) into bits 0-3 and b.at(p5) into
 * bits 20-23 (low first). Our pattern_index does the same. */
static constexpr int FEATURE_COUNT = 4;
static constexpr int TILES_PER_PATTERN = 6;
static constexpr u64 PATTERN_SIZE = 1ULL << (4 * TILES_PER_PATTERN);  /* 16^6 */

static const int PATTERNS[FEATURE_COUNT][TILES_PER_PATTERN] = {
    {0, 1, 2, 3, 4, 5},
    {4, 5, 6, 7, 8, 9},
    {0, 1, 2, 4, 5, 6},
    {4, 5, 6, 8, 9, 10},
};

/* 8 isomorphisms (D4 group): identity, rotations, flips. We precompute
 * the transformed positions per pattern so evaluate_ntuple does 32
 * lookups per call without per-call recomputation. */
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

/* === weights ============================================================ */
static std::vector<float> WEIGHTS[FEATURE_COUNT];
static bool g_initialised = false;
static bool g_weights_loaded = false;

/* TDL2048+ structure-only .w stream: 5-byte header, then per feature
 * 19 bytes of metadata + 16M × 4 bytes of weight + a u16 = 0 terminator.
 * Coherence-mode files include extra blkz blocks before the terminator;
 * we skip them harmlessly via the inner while-loop. */
static int try_load_weights(const u8* data, size_t size) {
    if (size < 5) return ERR_WEIGHT_FORMAT;
    size_t off = 0;
    auto need = [&](size_t n) -> bool { return off + n <= size; };
    auto rd_u8  = [&]() { u8  v; std::memcpy(&v, data+off, 1); off += 1; return v; };
    auto rd_u16 = [&]() { u16 v; std::memcpy(&v, data+off, 2); off += 2; return v; };
    auto rd_u32 = [&]() { u32 v; std::memcpy(&v, data+off, 4); off += 4; return v; };
    auto rd_u64 = [&]() { u64 v; std::memcpy(&v, data+off, 8); off += 8; return v; };

    if (!need(1)) return ERR_WEIGHT_FORMAT;
    if (rd_u8() != 0) return ERR_WEIGHT_FORMAT;       /* wrapper code */
    if (!need(4)) return ERR_WEIGHT_FORMAT;
    u32 num = rd_u32();
    if (num != FEATURE_COUNT) return ERR_WEIGHT_FORMAT;

    for (int i = 0; i < FEATURE_COUNT; i++) {
        if (!need(1+4+2+2+2+8)) return ERR_WEIGHT_FORMAT;
        (void)rd_u8();                                /* entry code */
        (void)rd_u32();                               /* sign */
        (void)rd_u16();                               /* sign size (legacy) */
        (void)rd_u16();                               /* reserved */
        u16 blkz = rd_u16();
        u64 length = rd_u64();
        if (blkz != sizeof(float)) return ERR_WEIGHT_FORMAT;
        if (length != PATTERN_SIZE) return ERR_WEIGHT_FORMAT;
        if (!need(length * sizeof(float))) return ERR_WEIGHT_FORMAT;
        WEIGHTS[i].resize(length);
        std::memcpy(WEIGHTS[i].data(), data+off, length * sizeof(float));
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
    return OK_;
}

/* === N-Tuple V over 8 isomorphisms × 4 features = 32 lookups ============ */
static float static_eval(u64 b) {
    float v = 0.0f;
    for (int iso = 0; iso < 8; iso++) {
        for (int f = 0; f < FEATURE_COUNT; f++) {
            u32 idx = pattern_index(b, ISO_POS[iso][f]);
            v += WEIGHTS[f][idx];
        }
    }
    return v;
}

/* === expectimax ========================================================= */
/* Per-branch cumulative probability `prob` lets us approximate deep
 * unlikely chance branches with the static V instead of recursing —
 * roughly +1 to +2 effective plies for the same wall-clock time. */
static constexpr float PROB_CUTOFF = 1e-3f;

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
    /* Terminal value is 0 (no future reward). Reading static_eval here
     * would propagate whatever V the trained network has learned for
     * unreachable game-over states, polluting search at depth >= 2. */
    return any_legal ? best : 0.0f;
}

static int best_action(u64 b, int depth) {
    int best_a = -1;
    float best_v = -1e30f;
    for (int a = 0; a < 4; a++) {
        u32 r = 0;
        u64 after = simulate(b, a, &r);
        if (after == b) continue;
        float v = (float)r + expectimax_chance(after, depth - 1, 1.0f);
        if (v > best_v) { best_v = v; best_a = a; }
    }
    return best_a;
}

/* === public ABI ========================================================= */
int solver_init(const char* network) {
    if (!network) return ERR_INVALID_NETWORK;
    /* "4x6patt" is the only supported alias; other names are accepted but
     * mapped to it (TDL2048+'s default network). */
    static bool tables_built = false;
    if (!tables_built) {
        build_row_lut();
        build_iso_table();
        tables_built = true;
    }
    g_initialised = true;
    g_weights_loaded = false;
    for (int i = 0; i < FEATURE_COUNT; i++) WEIGHTS[i].clear();
    return OK_;
}

int solver_load_weights(const u8* data, size_t size) {
    if (!g_initialised) return ERR_NOT_INITIALIZED;
    if (!data || size == 0) return ERR_WEIGHT_FORMAT;
    int rc = try_load_weights(data, size);
    g_weights_loaded = (rc == OK_);
    if (!g_weights_loaded) for (int i = 0; i < FEATURE_COUNT; i++) WEIGHTS[i].clear();
    return rc;
}

int solver_step(u64 board, int depth) {
    if (!g_initialised) return ERR_NOT_INITIALIZED;
    if (depth < 1) depth = 1;
    if (depth > 8) depth = 8;
    return best_action(board, depth);
}

void solver_dispose() {
    g_initialised = false;
    g_weights_loaded = false;
    for (int i = 0; i < FEATURE_COUNT; i++) WEIGHTS[i].clear();
}

} /* extern "C" */
