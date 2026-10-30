# Reference card base (3U)

Shu's Fusion 360 reference for the card base, from #74. It's a reference only: the base generator never loads it, and this branch never lands on main. #75 turns it into a blueprint.

- `card-base-3u.step`: the design, exported from Fusion.
- `card-base-3u-bench.jpg`: the bench print, wrapped in paper, with a `circle` sheet.

The ticket asked for 2U; the reference is 3U, so it includes a middle cell.

## Bodies

| Body | Size (mm) | Role |
|---|---|---|
| `base_outer_double_sided` | 90 × 30 × 10 | Outer frame with every pocket, for double-sided cards |
| `base_outer_single_sided` | 90 × 30 × 11.4 | Outer frame for single-sided cards |
| `base_inner` | 84.8 × 24.8 × 10 | Core that slides into the frame and holds the magnets in. Shared by both frames |
| `top_face` | 89.6 × 29.6 × 10.2 | Top face. Shared by both frames |
| `back_face` | 89.6 × 29.6 × 10.2 | Back face, for double-sided cards |

The paper sheet wraps around the base rather than being taped to one face. Wrapping keeps it from coming off.

## Pockets

48 pockets, one at every position (⅙, ½ and ⅚ U into each cell, so 5, 15 and 25 mm) on every edge, in both layers:

- 3.4 mm diameter, for the kit's 3 × 1.5 mm magnet;
- 1.8 mm deep, from 0.6 mm to 2.4 mm in from the outer face;
- layer centres at 2.5 mm (down) and 7.5 mm (up) in the 10 mm thickness.

Magnets press into the frame's pockets, and the inner core holds them in place.

## Fusion user parameters

STEP doesn't carry Fusion's user parameters, so here they are by hand.

| In Fusion | Value | What it is |
|---|---|---|
| `slide_tolerance` | 0.2 mm | Gap between any plastic parts that slide against each other |
| `paper_tolerance` | 0.2 mm | Room left for the paper sheet |
| *(not yet a parameter)* | 0.2 mm | Gap around the magnet in its pocket |

These are the three builder tolerances from #73: slide fit, sheet fit and magnet fit. #75 settles their final names. One proposal is `slide_clearance`, `sheet_clearance` and `magnet_clearance`.
