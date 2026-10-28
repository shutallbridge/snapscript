# Edge-mounted magnets in two-layer pockets

Partly superseded by ADR 0006: pockets hold magnets only, no steel, and two layers stay for other reasons than the one below.

Cards lie flat and connect edge to edge, so every magnet is mounted in the edge, its pole facing sideways into the card it abuts. Each pocket holds up to two pieces stacked through the card's thickness (up and down layers), each a magnet or a plain steel piece. Lap joints and side-by-side flat discs were considered and dropped.

Two layers matter because of flip pairs: flipping a card turns every pocket over (`P/Q` becomes `Q/P`), so where an edge meets its own flipped copy, it can only snap if a pocket's two layers attract each other. With a top-to-bottom flip, `[get(x)]` under `[set(x)to]` is exactly that case, and single-layer pockets could never make it snap.
