# Magnets only, no steel

Pockets hold magnets only. A layer is `N`, `S` or empty (`-`); there are no plain steel pieces. This partly supersedes ADR 0001, which let each piece be "a magnet or a plain steel piece". Pockets keep their two layers.

On the bench, a magnet on galvanised steel held much more weakly than a magnet on a magnet. Steel was there to attract either pole, but a magnet facing the opposite pole does the same job more firmly. Dropping it costs nothing: in the prototype searches (branch `prototype/simpler-pockets`), both search goals still found a valid arrangement with no steel, and no avoidable should- or nice-leaks.

ADR 0001's reason for two layers no longer holds. It was an edge that meets its own flipped copy, which can only snap if a pocket's two layers attract each other. Since ADR 0003, flip pairs take the same roles on both sides and turn top-to-bottom, so no connect in the current grammar puts an edge against its own flipped copy.

Two layers stay for other reasons:

- **One magnet is enough.** A half pocket (one magnet in one layer, facing one magnet in one layer) snaps firmly on the bench, so a pocket needs no second magnet for strength, and two layers let the search choose either layer.
- **One layer leaks.** In the prototype, pockets that were either empty or one full-thickness magnet (`N/N`, `S/S` only) left an avoidable should-leak, `[-] [optional{p}] @0`, that two layers avoid.

## Consequences

- An arrangement with an `F` layer is rejected, with a message naming the allowed layers.
- `-` with anything does nothing; `N`–`S` attracts; `N`–`N` and `S`–`S` repel.
- The bundled `example` arrangement, which used `F/F` pockets, uses magnets only.
