"""The back side of a flip pair is derived from its front."""

from fractions import Fraction

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import left_right_pockets, set_get, top_bottom_pockets
from magnets import check



def edges(result, side):
    return {
        edge: [p.to_dict() for p in pockets]
        for edge, pockets in result.sides[f"set_get.{side}"].edges.items()
    }


def test_top_bottom_swaps_edges_mirrors_heights_and_swaps_layers():
    result = check(
        set_get(
            top=[("left", 0.25, "N/S"), ("right", 0.5, "F/-")],
            bottom=[("right", 0.25, "S/S")],
            left=[(0.25, "N/F")],
            right=[(0.5, "-/N"), (0.75, "S/N")],
        )
    )
    assert edges(result, "get") == {
        "top": [{"from": "right", "at": 0.25, "layers": "S/S"}],
        "bottom": [
            {"from": "left", "at": 0.25, "layers": "S/N"},
            {"from": "right", "at": 0.5, "layers": "-/F"},
        ],
        "left": [{"at": 0.75, "layers": "F/N"}],
        "right": [{"at": 0.5, "layers": "N/-"}, {"at": 0.25, "layers": "N/S"}],
    }


def test_left_right_swaps_edges_mirrors_anchors_and_swaps_layers():
    result = check(
        set_get(
            "left_right",
            top=[("left", 0.25, "N/S"), ("right", 0.5, "F/-")],
            bottom=[("right", 0.25, "S/S")],
            left=[(0.25, "N/F")],
            right=[(0.5, "-/N"), (0.75, "S/N")],
        )
    )
    assert edges(result, "get") == {
        # Top and bottom stay; anchors mirror, keeping `at`.
        "top": [
            {"from": "right", "at": 0.25, "layers": "S/N"},
            {"from": "left", "at": 0.5, "layers": "-/F"},
        ],
        "bottom": [{"from": "left", "at": 0.25, "layers": "S/S"}],
        # Left and right swap; heights stay.
        "left": [{"at": 0.5, "layers": "N/-"}, {"at": 0.75, "layers": "N/S"}],
        "right": [{"at": 0.25, "layers": "F/N"}],
    }


SERIES = {Fraction(1, 4): "A", Fraction(3, 4): "A", Fraction(1, 2): "B"}


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_positions_stay_in_their_series(flip):
    # Series A = 1/4 and 3/4 of a U, series B = 1/2: at a whole-U offset a
    # pocket only meets one in the same series, front or back.
    result = check(
        set_get(
            flip,
            top=[("left", 0.25, "N/S"), ("right", 0.5, "F/-")],
            bottom=[("right", 0.75, "S/S")],
            left=[(0.25, "N/F"), (0.5, "S/-")],
            right=[(0.75, "S/N")],
        ),
        max_length=3,
    )

    def series(side, length):
        return sorted(
            (p.index, edge, SERIES[p.position(length) % 1])
            for edge, pockets in result.sides[f"set_get.{side}"].edges.items()
            for p in pockets
        )

    moved = {"top": "bottom", "bottom": "top"} if flip == "top_bottom" else {"left": "right", "right": "left"}
    for length in (1, 2, 3):
        flipped = {(i, edge): s for i, edge, s in series("get", length)}
        for i, edge, s in series("set", length):
            assert flipped[i, moved.get(edge, edge)] == s


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_uniform_pockets_are_unchanged_by_a_flip(flip):
    result = check(set_get(flip, top=[("left", 0.5, "N/N")], left=[(0.5, "F/F")], right=[(0.5, "S/S")]))
    layers = {edge: [p.layers for p in pockets] for edge, pockets in result.sides["set_get.get"].edges.items()}
    assert sorted(ly for found in layers.values() for ly in found) == ["F/F", "N/N", "S/S"]
    shapes = [p.shape for pockets in result.sides["set_get.get"].edges.values() for p in pockets]
    assert shapes == ["uniform"] * 3


@st.composite
def set_get_arrangements(draw):
    return set_get(
        flip=draw(st.sampled_from(["top_bottom", "left_right"])),
        top=draw(top_bottom_pockets()),
        bottom=draw(top_bottom_pockets()),
        left=draw(left_right_pockets()),
        right=draw(left_right_pockets()),
    )


# Each example checks two arrangements in full, which can outlast
# hypothesis's default deadline. Flips don't depend on card length, so short
# cards keep the checks quick.
@settings(deadline=None)
@given(set_get_arrangements())
def test_flipping_twice_gives_back_the_front(arrangement):
    once = check(arrangement, max_length=2)
    # Author the derived back as a front: its derived back is the front flipped twice.
    back_as_front = {
        "flip": arrangement["flip"],
        "classes": {"set_get": edges(once, "get")},
    }
    twice = check(back_as_front, max_length=2)
    assert edges(twice, "get") == edges(once, "set")
