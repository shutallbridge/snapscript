"""The shipped `example` arrangement reproduces the set_get design."""

import pytest

from helpers import SET_GET, set_get, stack
from magnets import check


def pockets(result, side, edge):
    return [p.layers for p in result.sides[f"set_get.{side}"].edges[edge]]


def test_derived_get_has_flipped_pockets():
    result = check("example")
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
def test_four_stacks_snap(upper, lower, upper_bottom, lower_top, up, down):
    contact = stack(check("example"), upper, lower)
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers) == (upper_bottom, lower_top)
    assert (pair.up, pair.down) == (up, down)
    assert contact.result == "snap"
    [label] = contact.labels
    assert (label.kind, label.priority, label.grade) == ("connect", "must", "pass")


def test_example_fails_only_where_it_has_no_pockets():
    # The example designs only set_get's top and bottom edges, so every other
    # connect contact fails for want of pockets, never because of a bad one.
    result = check("example")
    assert not result.valid
    assert result.must_failures
    for contact, label in result.must_failures:
        assert contact.pairs == () and contact.result == "nothing", contact
        assert not (contact.axis == "vertical" and {contact.a, contact.b} <= SET_GET)


def test_lengths_with_identical_geometry_collapse():
    contact = stack(check("example", max_length=6), "set", "get")
    assert contact.lengths == (1, 1)
    assert contact.collapsed == 6


def test_nn_on_set_get_top_fails_get_over_set():
    # The derived get's bottom is N/N too, and N/N on N/N repels.
    result = check(set_get(top=[("left", 0.25, "N/N")], bottom=[("left", 0.25, "F/S")]))
    contact = stack(result, "get", "set")
    assert contact.result == "repel"
    [label] = contact.labels
    assert label.grade == "FAIL"
    assert (contact, label) in result.must_failures
    assert not result.valid
