# 2048 RL Solver Web — 実装計画書 v2

ブラウザ上で 2048 を学習済み N-Tuple Network エージェントが自動プレイするデモアプリ。
コアは [TDL2048+](https://github.com/moporgic/TDL2048)(MIT License, Hung Guei 2021)を Emscripten で WASM 化したもの。

本書は `requirements.md` の素案を、TDL2048+ 本体の実コードを直接調査した結果に基づき**現実的な実装計画**に書き直したものである。素案からの主な変更点は §0 にまとめた。

---

## 0. 素案 (`requirements.md`) からの変更点(要約)

| 観点 | 素案 | 本計画 | 理由 |
|---|---|---|---|
| TDL2048+ の構造 | `board.h` / `feature.h` / `weight.h` を include 想定 | **`2048.cpp` 単一 TU**(2,500+ 行)を patch して include | 実態として `feature.h` `weight.h` は存在せず、全クラスが `2048.cpp` に直書き |
| BMI2/AVX2 のフォールバック | 「あるはず」 | **全箇所にフォールバック有を確認済み**。`PREFER_*` マクロで切替 | 実コード確認 |
| `shm.h`(共有メモリ) | 言及なし | **System V IPC を使うため WASM 非互換**。スタブ化必須 | `<sys/shm.h>` 直叩きを確認 |
| 重みサイズ見積 | 「1GB 弱」 | structure: 256MB(4x6patt)/ coherence: **768MB**(配布版はこちら) | `weight` クラスが TC モードで value/accum/updvu の 3 配列を持つ |
| 重み変換パイプライン | 言及なし | **coherence → structure-only 変換ツール**を v1 必須と位置付け | これが無いと 4x6patt はモバイル不可 |
| C++ 標準 | C++14 | **C++20**(makefile デフォルト) | makefile 確認 |
| Web Worker | 後回し | **v1 必須** | 推論中に UI が固まるため |
| `uint64_t` の ABI | `cwrap` で渡す前提 | **`-sWASM_BIGINT=1` 必須**を明記 | i64 が 53bit `number` で壊れるため |
| ビルドシステム | CMake 想定 | **GNU Make ベースで踏襲**、emcc 直叩き | TDL2048+ が make 前提のため CMake 化のメリットなし |
| ネットワーク選定 | 4x6patt v1 | **2x6patt または変換済み 4x6patt structure** | メモリ予算とロード時間 |
| ABI の `_dispose` | 言及あり | **「実質クリーンアップ不可、reload 推奨」と明記** | TDL2048+ は static グローバル多用、解放 API なし |

---

## 1. ゴールと非ゴール

### ゴール

- 学習済み `.w` を読み込んで自動プレイをブラウザで動かす(2x6patt または 4x6patt structure)
- 推論コア層、アダプタ層、UI層が疎結合で、UIを後から自由に差し替え可能
- ローカルで `npm run dev` 一発で起動できる(WASM ビルドは別フェーズ)
- 単一の静的サイトとして配信可能(サーバ不要、ただし重み配信用 CDN は推奨)
- 推論は Web Worker 上で実行し、UI スレッドをブロックしない

### 非ゴール

- ブラウザ内学習(TC モード必須、メモリ 3 倍)
- WebGPU 並列化
- マルチスレッド WASM(pthread + SharedArrayBuffer + COOP/COEP)
- 凝ったアニメーション・スタイリング
- 8x6patt(コア確認後検討)

---

## 2. TDL2048+ の実態(調査結果サマリ)

実装計画の前提として、以下を確認済み(2026-05-02 時点):

### 2.1 リポジトリ構造

- ライセンス: **MIT**(LICENSE.md, Copyright (c) 2021 Hung Guei)
- 単一 TU `2048.cpp` に `board`, `feature`, `indexer`, `weight`, `cache`, `state`, `select`, `statistic`, `options` 全部入り
- 2048.cpp の末尾 ≈ 100 行に `int main(int argc, const char* argv[])` がある
- ヘッダは `board.h` のみ。N-Tuple 関連のヘッダ(feature.h, weight.h)は**存在しない**
- `moporgic/` 配下に `half.h`, `math.h`, `shm.h`, `type.h`, `unit.h`, `util.h`(ベンダーコピー、submodule ではない)
- ビルド: GNU Make 単発(`g++ -std=c++20 -O3 -mbmi2 -mavx2 -pthread`)、CMake なし
- 外部リンク依存: **pthread のみ**

### 2.2 SIMD/BMI2 の依存度

**結論: 全箇所にフォールバックあり、WASM 化に致命的な障害なし。**

| 関数 | BMI2/AVX2 経路 | フォールバック | 切替マクロ |
|---|---|---|---|
| `board::query` | `pext64` | `((raw>>(i<<2))&mask)*0x0001001001001000ull>>48` | `PREFER_LEGACY_COL` |
| `board::transpose64` | `pext64`×4 | XOR スワップ列 | `PREFER_LEGACY_TRANSPOSE` |
| `board::moves64` | AVX2 4 方向並列 | `cache` LUT による行/列単位処理 | `PREFER_LUT_MOVES` |
| `pext64` / `pdep64` 自体 | `__builtin_ia32_pext_di` 等 | `for` ループ実装 | `PREFER_GENERAL_INSTRUCTIONS` |

**`cache` クラスの 2^20 = 1,048,576 エントリ事前計算 LUT** が `__attribute__((constructor))` でモジュールロード時に構築される。SIMD/BMI2 を使わない経路はこれが核となる。スカラー C++ のみで完結。

**LUT 自体のメモリ**: `sizeof(cache) * 2^20`。`cache` の概算は数十バイト/エントリ → トータル 30-50MB 程度の RAM コスト(WASM ヒープ内に常駐)。

### 2.3 学習済み重み(https://moporgic.info/2048/model/)

| ファイル | xz 圧縮 | 展開後(structure 推測) | 展開後(coherence 推測) |
|---|---|---|---|
| 4x6patt.w.xz | 157 MB | 256 MB | 768 MB |
| 5x6patt.w.xz | 204 MB | 320 MB | 960 MB |
| 6x6patt.w.xz | 227 MB | 384 MB | 1.15 GB |
| 7x6patt.w.xz | 273 MB | 448 MB | 1.34 GB |
| 8x6patt.w.xz | 317 MB | 512 MB | 1.54 GB |

**配布重みは coherence 形式と推測**(xz 圧縮率と容量比から)。確定するには配布された `.w` の先頭バイト列をダンプして `weight::operator>>` のヘッダ構造と突き合わせる必要がある。**Phase 3 の最初のタスク**。

`numeric` 型は `typedef float numeric;`(2048.cpp 確認)。バイナリは**リトルエンディアン前提**(x86 ホスト書出し)。WASM はリトルエンディアンなのでそのまま読める。

### 2.4 `.w` フォーマット(2048.cpp の `operator<<` / `operator>>` 直読)

```
[wrapper]
  u8  code = 0
  u32 num
  for num times:
    [entry]
      u8  code        // 4 が現行版
      u32 sign        // hex parseable な特徴量タグ
      u16 sign.size() // legacy:0
      u16 0           // reserved
      u16 blkz        // = sizeof(numeric) = 4
      u64 length      // weight 配列要素数(例: 16^6 = 16,777,216)
      numeric[length] // value 配列
      [coherence の場合]
        u16 blkz2; u64 len2; numeric[len2]   // accum
        u16 blkz3; u64 len3; numeric[len3]   // updvu
      u16 0           // 終端マーカー
```

マジックナンバーは `0x00, ..., 0x04` という弱いシグネチャのみ。**フォーマット判定**(structure or coherence)は、最初の `numeric[]` 配列を読み終えた直後の `u16` が `0` か非 `0` かで分岐できる。

### 2.5 ネットワーク定義(2048.cpp `resolve()` 抜粋)

```
"4x6patt"  → "012345 456789 012456 45689a"   (6-tuple × 4)
"5x6patt"  → "012345 456789 89abcd 012456 45689a"
"8x6patt"  → "k.matsuzaki" 系 (6-tuple × 8)
"4x5patt"  → "4x5patt/41-32"  (5-tuple × 4)
"2x4patt"  → "2x4patt/4"      (4-tuple × 2)
"1x8patt"  → "1x8patt/44"     (8-tuple × 1)
```

isomorphism は**重みを 8 通りで共有、ボード側を 8 回変換して評価**する設計(weights 共有)。`4x6patt` の評価コストは 4 重み × 8 シンメトリ = **32 ルックアップ/盤面**。

### 2.6 WASM 化に支障のある依存

| 依存 | 場所 | 対策 |
|---|---|---|
| `<sys/shm.h>`, `shmget/shmat/ftok` | `moporgic/shm.h` 全体 | **`shm.h` を WASM 用スタブに差し替え**(`shm::support()` 常時 `false`) |
| `__attribute__((constructor))` | `cache::block` 構築 | emcc も対応、ただし `INITIAL_MEMORY` を起動 LUT 構築分以上に確保する必要 |
| `std::async` / `std::thread` | 学習レシピ | 推論専用ビルドでは経路に乗らない。最悪 `-DSINGLE_THREAD` で迂回 |
| `std::ifstream`/`std::ofstream` | weight load/save | emcc MEMFS 経由 or `read_weight_from_buffer` を新規追加 |
| `__rdtsc()` (`util.h`) | プロファイル用 | WASM では未定義になるが、推論経路で使われていなければ問題なし。要確認 |

### 2.7 既存の WASM 移植事例

`https://github.com/moporgic/TDL2048/issues?q=emscripten+OR+wasm+OR+browser` → **0 件**。
プルリクエストにも該当なし。**前例なし、自前パイオニア実装が必要**。

---

## 3. アーキテクチャ

4 層構造に修正(Worker 層を追加)。**矢印は依存方向**。

```
┌─────────────────────────────────────┐
│ Layer 4: UI (React, 差し替え可能)    │
│ - 盤面描画 / 操作 / 速度・深さ調整  │
└──────────────┬──────────────────────┘
               │ async Solver IF
               ▼
┌─────────────────────────────────────┐
│ Layer 3: Solver Proxy (TS, main thread) │
│ - Worker への postMessage / RPC      │
│ - キャンセル・タイムアウト           │
└──────────────┬──────────────────────┘
               │ MessagePort
               ▼
┌─────────────────────────────────────┐
│ Layer 2: Solver Worker (TS)         │
│ - WASM ロード / 重み fetch+解凍     │
│ - bigint ↔ wasm i64 ABI 変換        │
│ - 重み structure 形式変換(必要時)  │
└──────────────┬──────────────────────┘
               │ extern "C"
               ▼
┌─────────────────────────────────────┐
│ Layer 1: Core (C++/WASM)            │
│ - TDL2048+ を patched include       │
│ - solver_*() C ABI 公開             │
└─────────────────────────────────────┘
```

UI 差し替え可能性は Layer 3 (Proxy) のインターフェース固定で担保する。Layer 2 (Worker) は実装詳細。

---

## 4. ディレクトリ構成

```
auto-2048/
├── core/                          # Layer 1
│   ├── third_party/TDL2048/       # git submodule (master)
│   ├── patches/
│   │   ├── 0001-disable-main.patch
│   │   ├── 0002-stub-shm-for-wasm.patch
│   │   └── 0003-expose-init-and-load-from-buffer.patch
│   ├── wrapper.cpp                # extern "C" ABI、C++ 側ヘルパー含む
│   ├── shm_stub.h                 # WASM 用 shm スタブ
│   ├── build.sh                   # emcc 直叩き(make 不使用)
│   └── README.md
│
├── tools/
│   └── convert_weights.cpp        # coherence → structure 変換 CLI
│
├── src/
│   ├── solver/
│   │   ├── index.ts               # Layer 3: 公開 API (Proxy)
│   │   ├── proxy.ts               # メインスレッド側 RPC
│   │   ├── worker.ts              # Layer 2: Worker エントリ
│   │   ├── wasm-loader.ts
│   │   ├── board.ts               # bigint ↔ grid ヘルパー
│   │   ├── types.ts
│   │   └── __tests__/
│   │       ├── board.test.ts
│   │       └── solver.test.ts
│   │
│   ├── ui/                        # Layer 4(差し替え対象)
│   │   ├── App.tsx
│   │   ├── Board.tsx
│   │   ├── Controls.tsx
│   │   └── Stats.tsx
│   │
│   └── main.tsx
│
├── public/
│   ├── solver.wasm
│   ├── solver.js                  # emcc glue
│   └── weights/
│       ├── 2x6patt.structure.w    # v1 既定
│       ├── 4x6patt.structure.w    # v1.5(>=PC)
│       └── README.md              # 取得・変換手順
│
├── index.html
├── vite.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## 5. Layer 1: Core 詳細

### 5.1 統合戦略 — patch ベース、fork なし

**TDL2048+ は git submodule として保持**し、ビルド時に `core/patches/` 以下のパッチを適用する。fork すると上流追従が面倒になるため避ける。

パッチは 3 つに分割(レビュー容易性のため):

#### 0001-disable-main.patch
```diff
@@ -2048.cpp 末尾付近 @@
-int main(int argc, const char* argv[]) {
+#ifndef TDL2048_AS_LIBRARY
+int main(int argc, const char* argv[]) {
     ...
 }
+#endif
```

#### 0002-stub-shm-for-wasm.patch
```diff
@@ -2048.cpp 先頭の include 群 @@
+#ifdef __EMSCRIPTEN__
+#include "shm_stub.h"
+#else
 #include "moporgic/shm.h"
+#endif
```

`core/shm_stub.h` の内容(空実装):
```cpp
#pragma once
namespace moporgic { namespace shm {
    inline bool support() { return false; }
    inline bool enable() { return false; }
    template<typename T> inline bool enable() { return false; }
    inline void disable() {}
    template<typename T> inline void disable() {}
}}
```

`shm::enable<weight::segment>()` 等のテンプレート呼び出し点が複数あるため、**ジェネリック・テンプレート版も必須**。

#### 0003-expose-init-and-load-from-buffer.patch

`main()` 内の以下のシーケンスを参考に、`extern "C"` 経由で呼べる関数群を追加する:

1. `options opts = parse(argc, argv);`(オプション解析)
2. `feature::make(opts["network"]);`
3. `weight::load(opts["input"]);`
4. `state s; s = state(); s.spawn(); ...` (1 ゲーム実行)

これらを `solver_init` / `solver_load_weights_from_buffer` / `solver_step` から呼び出せる形に書き直す。

### 5.2 公開 C ABI(最終版)

```cpp
extern "C" {
    // 初期化(プロセスで一度だけ)
    // network: "2x6patt", "4x6patt" 等 TDL2048 のエイリアス
    // 戻り値: 0=成功、負値=エラーコード
    int  solver_init(const char* network);

    // 重みロード(バッファから)
    // data: ホストから WASM ヒープにコピー済みの .w バイナリ先頭
    // size: バイト数
    // 戻り値: 0=成功、負値=エラー
    int  solver_load_weights(const uint8_t* data, size_t size);

    // 1手選択
    // board: u64 bitboard (4bit × 16 マス、log2 エンコード)
    // depth: 1=greedy(探索なし)、2,3,...=expectimax 深さ
    // 戻り値: 0=Up, 1=Right, 2=Down, 3=Left, -1=動けない
    int  solver_step(uint64_t board, int depth);

    // V値だけ返す(可視化用、シンメトリ展開含む)
    float solver_evaluate(uint64_t board);

    // afterstate(タイル生成なし)
    // 戻り値: afterstate as u64、reward は out_reward に
    uint64_t solver_simulate_move(uint64_t board, int action, uint32_t* out_reward);

    // ランダムタイル追加
    // seed=0 のとき内部 RNG、それ以外で再現性確保
    uint64_t solver_spawn_tile(uint64_t board, uint32_t seed);

    // 4方向 V値の同時取得(可視化用、UI から呼ぶ)
    // out_values は float[4]
    void  solver_evaluate_actions(uint64_t board, int depth, float* out_values);

    // 解放(実体は何もしない、互換のため公開)
    // ※ TDL2048+ の static 状態は完全には解放できない。HMR 時はページ再読込推奨
    void  solver_dispose();
}
```

**素案からの変更点**:
- `solver_evaluate_actions` を追加(4方向の V 値を一度に返す、可視化に有用)
- `solver_dispose` の意味論を「実質 no-op、reload 推奨」と明文化

### 5.3 Emscripten ビルド

`core/build.sh`:

```bash
#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

# パッチ適用(冪等)
pushd third_party/TDL2048 >/dev/null
git checkout master 2048.cpp moporgic/shm.h
for p in ../../patches/*.patch; do
    git apply --check "$p" 2>/dev/null && git apply "$p" || echo "[skip] $p (already applied?)"
done
popd >/dev/null

emcc \
    -std=c++20 \
    -O3 \
    -msimd128 \
    -DTDL2048_AS_LIBRARY \
    -DPREFER_GENERAL_INSTRUCTIONS \
    -DPREFER_LEGACY_COL \
    -DPREFER_LEGACY_TRANSPOSE \
    -DPREFER_LUT_MOVES \
    -DNDEBUG \
    -I third_party/TDL2048 \
    -I third_party/TDL2048/moporgic \
    -I . \
    wrapper.cpp third_party/TDL2048/2048.cpp \
    -s WASM=1 \
    -s WASM_BIGINT=1 \
    -s ALLOW_MEMORY_GROWTH=1 \
    -s INITIAL_MEMORY=536870912 \
    -s MAXIMUM_MEMORY=2147483648 \
    -s MODULARIZE=1 \
    -s EXPORT_ES6=1 \
    -s EXPORT_NAME='createSolverModule' \
    -s ENVIRONMENT='web,worker' \
    -s EXPORTED_FUNCTIONS='["_solver_init","_solver_load_weights","_solver_step","_solver_evaluate","_solver_evaluate_actions","_solver_simulate_move","_solver_spawn_tile","_solver_dispose","_malloc","_free"]' \
    -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","HEAPU32","HEAPF32","getValue","setValue"]' \
    -o ../public/solver.js
```

**素案からの変更点**:
- `-std=c++20`(makefile デフォルト準拠)
- `-DTDL2048_AS_LIBRARY` を追加(`main()` 抑止)
- `-DPREFER_*` 群を追加(BMI2/AVX2 経路を**確実に**フォールバックへ)
- `-sWASM_BIGINT=1` を追加(`uint64_t` を BigInt として透過的に扱う)
- `-sENVIRONMENT='web,worker'`(Worker 利用想定)
- `-pthread` は付けない(SAB/COOP/COEP の頭痛を回避)

### 5.4 LUT/メモリ予算

WASM ヒープ占有量:

| 用途 | サイズ |
|---|---|
| `cache` LUT (2^20 entries) | ~30-50 MB |
| 重み (4x6patt structure) | 256 MB |
| 重み (4x6patt coherence) | 768 MB |
| 重み (2x6patt structure) | 128 MB |
| stack + heap workspace | ~16 MB |
| **合計 (4x6patt structure)** | **~300 MB** |
| **合計 (4x6patt coherence)** | **~820 MB** |
| **合計 (2x6patt structure)** | **~180 MB** |

`INITIAL_MEMORY=512MB` は 4x6patt structure に対して妥当。coherence のままでは 1GB 超え、モバイル不可。

**結論**: v1 は 2x6patt(または structure に変換した 4x6patt)を既定とする。

---

## 6. 重みパイプライン(Phase 3 の最重要タスク)

### 6.1 配布形式の確定手順

1. `curl -O https://moporgic.info/2048/model/4x6patt.w.xz`
2. `xz -d 4x6patt.w.xz`
3. `xxd 4x6patt.w | head -32` で先頭 512 バイトをダンプ
4. `weight::operator>>` のヘッダ構造に当てはめて、最初の `numeric[]` を読み終えた後の u16 が `0` か非 `0` かを判定
5. structure ⇒ そのまま使える。coherence ⇒ 変換ツールにかける

### 6.2 変換ツール `tools/convert_weights.cpp`

ホスト側でビルドする CLI(emcc 不要、ネイティブ g++ で OK)。
`2048.cpp` の `weight::load`(coherence 対応)で読み込んだ後、`weight::save`(structure のみ)で書き出す。

**実装方針**:
- 一時的に `weight::structure` モードを強制してから `save()` を呼ぶ
- もしくは accum/updvu フィールドの書き出しを抑止する `save_inference_only()` を新規追加

注意: TDL2048+ の `weight::save` は実行時の coherence/structure フラグに従って書き出すので、フラグの強制方法を `weight` クラスのコードから特定する必要がある(Phase 3 で要調査)。

### 6.3 配信戦略

| ファイル | 配置 | サイズ |
|---|---|---|
| `2x6patt.structure.w` | `public/weights/` | ~128 MB(さらに gzip 圧縮で配信) |
| `4x6patt.structure.w` | CDN(R2 / Cloudflare Pages 推奨) | ~256 MB |

GitHub Pages は**単一ファイル 100MB 上限**のため、4x6patt は GH Pages 不可。

ブラウザ取得時:
- `fetch('/weights/2x6patt.structure.w.gz')` → `DecompressionStream('gzip')` → `ArrayBuffer` → WASM ヒープへコピー → `solver_load_weights`
- xz は `DecompressionStream` 標準サポート外なので gzip に再圧縮する

---

## 7. Layer 2 / Layer 3: Solver(TS)詳細

### 7.1 公開 API(Layer 3, `src/solver/index.ts`)

```typescript
export type Action = 0 | 1 | 2 | 3;
export const ACTION_NAMES = ['Up', 'Right', 'Down', 'Left'] as const;

export interface SolverConfig {
    network: '2x6patt' | '4x6patt' | string;
    weightsUrl: string;        // gzip 圧縮 .w を想定
    wasmUrl?: string;
    workerUrl?: string;
}

export interface Solver {
    /** 1 手選択(非同期、Worker 経由)*/
    step(board: bigint, depth?: number): Promise<Action | -1>;

    /** V 値を返す(シンメトリ展開込み)*/
    evaluate(board: bigint): Promise<number>;

    /** 4 方向の V 値を同時取得(UI のヒートマップ等に)*/
    evaluateActions(board: bigint, depth?: number): Promise<[number, number, number, number]>;

    /** afterstate */
    simulateMove(board: bigint, action: Action): Promise<{ after: bigint; reward: number }>;

    /** ランダムタイル追加 */
    spawnTile(board: bigint, seed?: number): Promise<bigint>;

    /** 終了判定(同期、純 JS)*/
    isGameOver(board: bigint): Promise<boolean>;

    /** Worker を畳む(タブを閉じるとき等)*/
    dispose(): Promise<void>;
}

export async function createSolver(config: SolverConfig): Promise<Solver>;
```

**素案との違い**:
- 全てのメソッドが `Promise` を返す(Worker 越しの RPC 必須のため)
- `evaluateActions` 追加
- `dispose` を `Promise<void>` 化

### 7.2 board ヘルパー(`src/solver/board.ts`)

素案からほぼそのまま。`isGameOver` は 4 方向 `simulateMove` を使うので Worker 経由の async になる。

```typescript
export function getTile(board: bigint, pos: number): number {
    return Number((board >> BigInt(pos * 4)) & 0xFn);
}
export function setTile(board: bigint, pos: number, value: number): bigint {
    const mask = 0xFn << BigInt(pos * 4);
    return (board & ~mask) | (BigInt(value) << BigInt(pos * 4));
}
export function tileValue(logValue: number): number {
    return logValue === 0 ? 0 : 1 << logValue;
}
export function boardToArray(board: bigint): number[][] {
    const grid: number[][] = [[],[],[],[]];
    for (let i = 0; i < 16; i++) {
        grid[Math.floor(i / 4)][i % 4] = tileValue(getTile(board, i));
    }
    return grid;
}
export function emptyBoard(): bigint { return 0n; }
export function boardToString(board: bigint): string { return board.toString(16).padStart(16, '0'); }
export function boardFromString(s: string): bigint { return BigInt('0x' + s); }
```

### 7.3 RPC プロトコル(Proxy ↔ Worker)

`postMessage` の payload は構造化クローン可能な型のみ:

```typescript
type Req =
  | { id: number; type: 'init'; config: SolverConfig }
  | { id: number; type: 'step'; board: bigint; depth: number }
  | { id: number; type: 'evaluate'; board: bigint }
  | { id: number; type: 'evaluateActions'; board: bigint; depth: number }
  | { id: number; type: 'simulateMove'; board: bigint; action: Action }
  | { id: number; type: 'spawnTile'; board: bigint; seed: number }
  | { id: number; type: 'dispose' };

type Res =
  | { id: number; ok: true; value: unknown }
  | { id: number; ok: false; error: string };
```

`bigint` は構造化クローン対象に含まれる(MDN 確認済み、ES2020+)。Transferable は使わない。

### 7.4 WASM ロード処理(Worker 内)

```typescript
import createSolverModule from '../../public/solver.js'; // emcc 出力

let mod: any | null = null;
let api: {
    init: (n: string) => number;
    load: (ptr: number, size: number) => number;
    step: (b: bigint, d: number) => number;
    // ...
} | null = null;

async function init(config: SolverConfig) {
    mod = await createSolverModule({ locateFile: (p: string) => config.wasmUrl ?? p });
    api = {
        init: mod.cwrap('solver_init', 'number', ['string']),
        load: mod.cwrap('solver_load_weights', 'number', ['number', 'number']),
        step: mod.cwrap('solver_step', 'number', ['bigint', 'number']),
        // ...
    };
    if (api.init(config.network) !== 0) throw new SolverError('init failed');

    const res = await fetch(config.weightsUrl);
    const stream = res.body!.pipeThrough(new DecompressionStream('gzip'));
    const buf = new Uint8Array(await new Response(stream).arrayBuffer());
    const ptr = mod._malloc(buf.byteLength);
    mod.HEAPU8.set(buf, ptr);
    const code = api.load(ptr, buf.byteLength);
    mod._free(ptr);
    if (code !== 0) throw new SolverError(`load failed: ${code}`);
}
```

**注意点**:
- `cwrap` で `bigint` 型を渡すには、`-sWASM_BIGINT=1` ビルド必須
- `ccall` の type に `'bigint'` が認識されるかは emcc バージョン依存。最新では OK だが、ダメなら `EXPORTED_FUNCTIONS` 経由で `mod._solver_step(b, d)` を直接呼ぶ
- `_malloc` で確保した領域は `_free` で確実に開放。fetch から WASM ヒープへの一時コピーで RSS が一時的に倍になる点に注意(2x6patt なら 256 MB 増、4x6patt なら 512 MB 増)。コピー後に GC が走るのを待つ余裕あり

### 7.5 エラー処理

WASM 関数のエラーコード:

```typescript
class SolverError extends Error {
    constructor(public code: number | string, message: string) {
        super(`SolverError(${code}): ${message}`);
    }
}
```

エラーコード規約(C 側で定義、ヘッダで共有):
- `0`  成功
- `-1` invalid network
- `-2` weight file format error
- `-3` weight count mismatch
- `-4` solver not initialized
- `-5` weights not loaded

### 7.6 テスト戦略

`vitest` を使い、以下の階層で検証:

**単体(`src/solver/__tests__/board.test.ts`)** — 純 JS、WASM 不要
- `getTile`, `setTile`, `tileValue`, `boardToArray` の往復一致

**スモーク(`src/solver/__tests__/solver.test.ts`)** — WASM ロード、Node 環境
- `createSolverModule` を Node から require できる(`-sENVIRONMENT='web,worker'` のため、Node 用ビルドを別出力する必要あり)
- ダミー 1 byte の `.w` を渡すと `-2` を返す
- 実重み(`tools/test-weights/2x6patt.tiny.w`、自前学習した小サイズ版)を渡すと `step(0x1n, 1)` が `0..3` を返す

**統合(`tests/e2e/`、Playwright)** — オプション、Phase 6 以降
- 実ブラウザで盤面が進行することを確認

---

## 8. Layer 4: UI(最小実装)

素案 §6 とほぼ同じ方針。**Web Worker 越しの async 化に伴い、ループ実装を修正**。

### 8.1 機能(変更なし)

- 盤面表示(4x4 テーブル + 数字)
- 再生 / 停止 / ステップ / リセット
- 速度スライダー(10ms 〜 1000ms / 手)
- スコア・最大タイル・手数表示
- 探索深さセレクタ(1, 2, 3 ply)
- (オプション)4 方向 V 値ヒートマップ

### 8.2 状態管理

```typescript
interface GameState {
    board: bigint;
    score: number;
    moves: number;
    isPlaying: boolean;
    speed: number;       // ms / move
    depth: number;
    history: { board: string; score: number }[]; // bigint→hex string で永続化可能に
    pendingAction: Action | null;
}
```

### 8.3 ループ実装(async 版)

```typescript
useEffect(() => {
    if (!isPlaying || !solver) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const loop = async () => {
        if (cancelled) return;
        const action = await solver.step(board, depth);
        if (cancelled) return;
        if (action < 0) { setIsPlaying(false); return; }
        const { after, reward } = await solver.simulateMove(board, action as Action);
        if (cancelled) return;
        const next = await solver.spawnTile(after);
        if (cancelled) return;
        setBoard(next);
        setScore(s => s + reward);
        setMoves(m => m + 1);
        timer = setTimeout(loop, speed);
    };

    timer = setTimeout(loop, speed);
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
}, [isPlaying, board, speed, depth, solver]);
```

**ポイント**: `cancelled` フラグで in-flight RPC 後の `setState` を無効化(stop 直後の state 更新事故を防ぐ)。

---

## 9. 実装フェーズ(細分化版)

各フェーズで「完了の定義」を明示。詰まったら次フェーズに進まない。

### Phase 0 — 環境準備(0.5 日)

- [ ] `emsdk` インストール、`emcc --version` が通る
- [ ] Node.js 20+
- [ ] `git submodule add https://github.com/moporgic/TDL2048 core/third_party/TDL2048`
- [ ] Vite + React + TypeScript テンプレ作成
- [ ] `package.json` の scripts 整備

**完了条件**: `npm run dev` で空の Vite ページが立ち上がる

### Phase 1 — TDL2048+ をネイティブでビルド(0.5 日)

- [ ] x86 ホストで `make` が成功し、`./2048 -e evaluate -i 4x6patt.w` が動く
- [ ] 4x6patt 重みを公式から取得・展開
- [ ] CLI 経由で 1 ゲーム評価できる(平均スコアが論文値の桁感)

**完了条件**: ネイティブで動くベースラインを確保(WASM トラブル時の比較対象)

### Phase 2 — 重みフォーマット確定(0.5 日)

- [ ] `4x6patt.w` の先頭 512 バイトをダンプ
- [ ] `weight::operator>>` を辿って structure / coherence を判定
- [ ] レポートを `core/README.md` に記録

**完了条件**: 配布重みのフォーマットが文書化されている

### Phase 3 — 最小 WASM ビルド(1.5 日)

- [ ] `core/patches/0001-disable-main.patch` 作成・適用
- [ ] `core/patches/0002-stub-shm-for-wasm.patch` 作成・適用
- [ ] `core/shm_stub.h` 作成
- [ ] `core/wrapper.cpp` に最小実装(`solver_init` だけ、戻り値固定 `0`)
- [ ] `core/build.sh` で `emcc` がエラーなく完走、`public/solver.{js,wasm}` 生成
- [ ] Node から `createSolverModule()` で初期化、`_solver_init('4x6patt')` が `0` を返す
- [ ] `cache` LUT 構築の起動コストが妥当(数百 ms 〜 数秒、要計測)

**完了条件**: WASM が JS から呼べる。ビルドエラー全消し

**ハマりどころ予測**:
- `2048.cpp` 内で C++20 機能と emcc の clang のバージョン差で互換性問題が出る可能性 → 出たら個別対応
- `__rdtsc()` が見つからない → `util.h` 側を `#ifdef __EMSCRIPTEN__` でスタブ化
- `<sys/shm.h>` 経由のシンボルが残っていると詰まる → patch 0002 で完全除外確認

### Phase 4 — N-Tuple 初期化と評価(2 日)

- [ ] `core/patches/0003-expose-init-and-load-from-buffer.patch` 作成
- [ ] `solver_init("4x6patt")` で `feature::make()` を呼ぶ
- [ ] `solver_load_weights(buf, size)` で `weight::operator>>` を `std::istringstream` 経由で実行
- [ ] `solver_evaluate(board)` でシンメトリ込みの V 値を返す
- [ ] **Phase 1 のネイティブ版と同じ board に対して同じ V 値が返ることを確認**(数値一致テスト、これが通れば移植成功)

**完了条件**: WASM 版とネイティブ版の数値一致

### Phase 5 — `solver_step` と探索(1 日)

- [ ] `solver_step` の depth=1 (greedy) 実装
  - 4 方向 `simulate_move` → reward + V(after) が最大の方向を選択
- [ ] expectimax depth=2,3 を `2048.cpp` のコードから移植 or 呼び出し
- [ ] `solver_simulate_move` / `solver_spawn_tile` 実装
- [ ] `solver_evaluate_actions` 実装

**完了条件**: ランダム盤面 100 個で `step()` が 4 方向の妥当な選択を返す(統計的に Up/Down 偏重など期待される傾向が出る)

### Phase 6 — 重み変換ツール(1 日、coherence の場合のみ)

- [ ] `tools/convert_weights.cpp` 実装(Phase 2 の判定で coherence と分かった場合のみ)
- [ ] `4x6patt.coherence.w` → `4x6patt.structure.w` 変換
- [ ] 変換前後で `solver_evaluate` の値が一致することを検証
- [ ] gzip 圧縮版を `public/weights/` 配下へ配置

**完了条件**: 配信用 `2x6patt.structure.w.gz` または `4x6patt.structure.w.gz` が用意できている

### Phase 7 — JS Adapter (Worker なし、メインスレッド版)(1 日)

- [ ] `src/solver/wasm-loader.ts` 実装
- [ ] `cwrap` 経由で C ABI を JS 化
- [ ] `bigint` ABI 動作確認(`-sWASM_BIGINT=1` の効力)
- [ ] Vitest スモークテスト

**完了条件**: Node 環境で `solver.step(0x1n, 1)` が動く

### Phase 8 — Worker 化(1 日)

- [ ] `src/solver/worker.ts` 作成
- [ ] `src/solver/proxy.ts` で RPC ラッパ
- [ ] エラー伝搬・キャンセル動作確認
- [ ] `src/solver/index.ts` の `createSolver` を Proxy 経由に切替

**完了条件**: `step` 中に UI スレッドの `requestAnimationFrame` がブロックされない

### Phase 9 — 最小 UI(1 日)

- [ ] `Board.tsx` / `Stats.tsx` / `Controls.tsx` / `App.tsx`
- [ ] 再生 / 停止 / ステップ / リセット
- [ ] 速度・深さ調整
- [ ] 実ブラウザで 1 ゲーム完走確認

**完了条件**: 最大タイル 2048 達成のリプレイが視認できる

### Phase 10 — 仕上げ(1 日)

- [ ] README 整備
- [ ] 本番ビルド (`npm run build`) で `dist/` が出る
- [ ] Cloudflare Pages 等にデプロイ
- [ ] 重み配信の CDN 設定(範囲指定対応、`Cache-Control: immutable`)
- [ ] モバイル Safari での動作確認(メモリ要確認)

**完了条件**: デプロイ済みで `https://...` で動く

---

## 10. 工数とスケジュール

経験者(C++/Emscripten/React 全部できる人)の純実装時間として:

| フェーズ | 工数 | 累計 |
|---|---|---|
| Phase 0 環境準備 | 0.5 d | 0.5 d |
| Phase 1 ネイティブビルド | 0.5 d | 1.0 d |
| Phase 2 重み形式確定 | 0.5 d | 1.5 d |
| Phase 3 最小 WASM | 1.5 d | 3.0 d |
| Phase 4 N-Tuple 初期化 | 2.0 d | 5.0 d |
| Phase 5 step 実装 | 1.0 d | 6.0 d |
| Phase 6 重み変換 | 1.0 d | 7.0 d |
| Phase 7 JS Adapter | 1.0 d | 8.0 d |
| Phase 8 Worker | 1.0 d | 9.0 d |
| Phase 9 UI | 1.0 d | 10.0 d |
| Phase 10 仕上げ | 1.0 d | 11.0 d |
| バッファ(20%) | 2.0 d | **13.0 d** |

**実コストはおおむね 2〜3 週間**(他の業務と兼任なら 1〜1.5 ヶ月)。Phase 3〜5 が破綻リスク高。

---

## 11. 落とし穴と対策(更新版)

| 罠 | 確度 | 対策 |
|---|---|---|
| `2048.cpp` の C++20 機能で emcc clang が落ちる | 中 | clang のバージョン違いで個別エラー対応。最悪 `-std=c++17` フォールバック |
| `cache` LUT 構築でモジュール初期化が長い | 中 | 計測必須。1〜2 秒程度なら容認、それ以上なら遅延構築化 |
| coherence 重みが 700MB 超で OOM | 高 | **必ず structure に変換してから配信**(Phase 6) |
| `cwrap` で bigint が型エラー | 中 | `-sWASM_BIGINT=1` 確認、ダメなら `Module._solver_step` 直叩き |
| WASM ヒープに重みコピー時に RSS 倍増 | 高 | コピー後 `_malloc` 領域を即 `_free`、buf 変数を `null` 代入で GC 促進 |
| モバイル Safari の WASM メモリ上限 | 中 | 2x6patt を既定。4x6patt はデスクトップ限定オプション |
| GitHub Pages の 100MB ファイル制限 | 高 | 重みは Cloudflare R2 / Pages に逃がす |
| TDL2048+ 上流が変更されてパッチ拒否 | 低 | submodule は固定 SHA で pin |
| `weight::save` で structure-only モードに切り替えられない | 中 | 最悪 `weight` クラスのフィールドを直接シリアライズする独自 save を書く |
| `__rdtsc()` 等の x86 専用 intrinsic | 中 | `util.h` 側に `#ifdef __EMSCRIPTEN__` のスタブ追加(patch 拡張) |
| `solver_dispose` 後の再 init で static 残骸 | 高 | **諦めてページリロード推奨**、UI に明記 |
| BigInt が Web Worker 越しの構造化クローンで破損 | 低 | 仕様上 OK だが念のためテスト |
| xz が `DecompressionStream` で展開できない | 高 | gzip に再圧縮して配信(変換時に同時実施) |

---

## 12. 拡張ポイント(将来用)

素案 §10 を踏襲しつつ追加:

- **マルチスレッド WASM 化**: COOP/COEP ヘッダ + `-pthread` + `-sUSE_PTHREADS=1`、SAB 必須。expectimax の枝並列化で depth=4 が現実的に
- **WebGPU 探索**: depth ≥ 4 の expectimax バックエンドを GPU compute shader で
- **学習機能**: `solver_train_step(board, action, td_error)` を C ABI に追加。coherence モード必要
- **複数エージェント並走**: `Solver` instance を複数生成し並列バトル
- **盤面状態の永続化**: `boardToString(board)` で localStorage、起動時に復元

---

## 13. 確認・決定が必要な事項(実装着手前に)

実装に入る前に、以下の方針確定が必要(議論しながら決める):

1. **v1 既定ネットワーク**: `2x6patt` か `4x6patt structure` か
   - 推奨: 2x6patt(配布重みは無いので**自前学習が必要**、2-3 日の CPU 時間)
   - 代替: 4x6patt structure(coherence からの変換、ホスト側で 1 回だけ)
2. **重みのホスティング**: GitHub Pages 流用 or 別 CDN
3. **Web Worker を v1 必須とするか**: 本書の前提では必須としているが、最初はメインスレッド版 → Worker 化を Phase 10.5 として後回しもあり得る
4. **モバイル対応の是非**: 切る場合は `userAgent` ガードで PC 版へ誘導
5. **TDL2048+ submodule の pin SHA**: master HEAD 追従ではなく特定 SHA 固定推奨

---

## 14. ライセンスと帰属

- **TDL2048+** (Hung Guei): MIT License。`core/third_party/TDL2048/LICENSE.md` を保持
- **学習済み重み**: 公式配布 (https://moporgic.info/2048/model/) の利用と再配布。`public/weights/README.md` に出典明記
- **本プロジェクト**: ライセンス未定(MIT 推奨)
- **クレジット表記**: README フッタに以下を含める

```
This project is built on TDL2048+ by Hung Guei (https://github.com/moporgic/TDL2048),
licensed under MIT. Pretrained weights are sourced from https://moporgic.info/2048/model/.
```

---

## 15. 参考リンク

- TDL2048+ : https://github.com/moporgic/TDL2048
- 学習済み重み配布: https://moporgic.info/2048/model/
- 関連論文: arXiv:2212.11087 (Hung Guei, "On Reinforcement Learning for the Game of 2048")
- Emscripten: https://emscripten.org/
- WASM SIMD: https://emscripten.org/docs/porting/simd.html
- WASM_BIGINT: https://github.com/WebAssembly/JS-BigInt-integration
- DecompressionStream: https://developer.mozilla.org/en-US/docs/Web/API/DecompressionStream
