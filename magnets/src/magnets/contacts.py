"""Every contact between card edges, with its result and grammar labels."""

from collections.abc import Iterator, Mapping
from dataclasses import dataclass, replace
from fractions import Fraction

from .data import Arrangement, CardClass, Rules, Side
from .physics import Edges, PocketPair, Result, aggregate, flip, tally, vertical_pairs

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

    For a vertical contact `a` is the upper side (its bottom edge) and `b`
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
    for contact in _vertical(all_sides, rules, max_length):
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
                    labels=tuple(_label(v, result) for v in verdicts),
                )


def _label(verdict: str, result: Result) -> Label:
    # Only connect rules exist so far, and connect is always a must.
    return Label(kind=verdict, priority="must", grade=GRADES[verdict][result])
