"""Every contact between card edges, with its result and grammar labels."""

import math
from collections.abc import Iterator, Mapping
from dataclasses import dataclass
from fractions import Fraction

from .data import Arrangement, CardClass, Rules, Side
from .physics import (
    Edges,
    PocketPair,
    Result,
    aggregate,
    flip,
    horizontal_offsets,
    horizontal_pairs,
    tally,
    vertical_pairs,
)

# kind -> result -> grade
GRADES = {
    "connect": {"snap": "pass", "mixed": "FAIL", "nothing": "FAIL", "repel": "FAIL"},
    "forbid": {"snap": "leak", "mixed": "partial", "nothing": "weak", "repel": "strong"},
    "coexist": {"snap": "pass", "mixed": "FAIL", "nothing": "pass", "repel": "FAIL"},
    "ungraded": {"snap": "info", "mixed": "info", "nothing": "info", "repel": "info"},
}


@dataclass(frozen=True)
class SideEdges:
    """A class side with its pockets, authored (front) or derived (back)."""

    side: Side
    min_length: int
    edges: Edges


@dataclass(frozen=True)
class Label:
    """What the grammar demands of a contact, and how well it is met."""

    kind: str  # connect / forbid / coexist / ungraded
    priority: str  # must / should / nice / low / info
    grade: str
    unavoidable: bool = False


@dataclass(frozen=True)
class Contact:
    """Two edges facing each other at an offset.

    For a horizontal contact `a` is the left side (its right edge) and `b`
    the right side (its left edge); `offset` is how far b sits lower than a,
    in U. For a vertical contact `a` is the upper side (its bottom edge) and `b`
    the lower side (its top edge); `offset` is b's left end minus a's, in U.
    `lengths` is the smallest length pair with this geometry (upper or left
    length first, then the other) and `collapsed` how many length pairs share it.
    """

    axis: str
    a: str
    edge_a: str
    b: str
    edge_b: str
    offset: Fraction
    lengths: tuple[int, int]
    collapsed: int
    pairs: tuple[PocketPair, ...]
    attract: int
    repel: int
    result: Result
    labels: tuple[Label, ...]


def sides(arrangement: Arrangement, classes: Mapping[str, CardClass]) -> dict[str, SideEdges]:
    """Every class side with its pockets; backs are derived by the flip."""
    found = {}
    for name, cls in classes.items():
        front = arrangement.fronts[name]
        for i, side in enumerate(cls.sides):
            edges = front if i == 0 else flip(front, arrangement.flip)
            found[side.name] = SideEdges(side, cls.min_length, edges)
    return found


def contacts(all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int) -> list[Contact]:
    """Every contact, with identical geometry collapsed."""
    return [*_horizontal(all_sides, rules, max_length), *_vertical(all_sides, rules, max_length)]


def _horizontal(all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int) -> Iterator[Contact]:
    # Left/right pockets don't depend on length, so every length pair has the
    # same geometry: one contact per offset, collapsed over all length pairs.
    for left in all_sides.values():
        for right in all_sides.values():
            lengths = (left.min_length, right.min_length)
            collapsed = (max_length - left.min_length + 1) * (max_length - right.min_length + 1)
            for offset in horizontal_offsets():
                pairs = horizontal_pairs(left.edges["right"], right.edges["left"], offset)
                attract, repel = tally(pairs)
                result = aggregate(attract, repel)
                kind, priority = _horizontal_verdict(
                    rules, left.side.roles["right"], right.side.roles["left"], offset
                )
                yield Contact(
                    axis="horizontal",
                    a=left.side.name,
                    edge_a="right",
                    b=right.side.name,
                    edge_b="left",
                    offset=offset,
                    lengths=lengths,
                    collapsed=collapsed,
                    pairs=pairs,
                    attract=attract,
                    repel=repel,
                    result=result,
                    labels=(_label(kind, priority, result),),
                )


def _horizontal_verdict(rules: Rules, right: str, left: str, offset: Fraction) -> tuple[str, str]:
    if offset != 0:
        return "forbid", rules.horizontal.off_line
    if left in rules.horizontal.connect[right]:
        return "connect", "must"
    return "forbid", rules.horizontal.forbid


def _vertical(all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int) -> Iterator[Contact]:
    for upper in all_sides.values():
        for lower in all_sides.values():
            yield from _stacks(upper, lower, rules, max_length)


def _stacks(upper: SideEdges, lower: SideEdges, rules: Rules, max_length: int) -> Iterator[Contact]:
    """Every contact of `upper` over `lower`, collapsed over length pairs.

    At a given length pair, pockets line up at only a few offsets. Those
    contacts are grouped by which pockets face which. At every other offset
    no pockets line up, and those length pairs collapse into one contact.
    """
    bottom, top = upper.edges["bottom"], lower.edges["top"]
    # offset -> aligned pocket indices -> [smallest lengths, count, pairs]
    aligned: dict[Fraction, dict[tuple, list]] = {}
    # offset -> the length pairs at which some pockets line up
    aligned_lengths: dict[Fraction, set[tuple[int, int]]] = {}
    for lengths in _length_pairs(upper.min_length, lower.min_length, max_length):
        upper_length, lower_length = lengths
        offsets = {a.position(upper_length) - b.position(lower_length) for a in bottom for b in top}
        for offset in offsets:
            if not -lower_length < offset < upper_length:
                continue
            pairs = vertical_pairs(bottom, top, upper_length, lower_length, offset)
            key = tuple((p.a.index, p.b.index) for p in pairs)
            seen = aligned.setdefault(offset, {}).setdefault(key, [lengths, 0, pairs])
            seen[1] += 1
            aligned_lengths.setdefault(offset, set()).add(lengths)

    for step in range(-4 * max_length + 1, 4 * max_length):
        offset = Fraction(step, 4)
        # The edges overlap where the upper card reaches past the lower's left
        # end and the lower reaches past the upper's.
        upper_from = max(upper.min_length, math.floor(offset) + 1)
        lower_from = max(lower.min_length, math.floor(-offset) + 1)
        if upper_from > max_length or lower_from > max_length:
            continue
        labels = _vertical_labels(rules, upper.side, lower.side, offset)
        for lengths, collapsed, pairs in sorted(aligned.get(offset, {}).values(), key=lambda g: g[0]):
            yield _stack(upper, lower, offset, lengths, collapsed, pairs, labels)
        taken = aligned_lengths.get(offset, set())
        unaligned = (max_length - upper_from + 1) * (max_length - lower_from + 1) - len(taken)
        if unaligned:
            smallest = next(
                lengths
                for lengths in _length_pairs(upper_from, lower_from, max_length)
                if lengths not in taken
            )
            yield _stack(upper, lower, offset, smallest, unaligned, (), labels)


def _length_pairs(upper_min: int, lower_min: int, max_length: int) -> Iterator[tuple[int, int]]:
    """Every (upper length, lower length), smallest first."""
    for upper_length in range(upper_min, max_length + 1):
        for lower_length in range(lower_min, max_length + 1):
            yield upper_length, lower_length


def _stack(
    upper: SideEdges,
    lower: SideEdges,
    offset: Fraction,
    lengths: tuple[int, int],
    collapsed: int,
    pairs: tuple[PocketPair, ...],
    verdicts: list[tuple[str, str]],
) -> Contact:
    attract, repel = tally(pairs)
    result = aggregate(attract, repel)
    return Contact(
        axis="vertical",
        a=upper.side.name,
        edge_a="bottom",
        b=lower.side.name,
        edge_b="top",
        offset=offset,
        lengths=lengths,
        collapsed=collapsed,
        pairs=pairs,
        attract=attract,
        repel=repel,
        result=result,
        labels=tuple(_label(kind, priority, result) for kind, priority in verdicts),
    )


def _vertical_labels(rules: Rules, upper: Side, lower: Side, offset: Fraction) -> list[tuple[str, str]]:
    """(kind, priority) for each label of `upper` over `lower` at `offset`."""
    vertical = rules.vertical
    verdict = vertical.verdict(upper.roles["bottom"], lower.roles["top"], offset)
    kind, _ = verdict
    if kind in ("connect", "ungraded"):
        return [verdict]
    if not vertical.coexist.applies(upper, lower, offset):
        return [verdict]
    # Off the meaningful offsets coexist replaces forbid / low; on them it
    # adds to the forbid.
    return [("coexist", "must")] + ([verdict] if offset in vertical.offsets else [])


def _label(kind: str, priority: str, result: Result) -> Label:
    return Label(kind=kind, priority=priority, grade=GRADES[kind][result])
