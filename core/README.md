# core/ — TDL2048+ WASM ビルド

本ディレクトリは TDL2048+ を Emscripten で WASM 化するための一式です。

## 構成

```
core/
├── third_party/TDL2048/    # git submodule (master pin)
├── patches/
│   ├── 0001-disable-main.patch        # main() を TDL2048_AS_LIBRARY 配下へ
│   ├── 0002-stub-shm-for-wasm.patch   # shm.h を WASM スタブに差し替え
│   └── 0003-expose-init.patch.TODO    # Phase 4 で実装、リネームで適用
├── shm_stub.h                          # System V IPC を使わない代替
├── wrapper.cpp                         # extern "C" ABI 実体
├── build.sh                            # emcc コマンド
└── README.md
```

## 前提

1. **emsdk のインストール**

   ```bash
   git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
   cd ~/emsdk
   ./emsdk install latest
   ./emsdk activate latest
   source ~/emsdk/emsdk_env.sh
   ```

   `emcc --version` が通れば OK。

2. **submodule の取得**

   ```bash
   git submodule update --init --recursive
   ```

## ビルド

```bash
bash core/build.sh
```

`public/solver.js` と `public/solver.wasm` が生成されます。

## 進捗ステータス

| Phase | 内容 | ステータス |
|---|---|---|
| 3 | 最小 WASM ビルド (ABI 形だけ、戻り値ダミー) | コード準備済み・要 emcc |
| 4 | N-Tuple 初期化と評価 | 未着手(0003 patch を作成) |
| 5 | step / simulate / spawn の本実装 | 未着手 |

## 詳細

- `wrapper.cpp` の関数本体は Phase 3 時点ではダミー(エラーコード返し)です。
- Phase 4 で `feature::make("4x6patt")` 相当を呼ぶラッパー実装を追加します。
- `requirements2.md` §5.1 と §9 を参照のこと。

## 既知の問題

- `weight::save` の structure-only モード切替方法は未確認(Phase 6 で確定)
- `cache` LUT 構築でモジュール init が数百 ms かかる可能性(計測必要)
- モバイル Safari は WASM ヒープ上限あり、4x6patt は不可の見込み
