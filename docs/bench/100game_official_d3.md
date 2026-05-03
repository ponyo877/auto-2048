# 100-game bench — Official TDL2048+ 4x6patt weights at depth=3

Date: 2026-05-03
Source: https://moporgic.info/2048/model/4x6patt.w.xz (Hung Guei et al., TDL2048+, MIT)
File: 4x6patt.w (256 MB, structure-only — verified by exact byte count
  5 + 4 × (19 + 16777216×4 + 2) = 268,435,545)
Search: expectimax depth=3 + probability cutoff 1e-3, terminal V = 0
Bench harness: Node WASM, seeds = i*12345+7 for i=0..99

## Cumulative reach rate

| MAX | n | rate |
|---|---|---|
| 2048  | 100/100 | 100% |
| 4096  | 100/100 | 100% |
| 8192  | 100/100 | 100% |
| **16384** | **94/100** | **94%** |
| **32768** | **37/100** | **37%** |

## Distribution of terminal MAX

| MAX | count |
|---|---|
| 32768 | 37 |
| 16384 | 57 |
| 8192  |  6 |

## Key bug fixes that unlocked this performance

1. **Index bit order**: TDL2048+'s `indexpt<p0..p5>(b)` packs `b.at(p0)`
   into bit 0-3 (low) and `b.at(p5)` into bit 20-23. Our pattern_index
   already did this correctly — initial confusion led to a brief
   experiment with reversed positions that was reverted.

2. **Terminal V = 0**: `expectimax_max` returned `static_eval(b)` for
   game-over boards, which read whatever the trained network had learned
   for those rare/unreachable states. Some such V values are large
   positive or negative, polluting the search at depth >= 2. Returning 0
   for terminals is the correct convention and fixed the issue.

3. **Removed transposition table**: The `(board, depth)` key was unsound
   given that cached values depend on cumulative probability cutoff
   context. With well-trained weights the search is fast enough without
   TT and removing it eliminates a subtle drift.

## Performance by depth (smaller-sample probes)

| depth | 16384 | 32768 | per-game wall (Node) |
|---|---|---|---|
| 1 | 80% (16/20) | 0% | ~0.02 s |
| 2 | 90% (9/10)  | 30% (3/10) | ~0.3 s |
| 3 | 94% (94/100) | 37% (37/100) | ~5 s |

## Comparison with our own 1M-episode TC training

Same wrapper, same expectimax config, just different .w file:

| weights | 16384 (n=100) |
|---|---|
| Our TC 1M     | 67/100 (67%) |
| Official TDL2048+ | **94/100 (94%)** |

The training compute gap is ~3 orders of magnitude (we train ~1 hour on
M-series; the public 4x6patt weights come from days of TC-mode training
on x86 cores). With the same architecture, more training reaches the
publicly-known ceiling.
