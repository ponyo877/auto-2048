# AutoPlay 2048

ブラウザで 2048 を学習済み N-Tuple Network エージェントが自動プレイするデモ。
コアは [TDL2048+](https://github.com/moporgic/TDL2048) (MIT, Hung Guei 2021) の Emscripten WASM 化。

> npm package name: `autoplay-2048`

## 現在の状態

- **Phase 0 ~ 2**: 完了
- **Phase 3 (WASM 最小ビルド)**: コード準備済み、emsdk 未導入のため未ビルド
- **UI**: MockSolver(ヒューリスティック)で end-to-end 動作可能

## クイックスタート

```bash
git clone <this-repo>
cd auto-2048
git submodule update --init --recursive
npm install
npm run dev          # http://localhost:5173 で MockSolver 版が動く
```

WASM コアまで通すには:

```bash
# emsdk セットアップ (一度だけ)
git clone https://github.com/emscripten-core/emsdk.git ~/emsdk
cd ~/emsdk && ./emsdk install latest && ./emsdk activate latest
source ~/emsdk/emsdk_env.sh

# ビルド
cd <repo>
bash core/build.sh   # public/solver.{js,wasm} を生成
```

## ディレクトリ

```
.
├── .claude/             # Claude Code 用設定 (cognitive complexity hook)
├── .husky/              # git pre-commit hook
├── core/                # C++/WASM 層
│   ├── wrapper.cpp      # 独自実装の expectimax / 4x6patt evaluator (extern "C" ABI)
│   └── build.sh
├── src/
│   ├── solver/          # TS 層 (Worker + Proxy + Mock + WASM ローダ)
│   │   └── __tests__/   # vitest
│   └── ui/              # React UI (差し替え可能)
├── public/weights/      # 学習済み重み (gitignore)
├── tools/               # 重み変換 CLI (Phase 6 で実装)
├── requirements.md      # 元の素案
├── requirements2.md     # 現実調査済みの実装計画書
└── README.md            # このファイル
```

## 品質ゲート

このリポジトリは **関数ごとの cognitive complexity (SonarSource 指標) を 20 以下に強制**しています。3 段で守ります:

| ゲート | 仕組み | トリガー |
|---|---|---|
| 1. Claude Code hook | `.claude/hooks/check-complexity.sh` (PostToolUse, exit 2 でブロック) | Edit/Write/MultiEdit |
| 2. pre-commit | husky + lint-staged | `git commit` |
| 3. 手動 / CI | `npm run lint:complexity` | 任意 |

`sonarjs/cognitive-complexity` ルールを `.eslintrc.cognitive.cjs` で `error: 20` 固定。

```bash
npm run lint            # フル lint
npm run lint:complexity # 複雑度のみ
npm run typecheck       # tsc --noEmit
npm test                # vitest
```

### ローカルでゲートを試す

意図的に複雑なコードを書いて hook が止めることを確認:

```bash
cat > /tmp/bad.ts <<'EOF'
function bad(x:number){ if(x>0){if(x>1){if(x>2){if(x>3){if(x>4){if(x>5){if(x>6){if(x>7){if(x>8){return 1;}}}}}}}}} return 0; }
EOF
npx eslint --no-eslintrc --config .eslintrc.cognitive.cjs --resolve-plugins-relative-to . /tmp/bad.ts
# -> error  Refactor this function to reduce its Cognitive Complexity from N to the 20 allowed
```

## 開発

| スクリプト | 内容 |
|---|---|
| `npm run dev` | Vite 開発サーバ |
| `npm run build` | プロダクションビルド |
| `npm run preview` | ビルド後プレビュー |
| `npm test` | vitest run |
| `npm run test:watch` | vitest watch |
| `npm run lint` | ESLint フル |
| `npm run lint:complexity` | 複雑度ゲートのみ |
| `npm run lint:fix` | 自動修正 |
| `npm run typecheck` | TypeScript 型チェック |

## アーキテクチャ

requirements2.md §3 を参照。4 層構造:

```
UI (React) → Solver Proxy (TS) → Solver Worker (TS) → Core (C++/WASM)
```

UI 層を React 以外に差し替えても、Proxy のインターフェース (`Solver` interface in `src/solver/types.ts`) を守れば下層は無変更。

## 参考

- TDL2048+ : https://github.com/moporgic/TDL2048 (MIT, Hung Guei 2021)
- 学習済み重み: https://moporgic.info/2048/model/ (MIT, 同上著者; 詳細は [`NOTICE.md`](./NOTICE.md) §3)
- 元祖 2048: https://github.com/gabrielecirulli/2048 (MIT, Gabriele Cirulli 2014)
- 関連論文: arXiv:2212.11087 / IEEE TG vol. 14 no. 3 (doi:10.1109/TG.2021.3109887)
- 詳細仕様: [`requirements2.md`](./requirements2.md)

## ライセンスと帰属

このリポジトリのソースコード (TypeScript / C++ / build script / 設定 / ドキュメント)
は **MIT License** で公開しています。詳細は [`LICENSE`](./LICENSE)、第三者帰属の
全文は [`NOTICE.md`](./NOTICE.md) を参照してください。

| 項目 | 著作権 / ライセンス | 当 repo での扱い |
|---|---|---|
| `AutoPlay 2048` 本体のソース | MIT, © 2026 ponyo877 | 自前実装 |
| 元祖 *2048* (Gabriele Cirulli, 2014) | MIT | コード非流用 — 礼儀としての帰属表記のみ |
| TDL2048+ (Hung Guei, 2021) — アルゴリズム / `.w` フォーマット | MIT | `core/wrapper.cpp` は独自実装、ソース非流用 |
| **4x6patt 学習済み重み** | MIT (Hung Guei, 2021) として再配布 | `public/weights/4x6patt.trained.w.gz`(gitignore、build で `dist/` に同梱) |

### 重みファイルの法的根拠 (要約)

`moporgic/TDL2048` の README は重み URL `https://moporgic.info/2048/model/4x6patt.w.xz`
を build pipeline の一部として明示参照しており、makefile は
`curl -OJRf moporgic.info/2048/model/$@.w.xz && xz -vd $@.w.xz` で同 URL を
自動取得します。これらは MIT ライセンスの配布物の一部であるため、当 repo は
重みファイルを **同 MIT ライセンス・著者帰属保持** で再配布しています。
詳細は [`NOTICE.md` §3](./NOTICE.md) を参照。

このリポジトリを fork / redistribute する場合は、`LICENSE` と `NOTICE.md`、および
アプリ UI の "How it plays" パネルに記載された帰属表記を**そのまま保持してください**。
