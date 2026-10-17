"""A back is derived from its front, so contacts between flip pairs are tied.

With A' for the other side of A (#10, "Unavoidable leaks"):
- top_bottom, horizontal: [A][B] at s behaves like [A'][B'] at -s;
- top_bottom, vertical: A above B at d behaves like B' above A' at -d;
- left_right, horizontal: [A][B] at s behaves like [B'][A'] at -s;
- left_right, vertical: A above B at d behaves like A' above B' at L_A - L_B - d.

A forbid whose partner contact is a connect is unavoidable.
"""

from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import arrangement, left_right_pockets, top_bottom_pockets
from magnets import check

# Every flip pair is 2U at its shortest.
FLIP_PAIRS = ("set_get", "define_call", "prop", "param", "literal", "bool")
MAX_LENGTH = 3


@st.composite
def flip_pair_arrangements(draw, flip):
    names = draw(st.lists(st.sampled_from(FLIP_PAIRS), min_size=1, max_size=3, unique=True))
    classes = {
        name: {
            "top": draw(top_bottom_pockets()),
            "bottom": draw(top_bottom_pockets()),
            "left": draw(left_right_pockets()),
            "right": draw(left_right_pockets()),
        }
        for name in names
    }
    return arrangement(flip, **classes)


def other_sides(result):
    """Each flip pair side -> its other side."""
    by_class = {}
    for name in result.sides:
        by_class.setdefault(name.split(".")[0], []).append(name)
    return {
        side: next(s for s in sides if s != side)
        for sides in by_class.values()
        if len(sides) == 2
        for side in sides
    }


def key(pairs):
    return frozenset((p.a.index, p.b.index) for p in pairs)


def transposed(k):
    return frozenset((b, a) for a, b in k)


def aligned(result, upper, lower, lengths, offset):
    """Which pockets line up with `upper` over `lower`, from pocket positions."""
    bottom = result.sides[upper].edges["bottom"]
    top = result.sides[lower].edges["top"]
    return frozenset(
        (a.index, b.index)
        for a in bottom
        for b in top
        if a.position(lengths[0]) == offset + b.position(lengths[1])
    )


def partner(flip, contact, other):
    """(a, b, offset, partner contact lengths, pair key) of the contact tied to `contact`."""
    a, b, s, k = other[contact.a], other[contact.b], contact.offset, key(contact.pairs)
    la, lb = contact.lengths
    if contact.axis == "horizontal":
        return (a, b, -s, None, k) if flip == "top_bottom" else (b, a, -s, None, transposed(k))
    if flip == "top_bottom":
        return (b, a, -s, (lb, la), transposed(k))
    return (a, b, la - lb - s, (la, lb), k)


def check_relations(flip, raw):
    result = check(raw, max_length=MAX_LENGTH)
    other = other_sides(result)
    index = {}
    for c in result.groups:
        index.setdefault((c.axis, c.a, c.b, c.offset, key(c.pairs)), []).append(c)
    tied = 0
    for c in result.groups:
        if c.a not in other or c.b not in other:
            continue
        a, b, offset, lengths, k = partner(flip, c, other)
        if c.axis == "vertical":
            # The partner contact, at its lengths, lines up the same pockets.
            assert aligned(result, a, b, lengths, offset) == k, c
        found = index.get((c.axis, a, b, offset, k))
        assert found, c
        for p in found:
            assert (p.attract, p.repel, p.result) == (c.attract, c.repel, c.result), (c, p)
        # A forbid is unavoidable exactly when its partner contact is a connect.
        partner_connects = any(label.kind == "connect" for p in found for label in p.labels)
        for label in c.labels:
            if label.kind == "forbid":
                assert label.unavoidable == partner_connects, (c, found)
        tied += 1
    assert tied


# Each example checks a whole arrangement, which can outlast hypothesis's
# default deadline.
@settings(deadline=None, max_examples=40)
@given(flip_pair_arrangements("top_bottom"))
def test_top_bottom_ties_every_flip_pair_contact_to_its_partner(raw):
    check_relations("top_bottom", raw)


@settings(deadline=None, max_examples=40)
@given(flip_pair_arrangements("left_right"))
def test_left_right_ties_every_flip_pair_contact_to_its_partner(raw):
    check_relations("left_right", raw)


def test_a_flip_pair_contact_and_its_partner_in_numbers():
    # set's right edge N/S at 1/2 and left edge N/S at 1/2. Under top_bottom
    # get's edges are S/N at 1/2: [get][set] snaps exactly like [set][get].
    result = check(arrangement(set_get={"left": [(0.5, "N/S")], "right": [(0.5, "N/S")]}))
    pairs = {
        (c.a, c.b): (c.attract, c.repel, c.result)
        for c in result.groups
        if c.axis == "horizontal" and c.offset == 0 and c.a.startswith("set_get") and c.b.startswith("set_get")
    }
    assert pairs[("set_get.get", "set_get.set")] == pairs[("set_get.set", "set_get.get")] == (2, 0, "snap")
    assert pairs[("set_get.set", "set_get.set")] == pairs[("set_get.get", "set_get.get")] == (0, 2, "repel")
