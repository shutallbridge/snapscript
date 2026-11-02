"""The paper prototype: programs' cards laid out on A4 or letter pages as
folded pieces, packed to cut out with as few cuts as possible.

Each card is one piece of two panels, its class's front over its back,
sharing a fold line. Under `top_bottom` the back is printed upright, under
`left_right` rotated 180°, so that after folding along the line every
pocket's two faces line up. Each panel shows the up layer of every pocket
of its side, nearest that face. Pieces sit edge to edge in rows, each row
one 2U strip, rows edge to edge too, so one cut separates two neighbours.
Every page has a 50 mm ruler to check the printer kept the scale. Lengths
are in mm, from the page's top left.
"""

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction
from typing import Literal

from .contacts import SideEdges
from .data import Arrangement, CardClass, carry_over
from .physics import POSITIONS, Edges, Pocket, flip
from .programs import Card, Strip, all_cards

Paper = Literal["a4", "letter"]  # also the CSS @page size keyword
PAPERS: dict[Paper, tuple[float, float]] = {"a4": (210.0, 297.0), "letter": (215.9, 279.4)}  # portrait
MARGIN = 10.0  # the unprinted edge of the page, which most printers manage
TEXT_LINE = 5.0  # the program text's line height
GAP = 6.0  # between the text and the pieces
RULER_LENGTH = 50.0
RULER_HEIGHT = 7.0  # the ruler and its label, along the printable area's foot
SLACK = 1e-6  # mm, so float rounding never pushes out a piece that fits exactly
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
    line between them at `fold_y`, marked `fold` (↕ or ↔) at `fold_x`."""

    card: Card
    length: int
    front: Panel
    back: Panel
    fold_y: float
    fold: str
    fold_x: float


@dataclass(frozen=True)
class TextLine:
    x: float
    y: float  # the line's top
    text: str


@dataclass(frozen=True)
class Ruler:
    """A `length` mm scale bar, its left end at `x`, in a band `height` tall
    from `y`: a printout at true scale measures `length` mm along it."""

    x: float
    y: float
    length: float
    height: float


@dataclass(frozen=True)
class Page:
    """One page of one program: `program` is its name (None for a program
    text), `lengths` the card lengths it uses ("min lengths" or "draw 3,
    seed 0"); the first text line names both."""

    width: float
    height: float
    program: str | None
    lengths: str
    text: tuple[TextLine, ...]
    pieces: tuple[Piece, ...]
    ruler: Ruler


@dataclass(frozen=True)
class CardSheet:
    arrangement: Arrangement
    unit: float
    paper: Paper
    pages: tuple[Page, ...]


@dataclass(frozen=True)
class Section:
    """One program to print: its cards' lengths in reading order, and a
    `note` to print over its cards, if any."""

    name: str | None
    text: str
    strips: tuple[Strip, ...]
    lengths: tuple[int, ...]
    note: str | None = None

    def heading(self, label: str) -> str:
        return label if self.name is None else f"{self.name} ({label})"


def card_sheet(
    arrangement: Arrangement,
    classes: Mapping[str, CardClass],
    all_sides: Mapping[str, SideEdges],
    sections: Sequence[Section],
    label: str,
    unit: float,
    paper: Paper,
) -> CardSheet:
    """Every card of each program once, at the section's lengths, in program
    order: each program from a new page, under a heading naming it and
    `label`, the lengths used, then its text and its note; each piece after the last in its row,
    a new row when the row is full, a new page when the page is, every page
    headed alike."""
    if unit <= 0:
        raise ValueError(f"unit must be positive, not {unit}")
    if paper not in PAPERS:
        raise ValueError(f"unknown paper {paper!r}; expected one of {', '.join(PAPERS)}")
    owner = {side.name: cls for cls in classes.values() for side in cls.sides}
    width, height = PAPERS[paper]
    bottom = height - MARGIN - RULER_HEIGHT
    ruler = Ruler(MARGIN, bottom, RULER_LENGTH, RULER_HEIGHT)
    _check_fit(
        [(card, length) for section in sections for card, length in zip(all_cards(section.strips), section.lengths)],
        unit,
        paper,
        width - 2 * MARGIN,
        bottom - MARGIN - TEXT_LINE,
    )
    pages: list[Page] = []
    for section in sections:
        heading = section.heading(label)
        text: list[TextLine] = []
        placed: list[Piece] = []
        y = MARGIN

        def new_page() -> None:
            nonlocal text, placed, y
            pages.append(Page(width, height, section.name, label, tuple(text), tuple(placed), ruler))
            text, placed, y = [TextLine(MARGIN, MARGIN, heading)], [], MARGIN + TEXT_LINE

        lines = [heading, *section.text.rstrip("\n").splitlines()]
        if section.note is not None:
            lines.append(section.note)
        for line in lines:
            if y + TEXT_LINE > bottom:
                new_page()
            text.append(TextLine(MARGIN, y, line))
            y += TEXT_LINE
        y += GAP
        used = 0  # U along the current row, counted whole so that a row fits exactly
        for card, length in zip(all_cards(section.strips), section.lengths):
            if (used + length) * unit > width - 2 * MARGIN + SLACK:
                # Start a new row, edge to edge with the last.
                used, y = 0, y + 2 * unit
            if y + 2 * unit > bottom + SLACK:
                new_page()
                used = 0
            placed.append(_piece(card, owner[card.side], length, arrangement, all_sides, MARGIN + used * unit, y, unit))
            used += length
        new_page()
    return CardSheet(arrangement, unit, paper, tuple(pages))


def _check_fit(cards: list[tuple[Card, int]], unit: float, paper: Paper, across: float, down: float) -> None:
    """Raise if a piece is bigger than the `across` by `down` mm left for
    pieces, naming the card that limits the unit and the largest that fits."""
    if not cards:
        return
    # A piece is its length in U across and 2U down; the longest card limits.
    card, length = max(cards, key=lambda pair: pair[1])
    largest = min(across / length, down / 2)
    if unit > largest + SLACK:
        raise ValueError(
            f"{card.text} is too long for {paper} paper at {unit:g} mm per U: folded out it is "
            f"{length * unit:g} by {2 * unit:g} mm, and the printable area leaves {across:g} by {down:g} mm; "
            f"the largest unit that fits is {math.floor(largest * 10) / 10:g} mm"
        )


def _piece(
    card: Card,
    cls: CardClass,
    length: int,
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
    return Piece(
        card=card,
        length=length,
        front=_panel(front_text, front_edges, length, x, y, unit, rotated=False),
        back=_panel(back_text, back_edges, length, x, y + unit, unit, rotated=rotated),
        fold_y=y + unit,
        fold=FOLDS[arrangement.flip],
        # Midway between the two positions nearest the right end, clear of
        # every pocket on the fold line and beside it.
        fold_x=x + (length - float(POSITIONS[0] + POSITIONS[1]) / 2) * unit,
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
