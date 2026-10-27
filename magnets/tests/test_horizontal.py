"""Left/right-edge contacts between line neighbours: `[A][B]`, A's right edge facing B's left."""

import pytest

from helpers import arrangement, beside, check_pairs

LEFT_ROLES = ("value", "call", "cont", "required", "optional", "head")

# #10's horizontal table: right role of the left card -> left roles it connects to.
CONNECTS = {
    "open": {"value", "call"},
    "call": {"value", "call", "cont", "optional"},
    "value": {"value", "call", "cont", "optional"},
    "params": {"required", "optional"},
    "default": {"value", "call", "optional"},
    "end": set(),
}


def verdict(label):
    return label.kind, label.priority


def test_every_role_pair_has_exactly_one_verdict_at_offset_0():
    result = check_pairs({})
    found: dict[tuple[str, str], set] = {}
    for c in result.groups:
        if c.axis == "horizontal" and c.offset == 0:
            roles = (result.sides[c.a].side.roles["right"], result.sides[c.b].side.roles["left"])
            found.setdefault(roles, set()).update(verdict(label) for label in c.labels)
    expected = {
        (right, left): {("connect", "must") if left in lefts else ("forbid", "should")}
        for right, lefts in CONNECTS.items()
        for left in LEFT_ROLES
    }
    assert found == expected


def test_every_contact_has_exactly_one_label():
    for c in check_pairs({}).groups:
        if c.axis == "horizontal":
            assert len(c.labels) == 1, c


def test_contacts_cover_every_ordered_pair_of_sides_including_a_side_with_itself():
    result = check_pairs({})
    pairs = {(c.a, c.b) for c in result.groups if c.axis == "horizontal" and c.offset == 0}
    assert pairs == {(a, b) for a in result.sides for b in result.sides}
    assert ("set_get.set", "set_get.set") in pairs


def test_offsets_are_every_quarter_u_where_pockets_can_align():
    result = check_pairs({})
    offsets = {c.offset for c in result.groups if c.axis == "horizontal"}
    assert offsets == {-0.5, -0.25, 0, 0.25, 0.5}


def test_off_line_contacts_are_forbid_low():
    for c in check_pairs({}).groups:
        if c.axis == "horizontal" and c.offset != 0:
            assert [verdict(label) for label in c.labels] == [("forbid", "low")], c


def test_parameters_with_a_call_default_are_connect():
    # [optional{a}][call{random}][optional{b}]
    result = check_pairs({})
    for a, b in [("param.optional", "define_call.call"), ("define_call.call", "param.optional")]:
        [label] = beside(result, a, b).labels
        assert verdict(label) == ("connect", "must")


def test_optional_before_required_is_forbid_should():
    [label] = beside(check_pairs({}), "param.optional", "param.required").labels
    assert verdict(label) == ("forbid", "should")


def test_set_then_num_snaps_as_connect():
    # [set{x}to][num{1}]: open -> value.
    result = check_pairs(
        arrangement(
            set_get={"right": [(0.5, "N/-")]},
            literal={"left": [(0.5, "S/-")]},
        )
    )
    contact = beside(result, "set_get.set", "literal.num")
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers) == ("N/-", "S/-")
    assert (contact.attract, contact.repel, contact.result) == (1, 0, "snap")
    [label] = contact.labels
    assert (label.kind, label.priority, label.grade) == ("connect", "must", "pass")
    assert (contact, label) not in result.must_failures


@pytest.mark.parametrize(
    "num_right, set_left, result, grade",
    [
        ("N/-", "S/-", "snap", "leak"),
        ("N/N", "S/N", "mixed", "partial"),
        ("N/-", "-/S", "nothing", "weak"),
        ("N/-", "N/-", "repel", "strong"),
    ],
)
def test_num_then_set_is_graded_forbid(num_right, set_left, result, grade):
    # [num{1}][set{x}to]: value -> head.
    contact = beside(
        check_pairs(
            arrangement(
                literal={"right": [(0.25, num_right)]},
                set_get={"left": [(0.25, set_left)]},
            )
        ),
        "literal.num",
        "set_get.set",
    )
    assert contact.result == result
    [label] = contact.labels
    assert (label.kind, label.priority, label.grade) == ("forbid", "should", grade)


def test_pockets_at_different_heights_meet_off_line_as_forbid_low():
    # set's right pocket at 0.25 meets num's left pocket at 0.5 when num sits 0.25U higher.
    result = check_pairs(
        arrangement(
            set_get={"right": [(0.25, "N/-")]},
            literal={"left": [(0.5, "S/-")]},
        )
    )
    on_line = beside(result, "set_get.set", "literal.num")
    assert on_line.pairs == () and on_line.result == "nothing"
    off_line = beside(result, "set_get.set", "literal.num", offset=-0.25)
    [pair] = off_line.pairs
    assert (pair.a.at, pair.b.at) == (0.25, 0.5)
    assert off_line.result == "snap"
    [label] = off_line.labels
    assert (label.kind, label.priority, label.grade) == ("forbid", "low", "leak")
    # Lower B by 0.25U and B's pocket at 0.5 sits at 0.75, which A doesn't have.
    assert beside(result, "set_get.set", "literal.num", offset=0.25).pairs == ()


def test_contacts_are_independent_of_length():
    # Left/right pockets have no anchor, so every length pair collapses into one.
    contact = beside(check_pairs({}, max_length=6), "block_head.head", "literal.num")
    assert contact.lengths == (2, 2)
    assert contact.count == 5 * 5


@pytest.mark.parametrize("height", [0.25, 0.5, 0.75])
def test_heights_mirror_under_top_bottom_and_stay_in_their_series(height):
    result = check_pairs(arrangement(set_get={"left": [(height, "N/-")], "right": [(height, "S/F")]}))
    for edge in ("left", "right"):
        [front] = result.sides["set_get.set"].edges[edge]
        [back] = result.sides["set_get.get"].edges[edge]
        assert back.at == 1 - height
        assert back.layers == front.layers[::-1]
        # Series A is 1/4 and 3/4 of a U, series B is 1/2.
        assert (front.at == 0.5) == (back.at == 0.5)
