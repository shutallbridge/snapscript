"""PROTOTYPE (#81): an ID beam across the frame that tells printed frames apart. Throwaway.

A beam lies on the frame's back side at x = 20, from one long wall to the other.
On its front-facing top stand a baseline along its left-end edge, cross ridges
that split it into 5 cells, and an X in each cell that holds a 1. The number is
the class's place in classes.yaml, counting from 1; bit 1 is the most significant
and sits at the top-edge end. The core gets a notch over the beam at both ends.

Read it with the back side down, the left end toward you, baseline nearest you,
left to right.

Run: `uv run --with build123d --with pyvista --with pyyaml python reference/beam.py`
"""

import math
from pathlib import Path

import yaml
from build123d import Box, Part, Pos, Rot, export_stl

from blueprint import MIN, Fixed, Tolerances, all_pockets, core, face, frame, frame_wall

BEAM_X = 20.0  # centre, from the left end: between the 2nd and 3rd pockets
BEAM_W = 3.2  # along the card
BEAM_H = 2.0
MARK = 0.8  # width of every ridge and X stroke
MARK_H = 1.0
BITS = 5

OUT = Path(__file__).parent / "beam-out"


def class_number(name: str) -> int:
    path = Path(__file__).parents[1] / "src/magnets/data/classes.yaml"
    return list(yaml.safe_load(path.read_text())).index(name) + 1


def _span(f: Fixed, t: Tolerances):
    """y range of the beam's marks: the core's opening, less a slide gap each side."""
    inner = frame_wall(f, t) + t.slide_clearance + f.core_wall
    return inner + t.slide_clearance, f.W - inner - t.slide_clearance


def beam(number: int, f: Fixed, t: Tolerances, x_mid: float, flip_x=False) -> Part:
    wall = frame_wall(f, t)
    x0 = x_mid - BEAM_W / 2
    part = Pos(x0, wall, 0) * Box(BEAM_W, f.W - 2 * wall, BEAM_H, align=MIN)
    y_lo, y_hi = _span(f, t)
    z = BEAM_H
    # baseline: along the edge nearest the left end (the right end for the mirrored beam)
    bx = x0 + BEAM_W - MARK if flip_x else x0
    part += Pos(bx, y_lo, z) * Box(MARK, y_hi - y_lo, MARK_H, align=MIN)
    cx0 = x0 if flip_x else x0 + MARK
    cell_x = BEAM_W - MARK
    cell_y = (y_hi - y_lo - (BITS + 1) * MARK) / BITS
    bits = format(number, f"0{BITS}b")
    for i in range(BITS + 1):  # cross ridges, from the top-edge end
        part += Pos(cx0, y_hi - MARK - i * (cell_y + MARK), z) * Box(cell_x, MARK, MARK_H, align=MIN)
    diag = math.hypot(cell_x, cell_y)
    ang = math.degrees(math.atan2(cell_x, cell_y))
    for i, b in enumerate(bits):  # bit 1 next to the top edge
        if b != "1":
            continue
        y1 = y_hi - MARK - (i + 1) * (cell_y + MARK) + MARK
        cell = Pos(cx0, y1, z) * Box(cell_x, cell_y, MARK_H, align=MIN)
        mid = Pos(cx0 + cell_x / 2, y1 + cell_y / 2, z + MARK_H / 2)
        for a in (ang, -ang):
            part += cell & (mid * Rot(0, 0, 90 - a) * Box(diag, MARK, MARK_H))
    return part


def id_frame(length_u: int, number: int, f: Fixed, t: Tolerances, single_sided: bool) -> Part:
    part = frame(length_u, f, t, all_pockets(length_u, f), single_sided)
    part += beam(number, f, t, BEAM_X)
    if single_sided:  # tie the beam down to the back plate, through the sheet gap
        wall = frame_wall(f, t)
        part += Pos(BEAM_X - BEAM_W / 2, wall, -t.sheet_clearance) * Box(
            BEAM_W, f.W - 2 * wall, t.sheet_clearance, align=MIN
        )
    return part


def id_core(length_u: int, f: Fixed, t: Tolerances) -> Part:
    L = length_u * f.U
    part = core(length_u, f, t)
    w = BEAM_W + 2 * t.slide_clearance
    for x in (BEAM_X, L - BEAM_X):  # both ends, so the core still goes in either way round
        part -= Pos(x - w / 2, 0, 0) * Box(w, f.W, BEAM_H + t.slide_clearance, align=MIN)
    return part


def clashes(parts: dict) -> list:
    names = list(parts)
    out = []
    for i, a in enumerate(names):
        for b in names[i + 1 :]:
            v = (parts[a] & parts[b]).volume
            out.append((a, b, v))
    return out


if __name__ == "__main__":
    f, t = Fixed(), Tolerances()
    OUT.mkdir(exist_ok=True)
    cases = [  # get is single-sided; color is a flip pair, so double-sided
        (2, "get", True),
        (2, "color", False),
        (4, "get", True),
        (4, "color", False),
    ]
    for length_u, name, single in cases:
        n = class_number(name)
        tag = f"{length_u}u-{name}-{'single' if single else 'double'}"
        parts = {
            "frame": id_frame(length_u, n, f, t, single),
            "core": id_core(length_u, f, t),
            "front_face": face(length_u, f, t, top=True),
        }
        if not single:
            parts["back_face"] = face(length_u, f, t, top=False)
        print(f"{tag}: class {name} = {n} = {n:05b}")
        for a, b, v in clashes(parts):
            print(f"  {a:10} x {b:10} overlap {v:.4f} mm^3")
        for k, p in parts.items():
            export_stl(p, str(OUT / f"{tag}-{k}.stl"))
