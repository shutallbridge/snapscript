# PROTOTYPE results: simpler pockets (#10)

Throwaway. `uv run python prototype_variants.py <variant> top_bottom <goal> 300`, seed 0, 8 workers.
"One layer" = every pocket empty or one full-thickness magnet (`N/N`, `S/S`). Every variant except baseline has no steel.

| variant | goal | valid | avoidable should / nice leaks | pockets (uniform, half, split) | status, objective / bound |
|---|---|---|---|---|---|
| baseline (N S F -) | no_snap | VALID | 0 / 0 | 49 (49, 0, 0) | optimal 0.49 |
| no steel | no_snap | VALID | 0 / 0 | 57 (36, 21, 0) | feasible 0.675 / 0.585 |
| one layer | no_snap | VALID | 1 / 0 | 69 (69, 0, 0) | optimal 250.69 |
| two positions | no_snap | VALID | 1 / 0 | 60 (36, 24, 0) | optimal 250.72 |
| one layer + two positions | no_snap | VALID | 25 / 0 | 70 (70, 0, 0) | optimal 10375.7 |
| baseline (N S F -) | repel | VALID | 0 / 0 | 163 (47, 100, 16) | feasible 68006.29 / 65367.04 |
| no steel | repel | VALID | 0 / 0 | 166 (45, 105, 16) | feasible 68006.345 / 65475.97 |
| one layer | repel | VALID | 8 / 1 | 144 (144, 0, 0) | feasible 80666.44 / 74353.2 |
| two positions | repel | VALID | 4 / 4 | 162 (29, 127, 6) | feasible 70824.415 / 66852.8 |
| one layer + two positions | repel | VALID | 28 / 1 | 109 (109, 0, 0) | optimal 90365.09 |

All four legal bundled programs pass in every run. The one should-leak under no_snap for
one layer and for two positions is the same: `[-] [optional{p}] @0`.

## Magnet cost (after the bench test: one magnet in one layer is strong enough)

No steel, two layers, three positions, `top_bottom`, 300 s. "magnet x" = every magnet costs x
(half pocket 1 magnet, uniform and split 2), instead of the per-shape tie-breaker. Magnets are
counted for the four legal bundled programs, each built twice (180 cards). All legal programs pass.

| run | magnets | per card | forbid contacts snap / mixed / nothing / repel | avoidable should / nice leaks | status |
|---|---|---|---|---|---|
| no_snap, shape tie-breaker | 1112 | 6.2 | 11750 / 0 / 474110 / 0 | 0 / 0 | feasible 0.675 / 0.585 |
| no_snap, magnet 0.01 | 854 | 4.7 | 8375 / 425 / 476685 / 375 | 0 / 0 | optimal 0.73 |
| repel, shape tie-breaker | 2024 | 11.2 | 26925 / 6050 / 403185 / 49700 | 0 / 0 | feasible 68006.345 / 65475.97 |
| repel, magnet 0.01 | 1726 | 9.6 | 18400 / 850 / 418010 / 48600 | 0 / 0 | feasible 68006.07 / 65495.99 |
| repel, magnet 1 | 1726 | 9.6 | 39950 / 300 / 403810 / 41800 | 0 / 0 | feasible 68211 / 65623.8 |
| repel, magnet 10 | 1700 | 9.4 | 17925 / 3250 / 424310 / 40375 | 0 / 0 | feasible 70056.5 / 67124.8 |
| repel, magnet 100 | 1518 | 8.4 | 16725 / 125 / 436890 / 32120 | 4 / 0 | feasible 86277.5 / 79733.3 |
