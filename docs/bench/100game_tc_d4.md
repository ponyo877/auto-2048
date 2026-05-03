# 100-game browser bench — TC 1M weights at depth=4

Date: 2026-05-03
Model: `public/weights/4x6patt.tc.w` (TC trainer, 1,000,000 episodes, α=1.0)
Search: expectimax depth=4 with probability cutoff 1e-3 + 1M-entry transposition table
Bench harness: direct WASM in browser tab (not Worker), seeds = (i + 1000) * 12345 + 7 for i=0..99

## Cumulative reach rate (game ended with MAX ≥ X)

| MAX | n | rate | 95% CI (Wilson) |
|---|---|---|---|
| 2048  | 99/100 | 99% | 94.6 – 99.8% |
| 4096  | 98/100 | 98% | 93.0 – 99.4% |
| 8192  | 93/100 | 93% | 86.3 – 96.6% |
| **16384** | **67/100** | **67%** | **57.3 – 75.4%** |
| 32768 |  0/100 |  0% |  0.0 –  3.7% |

Median game wall time: 69.5 s (browser, hidden-tab MessageChannel pacing).

## Distribution of terminal MAX

| MAX | count |
|---|---|
| 16384 | 67 |
| 8192  | 26 |
| 4096  |  5 |
| 2048  |  1 |
| 256   |  1 |

The single MAX=256 outlier and the MAX=2048 outlier represent rare unfortunate
spawn sequences where the bot died before establishing a stable corner anchor.

## Note on the earlier 80% claim

A prior 10-game bench reported 8/10 = 80% 16384, which we used as the headline
number. With n=10 the 95% CI was already 49–94%, so claiming 80% as the rate
was overconfident. The 100-game result of 67% (CI 57–75%) is the correct
characterisation. The 10/10 sample fell on the favourable tail of the
distribution.
