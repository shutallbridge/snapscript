"""Every contact between card edges, with its result and grammar labels."""

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, replace
from fractions import Fraction
from itertools import chain

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

    kind: str  # connect / forbid / coexist
    priority: str  # must / should / nice / low
    grade: str
    unavoidable: bool = False


@dataclass(frozen=True)
class Contact:
    """Two edges facing each other at an offset.

    For a horizontal contact `a` is the left side (its right edge) and `b`
    the right side (its left edge); `offset` is how far b sits lower than a,
    in U. For a vertical contact `a` is the upper side (its bottom edge) and `b`
    the lower side (its top edge); `offset` is b's left end minus a's, in U.
    `lengths` is the smallest length pair with this geometry and `collapsed`
    how many length pairs share it.
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
    collapsed: dict[tuple, Contact] = {}
    for contact in chain(_horizontal(all_sides, rules, max_length), _vertical(all_sides, rules, max_length)):
        key = (
            contact.axis,
            contact.a,
            contact.b,
            contact.offset,
            tuple((p.a.index, p.b.index) for p in contact.pairs),
            contact.labels,
        )
        seen = collapsed.get(key)
        collapsed[key] = contact if seen is None else replace(seen, collapsed=seen.collapsed + 1)
    return list(collapsed.values())


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
    # Equal-length cards stacked flush, at offset 0.
    offset = Fraction(0)
    for upper in all_sides.values():
        for lower in all_sides.values():
            bottom, top = upper.side.roles["bottom"], lower.side.roles["top"]
            verdicts = [
                r.verdict
                for r in rules.vertical
                if (r.upper, r.lower, r.offset) == (bottom, top, offset)
            ]
            for length in range(max(upper.min_length, lower.min_length), max_length + 1):
                pairs = vertical_pairs(upper.edges["bottom"], lower.edges["top"], length, length, offset)
                attract, repel = tally(pairs)
                result = aggregate(attract, repel)
                yield Contact(
                    axis="vertical",
                    a=upper.side.name,
                    edge_a="bottom",
                    b=lower.side.name,
                    edge_b="top",
                    offset=offset,
                    lengths=(length, length),
                    collapsed=1,
                    pairs=pairs,
                    attract=attract,
                    repel=repel,
                    result=result,
                    # Only connect rules exist so far, and connect is always a must.
                    labels=tuple(_label(v, "must", result) for v in verdicts),
                )


def _label(kind: str, priority: str, result: Result) -> Label:
    return Label(kind=kind, priority=priority, grade=GRADES[kind][result])
