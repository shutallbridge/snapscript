"""Rough build123d rebuild of the reference base, from the blueprint parameters (#75).

Throwaway: it checks that the parameter table is complete. Run with
`uv run --with build123d python reference/blueprint.py` to diff against the STEP.

Axes: x along the card (0..L), y across it (0..W), z through it (0..T, up is +z).
"""

from dataclasses import dataclass, field
from fractions import Fraction

from build123d import (
    Box, Cylinder, Part, Polygon, Pos, Rot, Vector, extrude, import_step, mirror, Plane, Align,
)

MIN = (Align.MIN, Align.MIN, Align.MIN)


@dataclass
class Tolerances:
    slide_clearance: float = 0.2  # gap per side between parts that slide together
    sheet_clearance: float = 0.2  # room for the paper sheet, per side and above
    magnet_clearance: float = 0.2  # gap per side around the magnet in its bore
    magnet_depth_clearance: float = 0.3  # how far the magnet can move front to back


@dataclass
class Fixed:
    # set by the language version and the kit
    U: float = 30.0
    W: float = 30.0  # card width, 1U
    T: float = 10.0  # frame thickness
    magnet_d: float = 3.0
    magnet_h: float = 1.5
    positions: tuple = (Fraction(1, 6), Fraction(1, 2), Fraction(5, 6))
    layer_z: tuple = (2.5, 7.5)  # down, up: T/4 and 3T/4
    # design, from the STEP
    skin: float = 0.6  # plastic between the magnet and the outside
    core_wall: float = 2.0
    plate: float = 1.2  # face plate thickness
    bar_offset: float = 10.0  # cross-bar's outer face, from the card end
    bar_w: float = 2.0
    leg_t: float = 1.0
    leg_w: float = 4.0
    top_leg_y: tuple = (-6.0, 6.0)  # from the card's centre line
    back_leg_y: tuple = (0.0,)
    catch_depth: float = 3.4  # hook catch, from the core face the leg comes in from
    leg_reach: float = 8.8  # leg tip, from that same core face
    hook_reach: float = 1.4  # tip, out from the leg's face
    hook_flat: float = 1.0
    gusset: float = 1.0  # leg-to-plate gusset, at the plate
    rib_from_length_u: int = 4  # centre rib from this length up


def frame_wall(f: Fixed, t: Tolerances) -> float:
    return f.skin + f.magnet_h + t.magnet_depth_clearance - t.slide_clearance


def all_pockets(length_u: int, f: Fixed):
    """Every position on every edge, both layers: the reference."""
    out = []
    for cell in range(length_u):
        for p in f.positions:
            x = float((cell + p) * f.U)
            out += [("bottom", x, z) for z in f.layer_z] + [("top", x, z) for z in f.layer_z]
    for p in f.positions:
        y = float(p * f.U)
        out += [("left", y, z) for z in f.layer_z] + [("right", y, z) for z in f.layer_z]
    return out


def frame(length_u: int, f: Fixed, t: Tolerances, pockets, single_sided=False) -> Part:
    L, W, T = length_u * f.U, f.W, f.T
    wall = frame_wall(f, t)
    part = Box(L, W, T, align=MIN) - Pos(wall, wall, 0) * Box(L - 2 * wall, W - 2 * wall, T, align=MIN)
    r = f.magnet_d / 2 + t.magnet_clearance
    depth = wall - f.skin
    mid = f.skin + depth / 2
    for edge, s, z in pockets:
        if edge == "bottom":
            c = Pos(s, mid, z) * Rot(90, 0, 0) * Cylinder(r, depth)
        elif edge == "top":
            c = Pos(s, W - mid, z) * Rot(90, 0, 0) * Cylinder(r, depth)
        elif edge == "left":
            c = Pos(mid, s, z) * Rot(0, 90, 0) * Cylinder(r, depth)
        else:
            c = Pos(L - mid, s, z) * Rot(0, 90, 0) * Cylinder(r, depth)
        part -= c
    if single_sided:
        # back plate, wall down to it, pads under the core, and the back face's legs
        part += Pos(0, 0, -t.sheet_clearance - f.plate) * Box(L, W, f.plate, align=MIN)
        ring = Pos(0, 0, -t.sheet_clearance) * (
            Box(L, W, t.sheet_clearance, align=MIN)
            - Pos(wall, wall, 0) * Box(L - 2 * wall, W - 2 * wall, t.sheet_clearance, align=MIN)
        )
        part += ring
        part += Pos(0, 0, -t.sheet_clearance) * _core_footprint(L, f, t, t.sheet_clearance)
        part += _legs(L, f, t, top=False)
    return part


def _core_footprint(L, f: Fixed, t: Tolerances, h) -> Part:
    g = frame_wall(f, t) + t.slide_clearance
    W = f.W
    ring = Pos(g, g, 0) * Box(L - 2 * g, W - 2 * g, h, align=MIN) - Pos(g + f.core_wall, g + f.core_wall, 0) * Box(
        L - 2 * (g + f.core_wall), W - 2 * (g + f.core_wall), h, align=MIN
    )
    inner_w = W - 2 * (g + f.core_wall)
    for x0 in _bar_xs(L, f):
        ring += Pos(x0, g + f.core_wall, 0) * Box(f.bar_w, inner_w, h, align=MIN)
    return ring


def _bar_xs(L, f: Fixed):
    xs = [f.bar_offset, L - f.bar_offset - f.bar_w]
    if L >= f.rib_from_length_u * f.U:
        xs.append(L / 2 - f.bar_w / 2)  # rib: no windows, nothing hooks it
    return xs


def core(length_u: int, f: Fixed, t: Tolerances) -> Part:
    L, W, T = length_u * f.U, f.W, f.T
    part = _core_footprint(L, f, t, T)
    win_w = f.leg_w + 2 * t.slide_clearance
    for x0 in (f.bar_offset, L - f.bar_offset - f.bar_w):
        for dy in f.top_leg_y:  # top face's legs come in from z = T
            z0 = T - f.leg_reach
            part -= Pos(x0, W / 2 + dy - win_w / 2, z0) * Box(f.bar_w, win_w, f.leg_reach - f.catch_depth, align=MIN)
        for dy in f.back_leg_y:  # back face's legs come in from z = 0
            part -= Pos(x0, W / 2 + dy - win_w / 2, f.catch_depth) * Box(
                f.bar_w, win_w, f.leg_reach - f.catch_depth, align=MIN
            )
    return part


def _leg_profile(f: Fixed, t: Tolerances, xb: float):
    """Near-end top leg, in XZ. xb is the cross-bar's inner face."""
    T, s = f.T, t.sheet_clearance
    x1 = xb + t.slide_clearance  # leg's outer face
    tip = x1 - f.hook_reach
    zc = T - f.catch_depth
    return [
        (x1, T + s),
        (x1, zc),
        (tip, zc - f.hook_reach),  # 45° catch
        (tip, zc - f.hook_reach - f.hook_flat),
        (x1, T - f.leg_reach),  # lead-in
        (x1 + f.leg_t, T - f.leg_reach),
        (x1 + f.leg_t, zc),
        (x1 + f.leg_t + f.gusset, T + s),
    ]


def _legs(L, f: Fixed, t: Tolerances, top: bool) -> Part:
    pts = _leg_profile(f, t, f.bar_offset + f.bar_w)
    W = f.W
    out = None
    for dy in f.top_leg_y if top else f.back_leg_y:
        y0 = W / 2 + dy - f.leg_w / 2
        prof = Plane.XZ.offset(-y0) * Polygon(*pts, align=None)
        leg = extrude(prof, amount=-f.leg_w) if Plane.XZ.z_dir.Y < 0 else extrude(prof, amount=f.leg_w)
        out = leg if out is None else out + leg
    out += mirror(out, Plane.YZ.offset(L / 2))
    if not top:
        out = mirror(out, Plane.XY.offset(f.T / 2))
    return out


def face(length_u: int, f: Fixed, t: Tolerances, top=True) -> Part:
    L, W, T, s = length_u * f.U, f.W, f.T, t.sheet_clearance
    z = T + s if top else -s - f.plate
    plate = Pos(s, s, z) * Box(L - 2 * s, W - 2 * s, f.plate, align=MIN)
    return plate + _legs(L, f, t, top)


def _mismatch(a, b, n=20000):
    """Random points inside one body but not the other. Booleans fail on the coincident bores."""
    import random

    random.seed(1)
    lo, hi = b.bounding_box().min, b.bounding_box().max
    pts = (Vector(random.uniform(lo.X, hi.X), random.uniform(lo.Y, hi.Y), random.uniform(lo.Z, hi.Z)) for _ in range(n))
    return sum(a.is_inside(p) != b.is_inside(p) for p in pts)


if __name__ == "__main__":
    f = Fixed()
    t = Tolerances(magnet_depth_clearance=0.5)  # what the reference was drawn with
    pk = all_pockets(3, f)
    built = {
        "outer_double": frame(3, f, t, pk),
        "inner": core(3, f, t),
        "top_face": face(3, f, t, top=True),
        "back_face": face(3, f, t, top=False),
        "outer_single": frame(3, f, t, pk, single_sided=True),
    }
    ref = dict(zip(built, import_step("reference/card-base-3u.step").solids()))
    for name, part in built.items():
        print(f"{name:14} ref {ref[name].volume:9.2f}  built {part.volume:9.2f}  mismatched points {_mismatch(part, ref[name])}/20000")


def export(path: str, length_u: int, pockets, t: Tolerances = Tolerances(), f: Fixed = Fixed()):
    """All five bodies, in place, with names, for a look in CAD."""
    from build123d import Compound, export_step

    parts = {
        "outer_double": frame(length_u, f, t, pockets),
        "inner": core(length_u, f, t),
        "top_face": face(length_u, f, t, top=True),
        "back_face": face(length_u, f, t, top=False),
        "outer_single": frame(length_u, f, t, pockets, single_sided=True),
    }
    for name, p in parts.items():
        p.label = name
    export_step(Compound(children=list(parts.values()), label=f"base_{length_u}u"), path)
