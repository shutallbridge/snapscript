"""The shipped `example` arrangement, and the worked set_get example on toy data."""

import pytest

from helpers import SET_GET, beside, check_pairs, over, set_get, stack
from magnets import check

# The worked set_get example on the TOY_PAIRS data, whose set_get flip pair
# takes different roles on each side: get over set, set over get and both
# self-stacks all snap under a top-to-bottom flip.
SET_GET_EXAMPLE = set_get(top=[("left", 0.25, "F/N")], bottom=[("left", 0.25, "F/S")])


def pockets(result, side, edge):
    return [p.layers for p in result.sides[f"set_get.{side}"].edges[edge]]


def test_derived_get_has_flipped_pockets():
    result = check_pairs(SET_GET_EXAMPLE)
    assert pockets(result, "set", "top") == ["F/N"]
    assert pockets(result, "set", "bottom") == ["F/S"]
    assert pockets(result, "get", "top") == ["S/F"]
    assert pockets(result, "get", "bottom") == ["N/F"]


@pytest.mark.parametrize(
    "upper, lower, upper_bottom, lower_top, up, down",
    [
        ("set", "set", "F/S", "F/N", "nothing", "attract"),
        ("get", "set", "N/F", "F/N", "attract", "attract"),
        ("set", "get", "F/S", "S/F", "attract", "attract"),
        ("get", "get", "N/F", "S/F", "attract", "nothing"),
    ],
)
def test_four_set_get_stacks_snap(upper, lower, upper_bottom, lower_top, up, down):
    contact = stack(check_pairs(SET_GET_EXAMPLE), upper, lower)
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers) == (upper_bottom, lower_top)
    assert (pair.up, pair.down) == (up, down)
    assert contact.result == "snap"
    [label] = contact.labels
    assert (label.kind, label.priority, label.grade) == ("connect", "must", "pass")


def test_nn_on_set_get_top_fails_get_over_set():
    # The derived get's bottom is N/N too, and N/N on N/N repels.
    result = check_pairs(set_get(top=[("left", 0.25, "N/N")], bottom=[("left", 0.25, "F/S")]))
    contact = stack(result, "get", "set")
    assert contact.result == "repel"
    [label] = contact.labels
    assert label.grade == "FAIL"
    assert (contact, label) in result.must_failures
    assert not result.valid


@pytest.mark.parametrize("upper", ["simple_head.head", "get.get"])
@pytest.mark.parametrize("lower", ["simple_head.head", "get.get"])
def test_set_and_get_lines_stack_in_every_order(upper, lower):
    contact = over(check("example"), upper, lower, 0)
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers, contact.result) == ("N/S", "F/F", "snap")
    [label] = contact.labels
    assert (label.kind, label.grade) == ("connect", "pass")


@pytest.mark.parametrize("left", ["literal.num", "literal.str"])
@pytest.mark.parametrize("right", ["literal.num", "literal.str"])
def test_literals_snap_inline_in_every_order(left, right):
    # str's right edge is num's flipped: S/N, which F/F still attracts.
    contact = beside(check("example"), left, right)
    [pair] = contact.pairs
    expected = "N/S" if left == "literal.num" else "S/N"
    assert (pair.a.layers, pair.b.layers, contact.result) == (expected, "F/F", "snap")
    [label] = contact.labels
    assert (label.kind, label.grade) == ("connect", "pass")


def test_example_fails_only_where_it_has_no_pockets():
    # The example designs only simple_head's, get's and literal's edges, so every
    # other connect contact fails for want of pockets, never because of a bad one.
    result = check("example")
    assert not result.valid
    assert result.must_failures
    designed = {"simple_head.head", "get.get"}
    for contact, label in result.must_failures:
        assert contact.pairs == () and contact.result == "nothing", contact
        assert not (contact.axis == "vertical" and {contact.a, contact.b} <= designed)


def test_lengths_with_identical_geometry_collapse():
    # Both pockets are anchored on the left, so every length pair lines them up.
    contact = over(check("example", max_length=6), "simple_head.head", "get.get", 0)
    assert contact.lengths == (2, 2)
    assert contact.count == 5 * 5


def test_set_get_is_not_a_bundled_class():
    assert not SET_GET & set(check({}).sides)
