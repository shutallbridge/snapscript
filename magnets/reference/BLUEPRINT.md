# Blueprint: the base as parameters (#75)

What the build123d generator needs to rebuild the reference base at any card class, length and arrangement. `blueprint.py` rebuilds the 3U reference from this table alone. Against the STEP, 20 000 random points per body give 0 mismatches, or 1 on the core, where the STEP's hook catch is at 3.398 mm and not 3.4 mm.

Axes: x along the card (0 to L), y across it (0 to 30), z through it (0 to 10, up is +z).

## How the parts fit

- **Frame:** a ring, as long as the card. Every pocket is a bore from the frame's inner face to 0.6 mm from the outside. Each layer of a pocket is its own bore.
- **Core:** a ring that slides into the frame and closes the open side of the bores. It has a cross-bar near each end. The face legs hook into windows in these bars.
- **Top face and back face:** plates with legs. A leg goes in on the middle side of a cross-bar. Its hook reaches back through a window, toward the card's end. The catch is at 45°, so a face pulls off again.
- **Single-sided frame:** the frame, the back face and small pads under the core, as one part.
- **Sheet:** the paper wraps around the base. It goes between each face and the frame.

## Tolerances (the builder sets these)

Each tolerance is a gap on **one side**, the usual meaning for 3D printing.

| Name | Default | Sets |
|---|---|---|
| `slide_clearance` | 0.2 | Core to frame on each side. Leg to cross-bar. Window width = leg + 2 × this. |
| `sheet_clearance` | 0.2 | Face plate inset from the frame outline on each side, and its gap above the frame. The single-sided frame's pads under the core. |
| `magnet_clearance` | 0.2 | Bore diameter = magnet + 2 × this. |
| `magnet_depth_clearance` | 0.3 | How far the magnet can move front to back. Sets the frame wall (see below). The reference was drawn with 0.5. |

### Derived

| Value | Formula | Default | Reference |
|---|---|---|---|
| Frame wall | skin + magnet thickness + `magnet_depth_clearance` − `slide_clearance` | 2.2 | 2.4 |
| Bore depth | frame wall − skin | 1.6 | 1.8 |
| Bore diameter | magnet diameter + 2 × `magnet_clearance` | 3.4 | 3.4 |
| Core outer | frame inner + `slide_clearance` per side | | |
| Face plate size | L − 2 × `sheet_clearance` by W − 2 × `sheet_clearance` | | 89.6 × 29.6 |
| Leg length | `leg_reach` + `sheet_clearance` | | 9.0 |

Bore depth is not a free value: a bore has to reach the frame's inner face, or the magnet can't go in. The magnet moves in the bore and the slide gap together.

## Varies (from the language version and the arrangement)

| What | From |
|---|---|
| Length L | the card's length in U, × 30 |
| Which bores exist | the magnet arrangement: card class, edge, position, layer |
| Pocket shape | uniform or split: both layers bored. Half (`-/N`): only the filled layer bored. Empty position: no bore, solid wall. |
| Single- or double-sided frame | the card class |
| Centre rib | 4U and longer: one extra cross-bar at L/2 with no windows. Nothing hooks it. It supports both faces when pressed. |

## Fixed (the same for every builder)

Set by the language version and the kit:

| Name | Value | Note |
|---|---|---|
| U | 30 | |
| Card width W | 30 | 1U |
| Frame thickness T | 10 | |
| Magnet | 3 × 1.5 | diameter × thickness |
| Positions | ⅙, ½, ⅚ U into each cell | on the short edges too, at 5, 15 and 25 mm |
| Layer centres | 2.5 (down), 7.5 (up) | T/4 and 3T/4 |
| Skin | 0.6 | plastic between the magnet and the outside. Thinner won't print, and thicker weakens the snap. |

Design values from the STEP:

| Name | Value | Note |
|---|---|---|
| `core_wall` | 2.0 | |
| `plate` | 1.2 | face plate thickness |
| `bar_offset` | 10 | cross-bar's outer face, from the card end. The same at every length. |
| `bar_w` | 2.0 | also the centre rib's width |
| `leg_t` × `leg_w` | 1.0 × 4.0 | |
| Top legs | y = 9 and 21 (W/2 ± 6) | two per end |
| Back legs | y = 15 (W/2) | one per end |
| `catch_depth` | 3.4 | hook catch, from the core face the leg comes in from |
| `leg_reach` | 8.8 | leg tip, from that same face |
| `hook_reach` | 1.4 | hook tip, out from the leg's face. Catch at 45°. |
| `hook_flat` | 1.0 | |
| `gusset` | 1.0 | where the leg meets the plate |
