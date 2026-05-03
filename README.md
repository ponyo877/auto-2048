# AutoPlay 2048

ブラウザで 2048 を学習済み N-Tuple Network エージェントが自動プレイするデモ。
コアは [TDL2048+](https://github.com/moporgic/TDL2048) (MIT, Hung Guei 2021) の 4x6patt 重みを使った expectimax search を Emscripten で WASM 化したもの。

**Live**: <https://autoplay2048.ponyo877.com/>

![AutoPlay 2048](./public/og.png)

100-game bench (depth 3): **16384 94%, 32768 37%**.

## ライセンス

- このリポジトリのコードは **MIT**。同梱・再配布する第三者成果物の MIT も全て[`LICENSE`](./LICENSE)に集約。
- 各成果物の出自・帰属の詳細は[`NOTICE.md`](./NOTICE.md)。
