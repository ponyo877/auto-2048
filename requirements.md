# 2048 RL Solver Web — 実装仕様書

ブラウザ上で 2048 を強化学習エージェント(N-Tuple Network + TD学習済み)が自動プレイするデモアプリ。
コアは [TDL2048+](https://github.com/moporgic/TDL2048) を Emscripten でWASM化したもの。
UI は後から差し替え可能な薄い層として分離する。

## 1. ゴールと非ゴール

### ゴール
- 学習済み `.w` を読み込んで自動プレイをブラウザで動かす
- 推論コア層、アダプタ層、UI層が疎結合で、UIを後から自由に差し替え可能
- ローカルで `npm run dev` 一発で起動できる
- 単一のスタティックサイトとして配信可能(サーバ不要)

### 非ゴール(後回し)
- ブラウザ内学習
- WebGPU 並列化
- マルチスレッド(pthread + SharedArrayBuffer)
- 凝ったアニメーション・スタイリング

## 2. アーキテクチャ

3層構造。**矢印は依存方向、上の層は下の層しか知らない**。

```
┌─────────────────────────────────┐
│  Layer 3: UI (差し替え可能)      │  ← 後から React / Vue / Svelte / 何でも
│  - 盤面描画                       │
│  - 操作ボタン                     │
└─────────────┬───────────────────┘
              │ Solver インターフェース経由でのみ
              ▼
┌─────────────────────────────────┐
│  Layer 2: Solver Adapter (TS)    │
│  - WASM ロード                    │
│  - 重みファイル fetch             │
│  - JS 側型 ↔ WASM ABI 変換       │
└─────────────┬───────────────────┘
              │ C ABI (extern "C")
              ▼
┌─────────────────────────────────┐
│  Layer 1: Core (C++/WASM)        │
│  - TDL2048+ をそのまま            │
│  - 薄いラッパーで C ABI 公開     │
└─────────────────────────────────┘
```

## 3. ディレクトリ構成

```
2048-rl-web/
├── core/                          # Layer 1: C++ コア
│   ├── third_party/TDL2048/       # git submodule
│   ├── wrapper.cpp                # C ABI ラッパー
│   ├── CMakeLists.txt             # Emscripten ビルド
│   └── build.sh                   # ビルドスクリプト
│
├── src/
│   ├── solver/                    # Layer 2: Solver Adapter
│   │   ├── index.ts               # 公開 API
│   │   ├── wasm-loader.ts         # WASM ロード
│   │   ├── types.ts               # 型定義
│   │   └── solver.test.ts
│   │
│   ├── ui/                        # Layer 3: UI(差し替え対象)
│   │   ├── App.tsx                # 最小UIエントリ
│   │   ├── Board.tsx              # 盤面表示
│   │   └── Controls.tsx           # 再生/停止/速度
│   │
│   └── main.tsx                   # ブートストラップ
│
├── public/
│   ├── solver.wasm                # ビルド成果物
│   ├── solver.js                  # Emscripten glue
│   └── weights/                   # 学習済み重み配信
│       └── 4x6patt.w
│
├── index.html
├── vite.config.ts
├── package.json
└── README.md
```

## 4. Layer 1: Core の仕様

### 4.1 wrapper.cpp で公開する C ABI

これが**最重要のインターフェース定義**。これさえ守ればコア実装は何でもよい。

```cpp
extern "C" {
    // 初期化(一度だけ呼ぶ)
    // network: "4x6patt", "8x6patt" 等のエイリアス
    // 戻り値: 0=成功, それ以外=エラー
    int solver_init(const char* network);

    // 重みロード
    // data: 重みファイルのバイナリ
    // size: バイト数
    // 戻り値: 0=成功
    int solver_load_weights(const uint8_t* data, size_t size);

    // 1手分の行動を返す
    // board: u64 bitboard(4bit × 16マス、log2エンコード)
    // depth: expectimax 探索の深さ(1=探索なし、2,3,...)
    // 戻り値: 0=Up, 1=Right, 2=Down, 3=Left, -1=これ以上動けない
    int solver_step(uint64_t board, int depth);

    // ヒューリスティクスなし、純粋なV値だけ返す(可視化用)
    // 戻り値: float (期待累積報酬)
    float solver_evaluate(uint64_t board);

    // 移動シミュレート(ランダムタイル配置なし、afterstateのみ)
    // 戻り値: afterstate as u64、reward は out_reward に
    uint64_t solver_simulate_move(uint64_t board, int action, uint32_t* out_reward);

    // ランダムタイル追加(seed指定可、再現性確保)
    uint64_t solver_spawn_tile(uint64_t board, uint32_t seed);

    // メモリ解放
    void solver_dispose();
}
```

### 4.2 wrapper.cpp の実装方針

- `TDL2048/board.h` を `#include` してそのまま使う
- N-Tuple ネットワーク・特徴量・isomorphism は TDL2048+ のグローバル状態を再利用
- `solver_init` で TDL2048+ の `feature::make("4x6patt")` 相当の初期化を行う
- `solver_load_weights` は TDL2048+ の `weight::load` ロジックをメモリバッファ向けに書き直す

**注意**: TDL2048+ は `main()` から各種オプション解析・初期化が呼ばれるので、初期化部分の関数だけ抜き出してラッパーから呼ぶ必要がある。`2048.cpp` の冒頭を読んで `make`/`load` の呼び出しシーケンスを特定すること。

### 4.3 Emscripten ビルド設定

`core/build.sh`:

```bash
#!/bin/bash
set -e
emcc \
  -std=c++14 \
  -O3 \
  -msimd128 \
  -mbulk-memory \
  -DNDEBUG \
  -I third_party/TDL2048 \
  wrapper.cpp \
  -s WASM=1 \
  -s ALLOW_MEMORY_GROWTH=1 \
  -s INITIAL_MEMORY=536870912 \
  -s MAXIMUM_MEMORY=2147483648 \
  -s MODULARIZE=1 \
  -s EXPORT_ES6=1 \
  -s EXPORT_NAME="createSolverModule" \
  -s EXPORTED_FUNCTIONS='["_solver_init","_solver_load_weights","_solver_step","_solver_evaluate","_solver_simulate_move","_solver_spawn_tile","_solver_dispose","_malloc","_free"]' \
  -s EXPORTED_RUNTIME_METHODS='["ccall","cwrap","HEAPU8","HEAPU32","HEAPF32"]' \
  -o ../public/solver.js
```

`-msimd128` を必ず付ける(WASM SIMD 有効化)。`pthread` 系フラグは入れない(将来対応)。

### 4.4 BMI2/AVX2 の扱い

TDL2048+ は AVX2/BMI2 前提のコードパスを持つが、Emscripten では使えない。
ソース側で `#if defined(__AVX2__)` でガードされているので、デフォルトのフォールバック(LUT版)が使われる。
パフォーマンスは落ちるが動作はする。

## 5. Layer 2: Solver Adapter の仕様

### 5.1 公開インターフェース (`src/solver/index.ts`)

```typescript
export interface Solver {
    /** 1手分の行動を返す */
    step(board: bigint, depth?: number): Action;

    /** V値を返す(可視化用) */
    evaluate(board: bigint): number;

    /** afterstate を返す */
    simulateMove(board: bigint, action: Action): { after: bigint; reward: number };

    /** ランダムタイル追加 */
    spawnTile(board: bigint, seed?: number): bigint;
}

export type Action = 0 | 1 | 2 | 3;
export const ACTION_NAMES = ['Up', 'Right', 'Down', 'Left'] as const;

export interface SolverConfig {
    network: '4x5patt' | '4x6patt' | '8x6patt' | string;
    weightsUrl: string;
    wasmUrl?: string;
}

export async function createSolver(config: SolverConfig): Promise<Solver>;
```

`bigint` を使うのは `uint64` をJSで安全に扱うため。`number` は53bitしか精度がない。

### 5.2 board エンコーディング(JS ↔ WASM 共通)

- `bigint` 1個 = 16マス × 4bit
- 各4bit は `log2(タイル値)`、空マスは0
- 例: 空盤面に2タイルが pos 0 にある = `0x1n`

JS側ヘルパーを `src/solver/board.ts` に置く:

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

export function isGameOver(board: bigint): boolean {
    // 4方向すべて動けないかチェック
    // 実装は solver.simulateMove で4方向試して全部 board === after なら終了
}
```

### 5.3 WASM ロード処理

`src/solver/wasm-loader.ts`:
- `createSolverModule()` を import
- 重みファイルを `fetch` で取得し `ArrayBuffer` で読む
- `Module.HEAPU8.set()` でWASMメモリにコピーして `_solver_load_weights` を呼ぶ
- `cwrap` で各関数をJS関数化

### 5.4 エラー処理

- 各 WASM 関数がエラーコードを返したら `throw new SolverError(code, message)`
- 重みファイルのMIMEや拡張子は信用しない、サイズだけチェック

### 5.5 テスト

`src/solver/solver.test.ts` に以下の最小テストを書く:
- 初期盤面で `step` が4方向のいずれかを返す
- `simulateMove` が同じ入力で同じ出力(決定的)
- `spawnTile` が seed 指定で再現性あり
- ゲーム終了盤面で `step` が `-1` 相当を返す

Vitest で実行。WASMをNode環境にロードする処理が必要(`vitest --environment happy-dom` で動くはず)。

## 6. Layer 3: UI の仕様(最小実装)

**目的: 動作確認用の最小UI。後から差し替え前提なので凝らない。**

### 6.1 機能

- 盤面表示(4x4のテーブル + 数字)
- 再生/停止ボタン
- ステップ実行ボタン(1手だけ進める)
- 速度スライダー(1手あたり 10ms 〜 1000ms)
- 現在のスコア表示
- 最大タイル表示
- 探索深さ選択(1, 2, 3 ply)

### 6.2 React コンポーネント構成

```
App
├── Board (board: bigint)
├── Stats (score, maxTile, moves)
└── Controls (isPlaying, speed, depth, onPlay, onPause, onStep, onReset)
```

スタイリングは Tailwind か素のCSSで最低限。後で差し替えるので投資しない。

### 6.3 状態管理

```typescript
interface GameState {
    board: bigint;
    score: number;
    moves: number;
    isPlaying: boolean;
    speed: number;       // ms per move
    depth: number;       // expectimax depth
    history: bigint[];   // 巻き戻し用
}
```

`useReducer` か `zustand`。最小UIなら `useState` で十分。

### 6.4 ループ実装

`requestAnimationFrame` ではなく `setTimeout`(速度可変のため)。

```typescript
useEffect(() => {
    if (!isPlaying) return;
    const id = setTimeout(() => {
        const action = solver.step(board, depth);
        if (action < 0) { setIsPlaying(false); return; }
        const { after, reward } = solver.simulateMove(board, action);
        const next = solver.spawnTile(after);
        setBoard(next);
        setScore(s => s + reward);
        setMoves(m => m + 1);
    }, speed);
    return () => clearTimeout(id);
}, [isPlaying, board, speed, depth]);
```

## 7. ビルド・実行手順

### 7.1 前提

- Node.js 20+
- pnpm or npm
- Emscripten SDK (`emsdk`) インストール済み、`emcc --version` が通る
- C++14 対応コンパイラ(ローカルテスト用、なくてもよい)

### 7.2 セットアップ

```bash
git clone <this-repo>
cd 2048-rl-web
git submodule update --init --recursive  # TDL2048 取得
npm install
```

### 7.3 WASM ビルド

```bash
cd core
./build.sh   # public/solver.{js,wasm} が生成される
cd ..
```

### 7.4 学習済み重みの取得

選択肢:
- 既存の `4x6patt.w.xz` を `https://moporgic.info/2048/model/4x6patt.w.xz` から取得
- もしくは TDL2048+ ローカルビルドで自前学習

`public/weights/4x6patt.w` に配置(xz は事前展開、もしくは fetch 時に DecompressionStream で展開)。

### 7.5 開発サーバ

```bash
npm run dev   # vite で http://localhost:5173 起動
```

### 7.6 本番ビルド

```bash
npm run build   # dist/ に静的サイト出力
```

## 8. 実装順序(推奨)

各ステップで動作確認できる粒度に区切る。

1. **リポジトリ初期化**: Vite + React + TypeScript テンプレ作成、TDL2048を submodule で追加
2. **C++ ラッパー骨組み**: `wrapper.cpp` で空の関数を定義し、`solver_init` だけ実装。`emcc` でビルド通すことが目標
3. **重みなしで `solver_evaluate` を返す**: ダミー値(常に 0)を返すだけ。WASM ↔ JS 通信を確立
4. **JS Adapter 層**: `createSolver` を書き、Node テストで `evaluate` が呼べることを確認
5. **N-Tuple 初期化を本実装**: `solver_init("4x6patt")` で TDL2048+ のネットワーク構造を構築
6. **重みロード**: `solver_load_weights` を実装。小さい構成で学習した自作 `.w` で動作確認
7. **`solver_step` 実装**: 1-ply greedy(探索なし)で行動選択
8. **最小UI**: 盤面描画と再生/停止だけ。実機でゲームが進むことを確認
9. **expectimax 探索**: depth パラメタを実装、UIから切り替えられるようにする
10. **可視化拡張**: V値ヒートマップ、4方向の評価値表示など(オプション)

各ステップで `git commit`。3、6、7、8 が大きな関門。

## 9. 落とし穴と対策

| 罠 | 対策 |
|---|---|
| `.w` フォーマット解読 | TDL2048+ の `weight::load` を読んで再現。最小ネットワーク(`2x4patt`)で学習した小さい `.w` で実験するのが速い |
| WASM のグローバル状態 | TDL2048+ は static 変数を多用。`solver_dispose` で確実にクリーンアップしないとリロード時に壊れる。HMR時は要注意 |
| BigInt のシリアライズ | JSON で `bigint` は使えない。状態保存時は `String(board)` |
| 重みファイルのCORS | `public/` 配下に置けば同オリジン。CDN 配信する場合は CORS 設定必要 |
| AVX2/BMI2 ビルドエラー | Emscripten は対応していない。`#if defined(__AVX2__)` のフォールバック側だけがビルドされることを確認 |
| メモリ不足 | `4x6patt` で 1GB弱。`INITIAL_MEMORY` を増やす。モバイルでは `4x5patt` 推奨 |
| TDL2048+ の CLI 依存 | `main()` ではなくライブラリとして使うため、`2048.cpp` 内の初期化シーケンスを読んで `wrapper.cpp` に移植する必要あり |

## 10. 拡張ポイント(後で追加する用のフック)

将来こういう改造が来ても無理なく対応できる構造にしておく:

- **UI 差し替え**: `Solver` インターフェースだけ守れば、UI を React → Svelte → Vanilla JS に置換可能
- **マルチスレッド化**: `solver` を Web Worker に押し込み、メインスレッドからは `postMessage` で呼ぶ。Adapter の API シグネチャは Promise化(`step` を `async` に)するだけで済むよう、最初から `Promise<Action>` を返す版も用意しておく
- **WebGPU 探索**: `solver_step` の depth>=4 を別パスに切り替えるフラグを Adapter に持たせる
- **複数エージェント並走**: `Solver` は instance 化されているので、`createSolver({ network: '4x5patt' })` と `createSolver({ network: '4x6patt' })` を2個作れば並列動作する
- **学習機能**: `solver_train_step(board, action, td_error)` を C ABI に追加
- **盤面状態の永続化**: `bigint` を string 化して localStorage、起動時に復元

## 11. 参考リンク

- TDL2048+: https://github.com/moporgic/TDL2048
- 学習済み重み配布: https://moporgic.info/2048/model/
- 関連論文: arXiv:2212.11087 (Hung Guei, "On Reinforcement Learning for the Game of 2048")
- Emscripten WASM SIMD: https://emscripten.org/docs/porting/simd.html