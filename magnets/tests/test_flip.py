"""The back side of a flip pair is derived from its front."""

from hypothesis import assume, given
from hypothesis import strategies as st

from helpers import set_get
from magnets import check

LAYER_PAIRS = [f"{p}/{q}" for p in "NSF-" for q in "NSF-" if (p, q) != ("-", "-")]
ANCHORED = [(f, at) for f in ("left", "right") for at in (0.25, 0.5, 0.75)]


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


@st.composite
def top_bottom_pockets(draw):
    places = draw(st.lists(st.sampled_from(ANCHORED), max_size=2, unique=True))
    # from: left x and from: right y meet on a 1U card when x + y = 1.
    assume(not any(a[0] != b[0] and a[1] + b[1] == 1 for a in places for b in places))
    return [(f, at, draw(st.sampled_from(LAYER_PAIRS))) for f, at in places]


@st.composite
def left_right_pockets(draw):
    heights = draw(st.lists(st.sampled_from([0.25, 0.5, 0.75]), max_size=3, unique=True))
    return [(h, draw(st.sampled_from(LAYER_PAIRS))) for h in heights]


@st.composite
def set_get_arrangements(draw):
    return set_get(
        flip=draw(st.sampled_from(["top_bottom", "left_right"])),
        top=draw(top_bottom_pockets()),
        bottom=draw(top_bottom_pockets()),
        left=draw(left_right_pockets()),
        right=draw(left_right_pockets()),
    )


@given(set_get_arrangements())
def test_flipping_twice_gives_back_the_front(arrangement):
    once = check(arrangement)
    # Author the derived back as a front: its derived back is the front flipped twice.
    back_as_front = {
        "flip": arrangement["flip"],
        "classes": {"set_get": edges(once, "get")},
    }
    twice = check(back_as_front)
    assert edges(twice, "get") == edges(once, "set")
