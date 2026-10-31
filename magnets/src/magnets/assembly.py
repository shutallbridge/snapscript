"""The assembly page's data: each frame's walls, every position on them,
with the pole each layer's magnet faces out, if it has one."""

import html
import json
from collections.abc import Mapping
from dataclasses import dataclass
from fractions import Fraction
from importlib import resources

from .blueprint import BEAM_W, BEAM_X, THICKNESS, U, Tolerances
from .data import Arrangement, CardClass
from .physics import POSITIONS, Edges, Pocket, u_text

# Each wall in the order the page shows it, and whether it runs against its
# positions' order when seen from inside the ring, back down and left end
# toward the builder: a left or right end is measured from the top edge, a
# top or bottom edge from the left end.
WALLS_REVERSED = {"left": True, "top": False, "right": False, "bottom": True}
_OPPOSITE = {"N": "S", "S": "N", "-": "-"}


@dataclass(frozen=True)
class WallPosition:
    """A position on a frame's wall: `at` U from the left end, on the top
    and bottom edges, or from the top edge, on the left and right ends; and
    `along` U from the wall's left end, seen from inside the ring. `up` and
    `down` are the pole each layer's magnet faces out of the edge, N or S,
    or "-" for an empty layer; `pocket` is whether either has one."""

    at: Fraction
    along: Fraction
    up: str
    down: str

    @property
    def pocket(self) -> bool:
        return (self.up, self.down) != ("-", "-")

    @property
    def up_in(self) -> str:
        """The pole the up layer's magnet faces into the ring: the face pushed into its bore."""
        return _OPPOSITE[self.up]

    @property
    def down_in(self) -> str:
        """The pole the down layer's magnet faces into the ring."""
        return _OPPOSITE[self.down]


@dataclass(frozen=True)
class AssemblyFrame:
    """One frame of a class and length, as the assembly page shows it.
    `walls` holds each edge's wall, left, top, right, bottom, with every
    position on it in order from inside the ring, left to right."""

    card_class: str
    class_id: int
    length: int
    flip_pair: bool
    members: tuple[str, ...]
    magnets: int
    walls: Mapping[str, tuple[WallPosition, ...]]


def frame(cls: CardClass, front: Edges, length: int, magnets: int) -> AssemblyFrame:
    """The assembly page's view of a class's frame at `length`, from its front edges."""
    walls = {edge: _wall(front.get(edge, ()), edge, length, reverse) for edge, reverse in WALLS_REVERSED.items()}
    return AssemblyFrame(cls.name, cls.id, length, cls.flip_pair, _members(cls), magnets, walls)


def _wall(pockets: tuple[Pocket, ...], edge: str, length: int, reverse: bool) -> tuple[WallPosition, ...]:
    span = length if edge in ("top", "bottom") else 1
    found = {p.position(length): p for p in pockets}
    wall = []
    for at in (cell + x for cell in range(span) for x in POSITIONS):
        pocket = found.get(at)
        up, down = (pocket.up, pocket.down) if pocket else ("-", "-")
        wall.append(WallPosition(at, span - at if reverse else at, up, down))
    return tuple(reversed(wall) if reverse else wall)


def page_html(
    arrangement: Arrangement, classes: Mapping[str, CardClass], frames: tuple[AssemblyFrame, ...], max_length: int
) -> str:
    """The assembly page as one self-contained HTML file: the page's script
    with its data, every frame and every card class, as JSON in it."""
    data = {
        "arrangement": arrangement.name,
        "maxLength": max_length,
        "geometry": {"u": U, "thickness": THICKNESS, "wall": Tolerances().frame_wall, "beamX": BEAM_X, "beamW": BEAM_W},
        "classes": [
            {"name": c.name, "id": c.id, "minLength": c.min_length, "members": _members(c)} for c in classes.values()
        ],
        "frames": [
            {
                "class": f.card_class,
                "id": f.class_id,
                "length": f.length,
                "flipPair": f.flip_pair,
                "members": list(f.members),
                "magnets": f.magnets,
                "walls": {edge: [_position(p) for p in wall] for edge, wall in f.walls.items()},
            }
            for f in frames
        ],
    }
    # Nothing in the data may close the script it sits in.
    text = json.dumps(data, ensure_ascii=False, indent=1).replace("</", "<\\/")
    template = (resources.files("magnets") / "assembly.html").read_text(encoding="utf-8")
    title = html.escape(f"{arrangement.name} assembly page")
    return template.replace("/*TITLE*/", title).replace("/*DATA*/null", text)


def _members(cls: CardClass) -> tuple[str, ...]:
    return tuple(m for side in cls.sides for m in side.members)


def _position(p: WallPosition) -> dict:
    return {
        "at": u_text(p.at),
        "along": float(p.along),
        "pocket": p.pocket,
        "up": {"out": p.up, "in": p.up_in},
        "down": {"out": p.down, "in": p.down_in},
    }
