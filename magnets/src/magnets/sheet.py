"""The paper prototype: a program's cards laid out on A4 pages as folded pieces.

Each card is one piece of two panels, its class's front over its back,
sharing a fold line. Under `top_bottom` the back is printed upright, under
`left_right` rotated 180°, so that after folding along the line every
pocket's two faces line up. Each panel shows the up layer of every pocket
of its side, nearest that face. Lengths are in mm, from the page's top left.
"""

from collections.abc import Mapping
from dataclasses import dataclass
from fractions import Fraction

from .contacts import SideEdges
from .data import Arrangement, CardClass, carry_over
from .physics import Edges, Pocket, flip
from .programs import Card, Strip

PAGE = (210.0, 297.0)  # A4 portrait
MARGIN = 10.0
TEXT_LINE = 5.0  # the program text's line height
GAP = 6.0  # between the text and the pieces, and between pieces
FOLDS = {"top_bottom": "↕", "left_right": "↔"}
EMPTY = "–"


@dataclass(frozen=True)
class Mark:
    """A pocket on a panel's edge: `edge` is its side's own edge (a rotated
    panel draws its top edge at the bottom), `x`, `y` where the pocket sits
    on that edge, and `letter` its layer nearest this face, `–` if empty."""

    edge: str
    x: float
    y: float
    letter: str


@dataclass(frozen=True)
class Panel:
    notation: str | None  # None on the back of a card that is not a flip pair
    rotated: bool  # printed rotated 180°
    x: float
    y: float
    width: float
    height: float
    marks: tuple[Mark, ...]


@dataclass(frozen=True)
class Piece:
    """One card to cut out and fold: `front` above, `back` below, the fold
    line between them at `fold_y`, marked `fold` (↕ or ↔)."""

    card: Card
    length: int
    front: Panel
    back: Panel
    fold_y: float
    fold: str


@dataclass(frozen=True)
class TextLine:
    x: float
    y: float  # the line's top
    text: str


@dataclass(frozen=True)
class Page:
    width: float
    height: float
    text: tuple[TextLine, ...]
    pieces: tuple[Piece, ...]


@dataclass(frozen=True)
class CardSheet:
    arrangement: Arrangement
    unit: float
    pages: tuple[Page, ...]


def card_sheet(
    arrangement: Arrangement,
    classes: Mapping[str, CardClass],
    all_sides: Mapping[str, SideEdges],
    strips: tuple[Strip, ...],
    program_text: str,
    unit: float,
) -> CardSheet:
    """Every card of the program once, at its minimum length, each piece
    below the last, on as many pages as it takes, under the program's text."""
    if unit <= 0:
        raise ValueError(f"unit must be positive, not {unit}")
    owner = {side.name: cls for cls in classes.values() for side in cls.sides}
    cards = [card for strip in strips for line in strip for card in line.cards]
    width, height = PAGE
    bottom = height - MARGIN
    pages: list[Page] = []
    text: list[TextLine] = []
    placed: list[Piece] = []
    y = MARGIN

    def new_page() -> None:
        nonlocal text, placed, y
        pages.append(Page(width, height, tuple(text), tuple(placed)))
        text, placed, y = [], [], MARGIN

    for line in program_text.rstrip("\n").splitlines():
        if y + TEXT_LINE > bottom:
            new_page()
        text.append(TextLine(MARGIN, y, line))
        y += TEXT_LINE
    if text:
        y += GAP
    for card in cards:
        cls = owner[card.side]
        piece_width, piece_height = cls.min_length * unit, 2 * unit
        if piece_width > width - 2 * MARGIN or piece_height > height - 2 * MARGIN:
            raise ValueError(
                f"{card.text} is {piece_width:g} by {piece_height:g} mm folded out at {unit:g} mm per U, "
                "too big for an A4 page"
            )
        if y + piece_height > bottom and (text or placed):
            new_page()
        placed.append(_piece(card, cls, arrangement, all_sides, MARGIN, y, unit))
        y += piece_height + GAP
    new_page()
    return CardSheet(arrangement, unit, tuple(pages))


def _piece(
    card: Card,
    cls: CardClass,
    arrangement: Arrangement,
    all_sides: Mapping[str, SideEdges],
    x: float,
    y: float,
    unit: float,
) -> Piece:
    front_side = cls.front
    front_edges = arrangement.fronts[cls.name]
    if len(cls.sides) == 2:
        back_side = cls.sides[1]
        back_edges = all_sides[back_side.name].edges
        written = front_side if card.side == front_side.name else back_side
        other = back_side if written is front_side else front_side
        notations = {written.name: card.text, other.name: carry_over(card.text, written, other)}
        front_text, back_text = notations[front_side.name], notations[back_side.name]
    else:
        # Not a flip pair: its back holds the front's down layers, unlabelled.
        back_edges = flip(front_edges, arrangement.flip)
        front_text, back_text = card.text, None
    rotated = arrangement.flip == "left_right"
    length = cls.min_length
    return Piece(
        card=card,
        length=length,
        front=_panel(front_text, front_edges, length, x, y, unit, rotated=False),
        back=_panel(back_text, back_edges, length, x, y + unit, unit, rotated=rotated),
        fold_y=y + unit,
        fold=FOLDS[arrangement.flip],
    )


def _panel(
    notation: str | None, edges: Edges, length: int, x: float, y: float, unit: float, *, rotated: bool
) -> Panel:
    marks = []
    for pockets in edges.values():
        for pocket in pockets:
            across, down = _spot(pocket, length)
            if rotated:
                across, down = length - across, 1 - down
            letter = EMPTY if pocket.up == "-" else pocket.up
            marks.append(Mark(pocket.edge, x + float(across) * unit, y + float(down) * unit, letter))
    return Panel(notation, rotated, x, y, length * unit, unit, tuple(marks))


def _spot(pocket: Pocket, length: int) -> tuple[Fraction, Fraction]:
    """Where a pocket sits on its side, upright, in U from the top left."""
    if pocket.edge == "top":
        return pocket.position(length), Fraction(0)
    if pocket.edge == "bottom":
        return pocket.position(length), Fraction(1)
    return Fraction(0 if pocket.edge == "left" else length), pocket.at
