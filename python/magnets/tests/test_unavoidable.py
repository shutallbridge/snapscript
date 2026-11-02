"""A forbid whose partner contact is a connect can never be blocked: it is unavoidable.

The flag depends only on the grammar and the flip, so these tests check
empty arrangements. The bundled flip pairs take the same roles on both
sides, so a partner contact always has its contact's verdict and nothing is
unavoidable (ADR 0003). The other tests use the toy TOY_PAIRS class data, whose
flip pairs (set_get, define_call, prop, param) take different roles.
"""

from fractions import Fraction

import pytest

from helpers import beside, check_pairs, over
from magnets import check


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_the_bundled_card_set_has_no_unavoidable_forbid(flip):
    result = check({"flip": flip})
    flip_pairs = [c for c in result.groups if result.sides[c.a].other and result.sides[c.b].other]
    assert flip_pairs
    assert [c for c in result.groups if any(label.unavoidable for label in c.labels)] == []


def forbid(contact):
    [label] = [label for label in contact.labels if label.kind == "forbid"]
    return label


@pytest.mark.parametrize(
    "left, right, partner",
    [
        # [get{x}][set{x}to] snaps exactly like [set{x}to][get{x}].
        ("set_get.get", "set_get.set", "[set][get]"),
        ("prop.set_prop", "prop.get_prop", "[getProp][setProp]"),
        ("define_call.define", "literal.num", "[call][str]"),
        ("param.optional", "param.required", "[required][optional]"),
        ("literal.num", "param.required", "[str][optional]"),
        ("define_call.call", "param.required", "[define][optional]"),
    ],
)
def test_top_bottom_line_neighbours_tied_to_a_connect_are_unavoidable(left, right, partner):
    label = forbid(beside(check_pairs({}), left, right))
    assert (label.priority, label.unavoidable) == ("should", True)


@pytest.mark.parametrize("upper", ["set_get.set", "set_get.get"])
def test_top_bottom_a_define_under_a_set_or_get_line_is_unavoidable(upper):
    # [set{x}to] over [define{f}] @0 snaps exactly like [call{f}] over [get{x}] @0.
    label = forbid(over(check_pairs({}), upper, "define_call.define", 0))
    assert (label.priority, label.unavoidable) == ("nice", True)


def test_a_forbid_tied_to_another_forbid_is_avoidable():
    # [set{x}to][set{x}to]'s top_bottom partner contact [get{x}][get{x}] is a connect,
    # but [define{f}][get{x}]'s partner contact [call{f}][set{x}to] is not.
    result = check_pairs({})
    assert forbid(beside(result, "set_get.set", "set_get.set")).unavoidable
    assert not forbid(beside(result, "define_call.define", "set_get.get")).unavoidable
    # Off the line, no partner contact is a connect.
    assert not forbid(beside(result, "set_get.get", "set_get.set", Fraction(1, 3))).unavoidable


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_a_forbid_between_single_sided_cards_is_never_unavoidable(flip):
    result = check_pairs({"flip": flip})
    classes = [name.split(".")[0] for name in result.sides]
    single = {name for name in result.sides if classes.count(name.split(".")[0]) == 1}
    checked = 0
    for c in result.groups:
        if c.a in single or c.b in single:
            for label in c.labels:
                assert not label.unavoidable, c
                checked += 1
    assert checked


def test_only_forbid_labels_are_unavoidable():
    for flip in ("top_bottom", "left_right"):
        for c in check_pairs({"flip": flip}).groups:
            for label in c.labels:
                if label.unavoidable:
                    assert label.kind == "forbid", c


def test_left_right_ties_line_neighbours_the_other_way_round():
    # Under left_right [A][B] behaves like [B'][A']: [set{x}to][set{x}to]
    # like [get{x}][get{x}], a connect; [get{x}][set{x}to] like itself.
    result = check_pairs({"flip": "left_right"})
    assert forbid(beside(result, "set_get.set", "set_get.set")).unavoidable
    assert not forbid(beside(result, "set_get.get", "set_get.set")).unavoidable
    # [define{f}][num{…}] behaves like [str{…}][call{f}], a connect.
    assert forbid(beside(result, "define_call.define", "literal.num")).unavoidable


def stacks(result, upper, lower, offset):
    """(lengths, count, unavoidable) of every contact of `upper` over `lower` at `offset`."""
    return sorted(
        (c.lengths, c.count, forbid(c).unavoidable)
        for c in result.groups
        if c.axis == "vertical" and (c.a, c.b, c.offset) == (upper, lower, offset)
    )


def test_left_right_ties_a_stack_to_its_mirror_image_which_depends_on_lengths():
    # Under left_right A above B at d behaves like A' above B' at
    # L_A - L_B - d: [set{x}to] over [define{f}] @0 is tied to
    # [get{x}] over [call{f}], a connect, only on cards of equal length.
    result = check_pairs({"flip": "left_right"})
    assert stacks(result, "set_get.set", "define_call.define", 0) == [
        ((2, 2), 5, True),
        ((2, 3), 20, False),
    ]
    # @+1 it is tied to the connect @0 when [set{x}to] is 1U longer.
    assert stacks(result, "set_get.set", "define_call.define", 1) == [
        ((2, 2), 21, False),
        ((3, 2), 4, True),
    ]


def test_left_right_unavoidable_stacks_with_pockets():
    # set's bottom and define's top pockets both sit 1/6 U from the left
    # end: @0 they line up at every length pair, but only equal lengths are
    # unavoidable. Under left_right get's bottom and call's top sit 1/6 U
    # from the right end, so [get{x}] over [call{f}] snaps at equal lengths.
    result = check_pairs(
        {
            "flip": "left_right",
            "classes": {
                "set_get": {"bottom": [{"from": "left", "at": "1/6", "layers": "N/-"}]},
                "define_call": {"top": [{"from": "left", "at": "1/6", "layers": "S/-"}]},
            },
        }
    )
    found = sorted(
        (c.lengths, c.count, c.result, forbid(c).unavoidable, forbid(c).grade)
        for c in result.groups
        if c.axis == "vertical" and (c.a, c.b, c.offset) == ("set_get.set", "define_call.define", 0)
    )
    assert found == [((2, 2), 5, "snap", True, "leak"), ((2, 3), 20, "snap", False, "leak")]
    partner = sorted(
        (c.lengths, c.result)
        for c in result.groups
        if c.axis == "vertical" and (c.a, c.b, c.offset) == ("set_get.get", "define_call.call", 0)
    )
    assert partner == [((2, 2), "snap"), ((2, 3), "nothing")]
