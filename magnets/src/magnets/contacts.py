"""Every contact between card edges, with its result and grammar labels."""

import math
from collections.abc import Callable, Iterator, Mapping
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
    other: str | None = None  # a flip pair's other side, e.g. "set_get.get"


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
        names = [side.name for side in cls.sides]
        for i, side in enumerate(cls.sides):
            edges = front if i == 0 else flip(front, arrangement.flip)
            other = names[1 - i] if len(names) == 2 else None
            found[side.name] = SideEdges(side, cls.min_length, edges, other)
    return found


def contacts(all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int, flip: str) -> list[Contact]:
    """Every contact, with identical geometry collapsed.

    A back is derived from its front, so under `flip` every contact between
    two flip pairs behaves exactly like a partner contact. A forbid
    whose partner is a connect can never be blocked and is flagged
    unavoidable.
    """
    return [
        *_horizontal(all_sides, rules, max_length, flip),
        *_vertical(all_sides, rules, max_length, flip),
    ]


def _horizontal(
    all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int, flip: str
) -> Iterator[Contact]:
    # Left/right pockets don't depend on length, so every length pair has the
    # same geometry: one contact per offset, collapsed over all length pairs.
    for left in all_sides.values():
        for right in all_sides.values():
            lengths = (left.min_length, right.min_length)
            collapsed = (max_length - left.min_length + 1) * (max_length - right.min_length + 1)
            for offset in horizontal_offsets():
                yield beside(all_sides, rules, flip, left, right, offset, lengths, collapsed)


def beside(
    all_sides: Mapping[str, SideEdges],
    rules: Rules,
    flip: str,
    left: SideEdges,
    right: SideEdges,
    offset: Fraction,
    lengths: tuple[int, int],
    collapsed: int = 1,
) -> Contact:
    """The horizontal contact `[left][right]`, `right` sitting `offset` lower."""
    pairs = horizontal_pairs(left.edges["right"], right.edges["left"], offset)
    attract, repel = tally(pairs)
    result = aggregate(attract, repel)
    kind, priority = _horizontal_verdict(rules, left.side.roles["right"], right.side.roles["left"], offset)
    unavoidable = _beside_tied(all_sides, rules, flip, left, right, offset)
    return Contact(
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
        labels=(_label(kind, priority, result, unavoidable),),
    )


def _horizontal_verdict(rules: Rules, right: str, left: str, offset: Fraction) -> tuple[str, str]:
    if offset != 0:
        return "forbid", rules.horizontal.off_line
    if left in rules.horizontal.connect[right]:
        return "connect", "must"
    return "forbid", rules.horizontal.forbid


def _beside_tied(
    all_sides: Mapping[str, SideEdges], rules: Rules, flip: str, left: SideEdges, right: SideEdges, offset: Fraction
) -> bool:
    """Whether `[left][right]` at `offset` behaves exactly like a connect.

    Under `top_bottom` it behaves like `[left'][right']` at -offset, under
    `left_right` like `[right'][left']` at -offset, where ' is the other side.
    """
    if left.other is None or right.other is None:
        return False
    partner_left, partner_right = all_sides[left.other], all_sides[right.other]
    if flip == "left_right":
        partner_left, partner_right = partner_right, partner_left
    kind, _ = _horizontal_verdict(rules, partner_left.side.roles["right"], partner_right.side.roles["left"], -offset)
    return kind == "connect"


# (upper length, lower length), offset -> whether a stack behaves exactly like a connect
Tied = Callable[[tuple[int, int], Fraction], bool]


def _stack_tied(
    all_sides: Mapping[str, SideEdges], rules: Rules, flip: str, upper: SideEdges, lower: SideEdges
) -> Tied | None:
    """Whether `upper` over `lower` at some lengths and offset behaves exactly
    like a connect; None if it never does.

    Under `top_bottom` it behaves like `lower'` over `upper'` at -offset,
    under `left_right` like `upper'` over `lower'` at upper length - lower
    length - offset, where ' is the other side.
    """
    if upper.other is None or lower.other is None:
        return None
    if flip == "top_bottom":
        partner_upper, partner_lower = all_sides[lower.other], all_sides[upper.other]
    else:
        partner_upper, partner_lower = all_sides[upper.other], all_sides[lower.other]
    bottom, top = partner_upper.side.roles["bottom"], partner_lower.side.roles["top"]
    connects = {d for d in rules.vertical.offsets if rules.vertical.verdict(bottom, top, d)[0] == "connect"}
    if not connects:
        return None
    if flip == "top_bottom":
        return lambda lengths, offset: -offset in connects
    return lambda lengths, offset: lengths[0] - lengths[1] - offset in connects


def _vertical(
    all_sides: Mapping[str, SideEdges], rules: Rules, max_length: int, flip: str
) -> Iterator[Contact]:
    for upper in all_sides.values():
        for lower in all_sides.values():
            tied = _stack_tied(all_sides, rules, flip, upper, lower)
            yield from _stacks(upper, lower, rules, max_length, tied)


def stack(
    all_sides: Mapping[str, SideEdges],
    rules: Rules,
    flip: str,
    upper: SideEdges,
    lower: SideEdges,
    lengths: tuple[int, int],
    offset: Fraction,
) -> Contact:
    """The vertical contact of `upper` over `lower` at these lengths and offset."""
    tied = _stack_tied(all_sides, rules, flip, upper, lower)
    pairs = vertical_pairs(upper.edges["bottom"], lower.edges["top"], *lengths, offset)
    labels = _vertical_labels(rules, upper.side, lower.side, offset)
    return _stack(upper, lower, offset, lengths, 1, pairs, labels, tied is not None and tied(lengths, offset))


def _stacks(
    upper: SideEdges, lower: SideEdges, rules: Rules, max_length: int, tied: Tied | None
) -> Iterator[Contact]:
    """Every contact of `upper` over `lower`, collapsed over length pairs.

    At a given length pair, pockets line up at only a few offsets. Those
    contacts are grouped by which pockets face which. At every other offset
    no pockets line up, and those length pairs collapse into one contact.
    Under a `left_right` flip whether a forbid is unavoidable can depend on
    the lengths, so length pairs only collapse when they agree on it.
    """
    bottom, top = upper.edges["bottom"], lower.edges["top"]
    steps = [Fraction(step, 4) for step in range(-4 * max_length + 1, 4 * max_length)]
    labels = {offset: _vertical_labels(rules, upper.side, lower.side, offset) for offset in steps}
    unavoidable = None if tied is None else _forbids_only(tied, labels)
    # offset -> (aligned pocket indices, unavoidable) -> [smallest lengths, count, pairs]
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
            flagged = unavoidable is not None and unavoidable(lengths, offset)
            key = (tuple((p.a.index, p.b.index) for p in pairs), flagged)
            seen = aligned.setdefault(offset, {}).setdefault(key, [lengths, 0, pairs])
            seen[1] += 1
            aligned_lengths.setdefault(offset, set()).add(lengths)

    for offset in steps:
        # The edges overlap where the upper card reaches past the lower's left
        # end and the lower reaches past the upper's.
        upper_from = max(upper.min_length, math.floor(offset) + 1)
        lower_from = max(lower.min_length, math.floor(-offset) + 1)
        if upper_from > max_length or lower_from > max_length:
            continue
        groups = sorted(aligned.get(offset, {}).items(), key=lambda g: g[1][0])
        for (_, flagged), (lengths, collapsed, pairs) in groups:
            yield _stack(upper, lower, offset, lengths, collapsed, pairs, labels[offset], flagged)
        taken = aligned_lengths.get(offset, set())
        for flagged, lengths, collapsed in _unaligned(upper_from, lower_from, max_length, taken, offset, unavoidable):
            yield _stack(upper, lower, offset, lengths, collapsed, (), labels[offset], flagged)


def _forbids_only(tied: Tied, labels: Mapping[Fraction, list[tuple[str, str]]]) -> Tied:
    """`tied`, but only at offsets with a forbid label: nothing else can be
    unavoidable, so length pairs elsewhere needn't be told apart."""

    def unavoidable(lengths: tuple[int, int], offset: Fraction) -> bool:
        return any(kind == "forbid" for kind, _ in labels[offset]) and tied(lengths, offset)

    return unavoidable


def _unaligned(
    upper_from: int,
    lower_from: int,
    max_length: int,
    taken: set[tuple[int, int]],
    offset: Fraction,
    unavoidable: Tied | None,
) -> list[tuple[bool, tuple[int, int], int]]:
    """(unavoidable, smallest lengths, count) for the length pairs at `offset`
    where no pockets line up, split by whether they are unavoidable."""
    if unavoidable is None:
        count = (max_length - upper_from + 1) * (max_length - lower_from + 1) - len(taken)
        if not count:
            return []
        smallest = next(
            lengths for lengths in _length_pairs(upper_from, lower_from, max_length) if lengths not in taken
        )
        return [(False, smallest, count)]
    # unavoidable -> [smallest lengths, count]
    groups: dict[bool, list] = {}
    for lengths in _length_pairs(upper_from, lower_from, max_length):
        if lengths not in taken:
            groups.setdefault(unavoidable(lengths, offset), [lengths, 0])[1] += 1
    return sorted(((flagged, lengths, count) for flagged, (lengths, count) in groups.items()), key=lambda g: g[1])


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
    unavoidable: bool,
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
        labels=tuple(_label(kind, priority, result, unavoidable) for kind, priority in verdicts),
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


def _label(kind: str, priority: str, result: Result, unavoidable: bool) -> Label:
    """A label; only a forbid can be unavoidable."""
    return Label(kind=kind, priority=priority, grade=GRADES[kind][result], unavoidable=unavoidable and kind == "forbid")
