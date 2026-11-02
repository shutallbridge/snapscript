"""The solids of a base's printed parts: frames (#79), and the cores and
faces (#80). This module needs build123d, the `bases` extra; `blueprint`
holds what doesn't.

Each part is built where it sits in the card, then laid on the print bed.
"""

import math
from collections.abc import Sequence

from build123d import Align, Box, Compound, Cylinder, Location, Part, Plane, Polygon, Pos, Rot, extrude, mirror

from .blueprint import (
    BACK_LEG_Y,
    BAR_OFFSET,
    BAR_W,
    BEAM_H,
    BEAM_W,
    BEAM_X,
    CATCH_DEPTH,
    CORE_WALL,
    FRONT_LEG_Y,
    GUSSET,
    HOOK_FLAT,
    HOOK_REACH,
    ID_BITS,
    LAYER_Z,
    LEG_REACH,
    LEG_T,
    LEG_W,
    MARK_H,
    MARK_W,
    PLATE,
    RIB_FROM_LENGTH,
    SKIN,
    THICKNESS,
    WIDTH,
    BasePart,
    Tolerances,
    U,
    bores,
)
from .physics import Edges

_MIN = (Align.MIN, Align.MIN, Align.MIN)


def frame(
    card_class: str, class_id: int, edges: Edges, length: int, double_sided: bool, tolerances: Tolerances
) -> BasePart:
    """The frame of a card of `length` U, of the class with this name and
    ID, whose front has these edges: a ring with a bore for each magnet, and
    solid wall everywhere else. A single-sided frame has the back face, the
    wall down to it, the pads under the core and the ID beam's join to the
    back built in. Every frame has the ID beam, showing its class ID."""
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
    part += _beam(class_id, t)
    if double_sided:
        return _on_bed("frame", length, part, Location(), card_class, class_id)
    s = t.sheet_clearance
    part += Pos(0, 0, -s - PLATE) * Box(length_mm, WIDTH, PLATE, align=_MIN)
    if s > 0:
        # The wall down to the back, and pads under the core where the sheet would be.
        part += Pos(0, 0, -s) * _ring(length_mm, wall, s)
        part += Pos(0, 0, -s) * _core_footprint(length_mm, t, s)
        part += Pos(0, 0, -s) * _beam_footprint(t, s)
    part += _legs(length_mm, t, front=False)
    return _on_bed("frame", length, part, Pos(0, 0, s + PLATE), card_class, class_id)


def core(length: int, tolerances: Tolerances) -> BasePart:
    """The core of a card of `length` U: a ring that slides into the frame,
    with a cross-bar near each end and, from 4U up, a centre rib. Each end's
    cross-bar has a window for each leg of the front face and the back face,
    and its long walls a notch over a frame's ID beam near each end, so it
    goes in either way round."""
    t, length_mm = tolerances, length * U
    part = _core_footprint(length_mm, t, THICKNESS)
    window_w = LEG_W + 2 * t.slide_clearance
    window_h = LEG_REACH - CATCH_DEPTH
    for x in _bar_xs(length_mm)[:2]:
        # A front face's legs come in from z = T, and a back face's from z = 0.
        for dy, z in [(dy, THICKNESS - LEG_REACH) for dy in FRONT_LEG_Y] + [(dy, CATCH_DEPTH) for dy in BACK_LEG_Y]:
            part -= Pos(x, WIDTH / 2 + dy - window_w / 2, z) * Box(BAR_W, window_w, window_h, align=_MIN)
    notch_w = BEAM_W + 2 * t.slide_clearance
    for x in (BEAM_X, length_mm - BEAM_X):
        part -= Pos(x - notch_w / 2, 0, 0) * Box(notch_w, WIDTH, BEAM_H + t.slide_clearance, align=_MIN)
    return _on_bed("core", length, part, Location())


def face(length: int, tolerances: Tolerances, *, front: bool) -> BasePart:
    """The front or back face of a card of `length` U: a plate over that
    side, inset from the frame's outline and clear of it by the sheet
    clearance, with legs that hook through the core's windows."""
    t, length_mm = tolerances, length * U
    s = t.sheet_clearance
    z = THICKNESS + s if front else -s - PLATE
    part = Pos(s, s, z) * Box(length_mm - 2 * s, WIDTH - 2 * s, PLATE, align=_MIN)
    part += _legs(length_mm, t, front)
    if front:
        # Turned over about the card's long axis, onto its plate.
        return _on_bed("front-face", length, part, Pos(0, WIDTH, z + PLATE) * Rot(180, 0, 0))
    return _on_bed("back-face", length, part, Pos(0, 0, s + PLATE))


def assembly(parts: Sequence[BasePart], label: str) -> Compound:
    """These parts where they sit in the card, each labelled by its kind."""
    placed = []
    for part in parts:
        solid = part.placement * part.solid
        solid.label = part.kind
        placed.append(solid)
    return Compound(children=placed, label=label)


def _on_bed(
    kind: str, length: int, part: Part, bed: Location, card_class: str | None = None, class_id: int | None = None
) -> BasePart:
    """The part, built where it sits in the card, moved by `bed` onto the print bed."""
    return BasePart(kind, card_class, class_id, length, bed * part, bed.inverse())


def _beam(class_id: int, t: Tolerances) -> Part:
    """The ID beam, on the frame's back from one long wall to the other, with
    the class ID in ID_BITS bits on its top: a baseline along its left-end
    edge, cross ridges that split the rest into a cell per bit, bit 1 at the
    top-edge end, and a / stroke as read (left end toward you) in each 1's
    cell. The marks stay a slide gap clear of the core's inner walls."""
    part = _beam_footprint(t, BEAM_H)
    core_inside = t.frame_wall + t.slide_clearance + CORE_WALL  # the core's inner wall, from either long edge
    y_lo, y_hi = core_inside + t.slide_clearance, WIDTH - core_inside - t.slide_clearance
    x0 = BEAM_X - BEAM_W / 2
    part += Pos(x0, y_lo, BEAM_H) * Box(MARK_W, y_hi - y_lo, MARK_H, align=_MIN)
    cell_x0, cell_len, cell_width = x0 + MARK_W, BEAM_W - MARK_W, (y_hi - y_lo - (ID_BITS + 1) * MARK_W) / ID_BITS
    ridge = Box(cell_len, MARK_W, MARK_H, align=_MIN)
    stroke = Box(math.hypot(cell_len, cell_width), MARK_W, MARK_H)
    # From the near end, at high y, to the far end, at low y.
    turn = Rot(0, 0, 180 - math.degrees(math.atan2(cell_width, cell_len)))
    for i, bit in enumerate(format(class_id, f"0{ID_BITS}b")):
        top = y_hi - i * (cell_width + MARK_W)  # this cell's ridge, then the cell below it
        part += Pos(cell_x0, top - MARK_W, BEAM_H) * ridge
        if bit == "1":
            cell = Pos(cell_x0, top - MARK_W - cell_width, BEAM_H) * Box(cell_len, cell_width, MARK_H, align=_MIN)
            middle = Pos(cell_x0 + cell_len / 2, top - MARK_W - cell_width / 2, BEAM_H + MARK_H / 2)
            part += cell & (middle * turn * stroke)
    return part + Pos(cell_x0, y_lo, BEAM_H) * ridge  # the last ridge, under bit ID_BITS's cell


def _beam_footprint(t: Tolerances, height: float) -> Part:
    """Under the ID beam, `height` tall from z = 0, between the frame's long walls."""
    wall = t.frame_wall
    return Pos(BEAM_X - BEAM_W / 2, wall, 0) * Box(BEAM_W, WIDTH - 2 * wall, height, align=_MIN)


def _ring(length_mm: float, wall: float, height: float, width: float = WIDTH) -> Part:
    inner = Box(length_mm - 2 * wall, width - 2 * wall, height, align=_MIN)
    return Box(length_mm, width, height, align=_MIN) - Pos(wall, wall, 0) * inner


def _core_footprint(length_mm: float, t: Tolerances, height: float) -> Part:
    """Where the core sits, `height` tall: its ring and cross-bars."""
    gap = t.frame_wall + t.slide_clearance
    part = Pos(gap, gap, 0) * _ring(length_mm - 2 * gap, CORE_WALL, height, WIDTH - 2 * gap)
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


def _legs(length_mm: float, t: Tolerances, front: bool) -> Part:
    """A face's legs, which go in on the middle side of each end's cross-bar
    and hook back through its windows: drawn as a front face's near-end leg,
    then copied across, mirrored to the far end and, for the back, to the
    back."""
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
    for dy in FRONT_LEG_Y if front else BACK_LEG_Y:
        y0 = WIDTH / 2 + dy - LEG_W / 2
        # Plane.XZ faces -y, so this extrudes from y0 to y0 + LEG_W.
        leg = extrude(Plane.XZ.offset(-y0) * Polygon(*profile, align=None), amount=-LEG_W)
        legs = leg if legs is None else legs + leg
    legs += mirror(legs, Plane.YZ.offset(length_mm / 2))
    return legs if front else mirror(legs, Plane.XY.offset(THICKNESS / 2))
