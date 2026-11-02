"""The back side of a flip pair is derived from its front."""

from fractions import Fraction

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import check_pairs, left_right_pockets, set_get, top_bottom_pockets
from magnets.physics import flipped_edge



def edges(result, side):
    return {
        edge: [p.to_dict() for p in pockets]
        for edge, pockets in result.sides[f"set_get.{side}"].edges.items()
    }


def test_top_bottom_swaps_edges_mirrors_heights_and_swaps_layers():
    result = check_pairs(
        set_get(
            top=[("left", "1/6", "N/S"), ("right", "1/2", "S/-")],
            bottom=[("right", "1/6", "S/S")],
            left=[("1/6", "N/-")],
            right=[("1/2", "-/N"), ("5/6", "S/N")],
        )
    )
    assert edges(result, "get") == {
        "top": [{"from": "right", "at": "1/6", "layers": "S/S"}],
        "bottom": [
            {"from": "left", "at": "1/6", "layers": "S/N"},
            {"from": "right", "at": "1/2", "layers": "-/S"},
        ],
        "left": [{"at": "5/6", "layers": "-/N"}],
        "right": [{"at": "1/2", "layers": "N/-"}, {"at": "1/6", "layers": "N/S"}],
    }


def test_left_right_swaps_edges_mirrors_anchors_and_swaps_layers():
    result = check_pairs(
        set_get(
            "left_right",
            top=[("left", "1/6", "N/S"), ("right", "1/2", "S/-")],
            bottom=[("right", "1/6", "S/S")],
            left=[("1/6", "N/-")],
            right=[("1/2", "-/N"), ("5/6", "S/N")],
        )
    )
    assert edges(result, "get") == {
        # Top and bottom stay; anchors mirror, keeping `at`.
        "top": [
            {"from": "right", "at": "1/6", "layers": "S/N"},
            {"from": "left", "at": "1/2", "layers": "-/S"},
        ],
        "bottom": [{"from": "left", "at": "1/6", "layers": "S/S"}],
        # Left and right swap; heights stay.
        "left": [{"at": "1/2", "layers": "N/-"}, {"at": "5/6", "layers": "N/S"}],
        "right": [{"at": "1/6", "layers": "-/N"}],
    }


SERIES = {Fraction(1, 6): "A", Fraction(5, 6): "A", Fraction(1, 2): "B"}


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_positions_stay_in_their_series(flip):
    # Series A = 1/6 and 5/6 of a U, series B = 1/2: at a whole-U offset a
    # pocket only meets one in the same series, front or back.
    result = check_pairs(
        set_get(
            flip,
            top=[("left", "1/6", "N/S"), ("right", "1/2", "S/-")],
            bottom=[("right", "5/6", "S/S")],
            left=[("1/6", "N/-"), ("1/2", "S/-")],
            right=[("5/6", "S/N")],
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
    result = check_pairs(set_get(flip, top=[("left", "1/2", "N/N")], left=[("1/2", "N/N")], right=[("1/2", "S/S")]))
    front, back = (result.sides[f"set_get.{side}"].edges for side in ("set", "get"))
    for edge, pockets in front.items():
        assert [p.layers for p in back[flipped_edge(edge, flip)]] == [p.layers for p in pockets]
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
    once = check_pairs(arrangement, max_length=2)
    # Author the derived back as a front: its derived back is the front flipped twice.
    back_as_front = {
        "flip": arrangement["flip"],
        "classes": {"set_get": edges(once, "get")},
    }
    twice = check_pairs(back_as_front, max_length=2)
    assert edges(twice, "get") == edges(once, "set")
