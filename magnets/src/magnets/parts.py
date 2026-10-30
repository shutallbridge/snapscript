"""The solids of a base's printed parts: for now, the frames (#79). This
module needs build123d, the `bases` extra; `blueprint` holds what doesn't.
"""

from build123d import Align, Box, Cylinder, Part, Plane, Polygon, Pos, Rot, extrude, mirror

from .blueprint import (
    BACK_LEG_Y,
    BAR_OFFSET,
    BAR_W,
    CATCH_DEPTH,
    CORE_WALL,
    GUSSET,
    HOOK_FLAT,
    HOOK_REACH,
    LAYER_Z,
    LEG_REACH,
    LEG_T,
    LEG_W,
    PLATE,
    RIB_FROM_LENGTH,
    SKIN,
    THICKNESS,
    WIDTH,
    Tolerances,
    U,
    bores,
)
from .physics import Edges

_MIN = (Align.MIN, Align.MIN, Align.MIN)


def frame(edges: Edges, length: int, double_sided: bool, tolerances: Tolerances) -> Part:
    """The frame of a card of `length` U whose front has these edges: a ring
    with a bore for each magnet, and solid wall everywhere else. A
    single-sided frame has the back face, the wall down to it and the pads
    under the core built in."""
    t, length_mm = tolerances, length * U
    wall = t.frame_wall
    part = _ring(length_mm, wall, THICKNESS)
    # Each layer of a pocket is its own bore, from the skin to the frame wall's inside.
    mid = SKIN + t.bore_depth / 2
    for edge, along, layer in bores(edges, length):
        z = LAYER_Z[layer]
        bore = Cylinder(t.bore_diameter / 2, t.bore_depth)
        if edge == "bottom":
            part -= Pos(along, mid, z) * Rot(90, 0, 0) * bore
        elif edge == "top":
            part -= Pos(along, WIDTH - mid, z) * Rot(90, 0, 0) * bore
        elif edge == "left":
            part -= Pos(mid, along, z) * Rot(0, 90, 0) * bore
        else:
            part -= Pos(length_mm - mid, along, z) * Rot(0, 90, 0) * bore
    if double_sided:
        return part
    s = t.sheet_clearance
    part += Pos(0, 0, -s - PLATE) * Box(length_mm, WIDTH, PLATE, align=_MIN)
    if s > 0:
        # The wall down to the back, and pads under the core where the sheet would be.
        part += Pos(0, 0, -s) * _ring(length_mm, wall, s)
        part += Pos(0, 0, -s) * _core_footprint(length_mm, t, s)
    part += _back_legs(length_mm, t)
    return Pos(0, 0, s + PLATE) * part


def _ring(length_mm: float, wall: float, height: float) -> Part:
    inner = Box(length_mm - 2 * wall, WIDTH - 2 * wall, height, align=_MIN)
    return Box(length_mm, WIDTH, height, align=_MIN) - Pos(wall, wall, 0) * inner


def _core_footprint(length_mm: float, t: Tolerances, height: float) -> Part:
    """Where the core sits, `height` tall: its ring and cross-bars."""
    gap = t.frame_wall + t.slide_clearance
    part = Pos(gap, gap, 0) * _ring(length_mm - 2 * gap, CORE_WALL, height)
    inner = WIDTH - 2 * (gap + CORE_WALL)
    for x in _bar_xs(length_mm):
        part += Pos(x, gap + CORE_WALL, 0) * Box(BAR_W, inner, height, align=_MIN)
    return part


def _bar_xs(length_mm: float) -> list[float]:
    """Each cross-bar's lower x: one near each end, and from 4U up a centre rib that nothing hooks."""
    xs = [BAR_OFFSET, length_mm - BAR_OFFSET - BAR_W]
    if length_mm >= RIB_FROM_LENGTH * U:
        xs.append(length_mm / 2 - BAR_W / 2)
    return xs


def _back_legs(length_mm: float, t: Tolerances) -> Part:
    """The back face's legs, which hook the core from below: drawn as a
    front face's near-end leg, then mirrored to the far end and to the back."""
    s = t.sheet_clearance
    x1 = BAR_OFFSET + BAR_W + t.slide_clearance  # the leg's outer side, past the cross-bar's inner side
    tip = x1 - HOOK_REACH
    catch = THICKNESS - CATCH_DEPTH
    profile = [
        (x1, THICKNESS + s),
        (x1, catch),
        (tip, catch - HOOK_REACH),  # the 45° catch
        (tip, catch - HOOK_REACH - HOOK_FLAT),
        (x1, THICKNESS - LEG_REACH),  # the lead-in
        (x1 + LEG_T, THICKNESS - LEG_REACH),
        (x1 + LEG_T, catch),
        (x1 + LEG_T + GUSSET, THICKNESS + s),
    ]
    legs = None
    for dy in BACK_LEG_Y:
        y0 = WIDTH / 2 + dy - LEG_W / 2
        # Plane.XZ faces -y, so this extrudes from y0 to y0 + LEG_W.
        leg = extrude(Plane.XZ.offset(-y0) * Polygon(*profile, align=None), amount=-LEG_W)
        legs = leg if legs is None else legs + leg
    legs += mirror(legs, Plane.YZ.offset(length_mm / 2))
    return mirror(legs, Plane.XY.offset(THICKNESS / 2))
