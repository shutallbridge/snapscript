"""Programs in spec notation, laid out on the table, and their contacts checked.

A program text holds cards and `//` comments only. Two spaces of
indentation per depth; a line head sits at depth x 1U and its inline cards
follow it left to right at their lengths. A blank line starts a new strip,
and contacts only happen within a strip: between neighbours in a line, and
between cards of consecutive lines whose edges overlap.
"""

import random
import re
from collections.abc import Iterator, Mapping, Sequence
from dataclasses import dataclass
from fractions import Fraction

from . import contacts as _contacts
from .contacts import ContactGroup, Label, SideEdges
from .data import CardClass, Rules, matching_sides


class ProgramError(ValueError):
    """A program text that can't be read as cards on a table."""


@dataclass(frozen=True)
class Card:
    """A card as written in the program."""

    text: str  # its notation, e.g. "[get{x}]"
    side: str  # the class side it resolves to, e.g. "get.get"
    line: int  # the source line it is on, from 1
    index: int  # its place in its line; 0 is the line head


@dataclass(frozen=True)
class Line:
    number: int  # source line, from 1
    depth: int
    cards: tuple[Card, ...]


Strip = tuple[Line, ...]


@dataclass(frozen=True)
class Placed:
    """A card where a layout puts it: on the `line_index`th line of its strip
    (from 0), its left end `x` U right of the strip's depth-0 column."""

    card: Card
    strip: int
    line_index: int
    x: int
    length: int


@dataclass(frozen=True)
class ProgramContact:
    """A contact that a layout puts on the table.

    `a` is the left or upper card, `b` the right or lower one. `intended` is
    a line head over the next line head at a meaningful offset: the column
    contact the program is built on. `contact` is graded at the layout's
    lengths: a contact group of one.
    """

    a: Placed
    b: Placed
    contact: ContactGroup
    intended: bool


@dataclass(frozen=True)
class Layout:
    name: str  # "min lengths", "draw 1", … or "given lengths"
    cards: tuple[Placed, ...]  # in reading order
    contacts: tuple[ProgramContact, ...]


@dataclass(frozen=True)
class Failure:
    """A contact that keeps a legal program from holding together."""

    layout: str
    contact: ProgramContact
    reason: str  # "should snap" or "pushes apart"


@dataclass(frozen=True)
class Forbid:
    """A forbid label on a contact of the program, with its grade."""

    layout: str
    contact: ProgramContact
    label: Label


@dataclass(frozen=True)
class Info:
    """An ungraded contact, reported for information only."""

    layout: str
    contact: ProgramContact


# --- parsing ---------------------------------------------------------------

_CARD = re.compile(r"\[[^\[\]]*\]")


def parse(text: str, classes: Mapping[str, CardClass]) -> tuple[Strip, ...]:
    """The program's strips, every card resolved to its class side."""
    strips: list[list[Line]] = [[]]
    for number, raw in enumerate(text.splitlines(), start=1):
        if not raw.strip():
            if strips[-1]:
                strips.append([])
            continue
        texts = _cards(raw, number)
        if not texts:
            continue  # a comment line doesn't split a strip
        cards = tuple(Card(t, _resolve(t, number, classes), number, i) for i, t in enumerate(texts))
        strips[-1].append(Line(number, _depth(raw, number), cards))
    found = tuple(tuple(strip) for strip in strips if strip)
    if not found:
        raise ProgramError("the program has no cards")
    return found


def _depth(raw: str, number: int) -> int:
    indent = raw[: len(raw) - len(raw.lstrip())]
    if "\t" in indent:
        raise ProgramError(f"line {number}: indent with spaces, not tabs")
    if len(indent) % 2:
        raise ProgramError(f"line {number}: indentation must be two spaces per depth, not {len(indent)}")
    return len(indent) // 2


def _cards(raw: str, number: int) -> list[str]:
    """The card texts on a line, left to right; a `//` outside a card starts
    a comment."""
    found, rest = [], raw.strip()
    while rest and not rest.startswith("//"):
        if not rest.startswith("["):
            text = rest.split("//", 1)[0].strip()
            raise ProgramError(f"line {number}: unexpected text {text!r}; only cards and // comments")
        card = _CARD.match(rest)
        if card is None:
            text = re.split(r"\s|\[", rest[1:], maxsplit=1)[0]
            raise ProgramError(f"line {number}: card {'[' + text!r} is not closed with ]")
        found.append(card.group())
        rest = rest[card.end() :].lstrip()
    return found


def _resolve(text: str, number: int, classes: Mapping[str, CardClass]) -> str:
    sides = matching_sides(text, classes)
    if not sides:
        raise ProgramError(f"line {number}: unknown card {text}: it matches no card class")
    if len(sides) > 1:
        names = ", ".join(side.name for side in sides)
        raise ProgramError(f"line {number}: card {text} matches more than one class: {names}")
    return sides[0].name


def all_cards(strips: tuple[Strip, ...]) -> list[Card]:
    """Every card of the program, in reading order."""
    return [card for strip in strips for line in strip for card in line.cards]


# --- layout ----------------------------------------------------------------


def layouts(
    strips: tuple[Strip, ...],
    all_sides: Mapping[str, SideEdges],
    rules: Rules,
    flip: str,
    *,
    lengths: Sequence[int] | None,
    seed: int,
    draws: int,
    max_length: int,
) -> list[Layout]:
    """The given lengths' layout, or one at every card's minimum length plus
    `draws` of seeded random lengths up to `max_length`."""
    cards = all_cards(strips)
    minimum = [all_sides[card.side].min_length for card in cards]
    if lengths is not None:
        _check_lengths(cards, minimum, list(lengths), max_length)
        return [lay_out("given lengths", strips, list(lengths), all_sides, rules, flip)]
    found = [lay_out("min lengths", strips, minimum, all_sides, rules, flip)]
    for draw, drawn in enumerate(drawn_lengths(minimum, max_length, seed, draws), start=1):
        found.append(lay_out(f"draw {draw}", strips, drawn, all_sides, rules, flip))
    return found


def drawn_lengths(minimum: Sequence[int], max_length: int, seed: int, draws: int) -> list[list[int]]:
    """`draws` lists of random card lengths from `seed`, each card from its
    `minimum` up to `max_length`: draw N is the (N-1)th."""
    rng = random.Random(seed)
    return [[rng.randint(low, max_length) for low in minimum] for _ in range(draws)]


def _check_lengths(cards: list[Card], minimum: list[int], lengths: list[int], max_length: int) -> None:
    if len(lengths) != len(cards):
        raise ValueError(f"lengths: {len(lengths)} given for {len(cards)} cards")
    for card, low, length in zip(cards, minimum, lengths):
        if length < low:
            raise ValueError(f"lengths: {card.text} on line {card.line} is at least {low}U long, not {length}")
        if length > max_length:
            raise ValueError(f"lengths: {card.text} on line {card.line} is longer than max_length {max_length}U")


def lay_out(
    name: str,
    strips: tuple[Strip, ...],
    lengths: list[int],
    all_sides: Mapping[str, SideEdges],
    rules: Rules,
    flip: str,
) -> Layout:
    """Every card at its place on the table, `lengths` in reading order, and
    every contact between them."""
    placed: list[Placed] = []
    found: list[ProgramContact] = []
    each = iter(lengths)
    for s, strip in enumerate(strips):
        above: list[Placed] = []
        for line_index, line in enumerate(strip):
            here = []
            x = line.depth
            for card in line.cards:
                here.append(Placed(card, s, line_index, x, next(each)))
                x += here[-1].length
            for left, right in zip(here, here[1:]):
                contact = _contacts.beside(
                    all_sides, rules, flip, all_sides[left.card.side], all_sides[right.card.side],
                    Fraction(0), (left.length, right.length),
                )
                found.append(ProgramContact(left, right, contact, intended=False))
            found += _between(above, here, all_sides, rules, flip)
            placed += here
            above = here
    return Layout(name, tuple(placed), tuple(found))


def _between(
    above: list[Placed], below: list[Placed], all_sides: Mapping[str, SideEdges], rules: Rules, flip: str
) -> Iterator[ProgramContact]:
    """Every contact between a line and the line below it."""
    for upper in above:
        for lower in below:
            offset = Fraction(lower.x - upper.x)
            if not -lower.length < offset < upper.length:
                continue  # the edges don't overlap
            contact = _contacts.stack(
                all_sides, rules, flip, all_sides[upper.card.side], all_sides[lower.card.side],
                (upper.length, lower.length), offset,
            )
            intended = upper.card.index == lower.card.index == 0 and offset in rules.vertical.offsets
            yield ProgramContact(upper, lower, contact, intended)


# --- checks ----------------------------------------------------------------


def failures(found: list[Layout]) -> list[Failure]:
    """What keeps a legal program from holding together.

    Every neighbour pair in a line, and every intended column contact
    labelled connect, must snap. No graded contact between consecutive lines
    may repel or be mixed.
    """
    failed = []
    for layout in found:
        for pc in layout.contacts:
            c = pc.contact
            kinds = {label.kind for label in c.labels}
            must_snap = c.axis == "horizontal" or (pc.intended and "connect" in kinds)
            if must_snap and c.result != "snap":
                failed.append(Failure(layout.name, pc, "should snap"))
            elif c.axis == "vertical" and kinds != {"ungraded"} and c.result in ("repel", "mixed"):
                failed.append(Failure(layout.name, pc, "pushes apart"))
    return failed


def forbids(found: list[Layout]) -> list[Forbid]:
    """Every forbid label on a contact of the program, with its grade."""
    return [
        Forbid(layout.name, pc, label)
        for layout in found
        for pc in layout.contacts
        for label in pc.contact.labels
        if label.kind == "forbid"
    ]


def info(found: list[Layout]) -> list[Info]:
    """Every ungraded contact of the program."""
    return [
        Info(layout.name, pc)
        for layout in found
        for pc in layout.contacts
        if any(label.kind == "ungraded" for label in pc.contact.labels)
    ]
