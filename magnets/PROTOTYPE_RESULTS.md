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
