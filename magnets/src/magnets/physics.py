"""Magnet physics: layers, pocket shapes, flips, and what two edges do.

A pocket's layers are written `P/Q` (P = up, Q = down); each is a magnet,
`N` or `S`, or `-` (empty). Facing pockets interact layer by layer.
"""

import math
from dataclasses import dataclass, replace
from fractions import Fraction
from typing import Literal

LAYERS = ("N", "S", "-")
FLIPS = ("top_bottom", "left_right")
TOP_BOTTOM_EDGES = ("top", "bottom")
LEFT_RIGHT_EDGES = ("left", "right")
EDGES = TOP_BOTTOM_EDGES + LEFT_RIGHT_EDGES
# Where a pocket can sit within one 1U cell, in U from the cell's start.
# Every cell has the same positions, spread evenly, so neighbouring pockets
# are as far apart across a cell boundary as within a cell. A left/right
# edge is one cell, and a pocket's position there is its height from the
# top edge. The positions are symmetric (h and 1 - h), so they are the same
# from either end of a card.
POSITIONS = (Fraction(1, 6), Fraction(1, 2), Fraction(5, 6))
# Pockets line up only at offsets that are a multiple of this: a difference
# of two positions (same anchor) or a sum (opposite anchors), give or take
# whole U.
OFFSET_STEP = Fraction(
    1, math.lcm(*(d.denominator for p in POSITIONS for q in POSITIONS for d in (p - q, p + q)))
)

Interaction = Literal["attract", "repel", "nothing"]
Result = Literal["snap", "repel", "mixed", "nothing"]
Shape = Literal["uniform", "half", "split"]


def interact(p: str, q: str) -> Interaction:
    """What one layer does to the layer facing it."""
    if p == "-" or q == "-":
        return "nothing"
    return "attract" if p != q else "repel"


def aggregate(attract: int, repel: int) -> Result:
    """A contact's result from its total attractions and repulsions."""
    if attract and repel:
        return "mixed"
    if attract:
        return "snap"
    if repel:
        return "repel"
    return "nothing"


@dataclass(frozen=True)
class Pocket:
    """One pocket on an edge, as authored or derived.

    On top/bottom edges `at` is measured in U from the `anchor` end
    (`left` or `right`); on left/right edges it is the height in U from the
    top edge and `anchor` is None. `index` is the pocket's place in its
    front edge's list, kept through a flip.
    """

    edge: str
    anchor: Literal["left", "right"] | None
    at: Fraction
    layers: str
    index: int

    @property
    def up(self) -> str:
        return self.layers[0]

    @property
    def down(self) -> str:
        return self.layers[2]

    @property
    def shape(self) -> Shape:
        if "-" in (self.up, self.down):
            return "half"
        return "uniform" if self.up == self.down else "split"

    def position(self, length: int) -> Fraction:
        """Distance from the card's left end (top/bottom) or top (left/right)."""
        return length - self.at if self.anchor == "right" else self.at

    def to_dict(self) -> dict:
        at = int(self.at) if self.at.denominator == 1 else u_text(self.at)
        if self.anchor is None:
            return {"at": at, "layers": self.layers}
        return {"from": self.anchor, "at": at, "layers": self.layers}


Edges = dict[str, tuple[Pocket, ...]]

_OPPOSITE = {"top": "bottom", "bottom": "top", "left": "right", "right": "left"}


def flip(edges: Edges, how: str) -> Edges:
    """The other side of a card whose side has these edges.

    Every pocket's layers swap. `top_bottom` swaps top with bottom and
    mirrors left/right heights; `left_right` swaps left with right and
    mirrors top/bottom anchors.
    """
    flipped: Edges = {}
    for edge, pockets in edges.items():
        new_edge = flipped_edge(edge, how)
        flipped[new_edge] = tuple(_flip_pocket(p, new_edge, how) for p in pockets)
    return flipped


def flipped_edge(edge: str, how: str) -> str:
    """The edge that `edge` becomes on the other side: flipping is its own
    inverse, so this is also the edge it came from."""
    moved = TOP_BOTTOM_EDGES if how == "top_bottom" else LEFT_RIGHT_EDGES
    return _OPPOSITE[edge] if edge in moved else edge


def _flip_pocket(pocket: Pocket, edge: str, how: str) -> Pocket:
    layers = f"{pocket.down}/{pocket.up}"
    if pocket.anchor is None:
        at = 1 - pocket.at if how == "top_bottom" else pocket.at
        return replace(pocket, edge=edge, at=at, layers=layers)
    anchor = pocket.anchor
    if how == "left_right":
        anchor = "right" if anchor == "left" else "left"
    return replace(pocket, edge=edge, anchor=anchor, layers=layers)


@dataclass(frozen=True)
class PocketPair:
    """Two pockets that line up exactly across a contact."""

    a: Pocket
    b: Pocket

    @property
    def up(self) -> Interaction:
        return interact(self.a.up, self.b.up)

    @property
    def down(self) -> Interaction:
        return interact(self.a.down, self.b.down)

    @property
    def interactions(self) -> tuple[Interaction, Interaction]:
        return (self.up, self.down)


def vertical_pairs(
    upper: tuple[Pocket, ...],
    lower: tuple[Pocket, ...],
    upper_length: int,
    lower_length: int,
    offset: Fraction,
) -> tuple[PocketPair, ...]:
    """Pockets on an upper bottom edge that line up with a lower top edge.

    `offset` is the lower card's left end minus the upper card's, in U.
    """
    return tuple(
        PocketPair(a, b)
        for a in upper
        for b in lower
        if a.position(upper_length) == offset + b.position(lower_length)
    )


def horizontal_pairs(
    right: tuple[Pocket, ...],
    left: tuple[Pocket, ...],
    offset: Fraction,
) -> tuple[PocketPair, ...]:
    """Pockets on a left card's right edge that line up with a right card's left edge.

    `offset` is how far the right card sits lower than the left card, in U.
    """
    return tuple(PocketPair(a, b) for a in right for b in left if a.at == offset + b.at)


def u_text(x: Fraction) -> str:
    """A length or offset in U as an exact fraction: `2`, `1/6`, `-7/6`."""
    return str(x)


def positions(reach: int) -> tuple[Fraction, ...]:
    """Every position less than `reach` U from an edge's start, in order."""
    return tuple(cell + at for cell in range(reach) for at in POSITIONS)


def on_grid(at: Fraction) -> bool:
    """Whether `at` is a position in its cell (never on a cell boundary)."""
    return at % 1 in POSITIONS


def horizontal_offsets() -> tuple[Fraction, ...]:
    """Every offset at which some left/right pocket heights line up."""
    return tuple(sorted({a - b for a in POSITIONS for b in POSITIONS}))


def tally(pairs: tuple[PocketPair, ...]) -> tuple[int, int]:
    """Total (attractions, repulsions) across every layer of every pair."""
    found = [i for pair in pairs for i in pair.interactions]
    return found.count("attract"), found.count("repel")
