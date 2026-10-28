"""Layer interactions, their aggregation, and pocket shapes, through `check`."""

import pytest

from helpers import check_pairs, set_get, stack

LAYER_TABLE = [
    ("-", "-", "nothing"),
    ("-", "N", "nothing"),
    ("-", "S", "nothing"),
    ("-", "F", "nothing"),
    ("N", "-", "nothing"),
    ("F", "-", "nothing"),
    ("F", "F", "nothing"),
    ("N", "F", "attract"),
    ("S", "F", "attract"),
    ("F", "N", "attract"),
    ("F", "S", "attract"),
    ("N", "S", "attract"),
    ("S", "N", "attract"),
    ("N", "N", "repel"),
    ("S", "S", "repel"),
]


def _alone_up(layer):
    """A pocket with `layer` up and a down layer that interacts with nothing."""
    return f"{layer}/-" if layer != "-" else "-/F"


@pytest.mark.parametrize("upper, lower, expected", LAYER_TABLE)
def test_layer_table(upper, lower, expected):
    # set over set: set's bottom edge faces set's own top edge.
    arrangement = set_get(
        bottom=[("left", "1/6", _alone_up(upper))],
        top=[("left", "1/6", _alone_up(lower))],
    )
    contact = stack(check_pairs(arrangement), "set", "set")
    [pair] = contact.pairs
    assert (pair.up, pair.down) == (expected, "nothing")
    assert (contact.attract, contact.repel) == (
        int(expected == "attract"),
        int(expected == "repel"),
    )


@pytest.mark.parametrize(
    "bottom, top, attract, repel, result",
    [
        # One pocket pair, both layers counted.
        ([("left", "1/6", "N/S")], [("left", "1/6", "S/N")], 2, 0, "snap"),
        ([("left", "1/6", "N/S")], [("left", "1/6", "N/S")], 0, 2, "repel"),
        ([("left", "1/6", "N/N")], [("left", "1/6", "N/S")], 1, 1, "mixed"),
        ([("left", "1/6", "F/F")], [("left", "1/6", "F/-")], 0, 0, "nothing"),
        # Counts sum across pocket pairs.
        (
            [("left", "1/6", "N/-"), ("left", "5/6", "N/-")],
            [("left", "1/6", "S/-"), ("left", "5/6", "N/-")],
            1,
            1,
            "mixed",
        ),
        (
            [("left", "1/6", "N/N"), ("left", "5/6", "S/-")],
            [("left", "1/6", "F/F"), ("left", "5/6", "N/-")],
            3,
            0,
            "snap",
        ),
        # Pockets that don't line up don't interact.
        ([("left", "1/6", "N/N")], [("left", "1/2", "N/N")], 0, 0, "nothing"),
        # No pockets at all.
        ([], [], 0, 0, "nothing"),
    ],
)
def test_aggregation(bottom, top, attract, repel, result):
    contact = stack(check_pairs(set_get(bottom=bottom, top=top)), "set", "set")
    assert (contact.attract, contact.repel, contact.result) == (attract, repel, result)


def test_connect_grades():
    def grade(bottom, top):
        contact = stack(check_pairs(set_get(bottom=bottom, top=top)), "set", "set")
        [label] = contact.labels
        return label.kind, contact.result, label.grade

    assert grade([("left", "1/6", "N/-")], [("left", "1/6", "S/-")]) == ("connect", "snap", "pass")
    assert grade([("left", "1/6", "N/-")], [("left", "1/6", "N/-")]) == ("connect", "repel", "FAIL")
    assert grade([("left", "1/6", "N/N")], [("left", "1/6", "N/S")]) == ("connect", "mixed", "FAIL")
    assert grade([], []) == ("connect", "nothing", "FAIL")


@pytest.mark.parametrize(
    "layers, shape",
    [
        ("N/N", "uniform"),
        ("S/S", "uniform"),
        ("F/F", "uniform"),
        ("N/-", "half"),
        ("-/S", "half"),
        ("F/-", "half"),
        ("N/S", "split"),
        ("S/N", "split"),
        ("N/F", "split"),
        ("F/S", "split"),
    ],
)
def test_pocket_shapes(layers, shape):
    result = check_pairs(set_get(top=[("left", "1/6", layers)], left=[("1/2", layers)]))
    # A flip changes every split pocket's layers but never its shape.
    for side in ("set", "get"):
        edges = result.sides[f"set_get.{side}"].edges
        pockets = [*edges["top"], *edges["bottom"], *edges["left"]]
        assert [p.shape for p in pockets] == [shape, shape]


SELF_FACING = [(p, q, expected) for p, q, expected in LAYER_TABLE if (p, q) != ("-", "-")]


@pytest.mark.parametrize("p, q, expected", SELF_FACING)
def test_a_pocket_facing_its_own_flipped_copy_snaps_only_if_its_layers_attract(p, q, expected):
    # Under top_bottom get's top is set's bottom flipped, so set over get puts
    # P/Q against Q/P: P faces Q in both layers.
    contact = stack(check_pairs(set_get(bottom=[("left", "1/6", f"{p}/{q}")])), "set", "get")
    [pair] = contact.pairs
    assert (pair.a.layers, pair.b.layers) == (f"{p}/{q}", f"{q}/{p}")
    assert (pair.up, pair.down) == (expected, expected)
    assert contact.result == {"attract": "snap", "repel": "repel", "nothing": "nothing"}[expected]
