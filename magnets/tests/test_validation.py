"""Malformed arrangements are rejected with a message naming the problem."""

import pytest

from helpers import arrangement, check_pairs, pair_classes, set_get
from magnets import ArrangementError


@pytest.mark.parametrize(
    "arrangement, message",
    [
        # Grid positions and anchors on top/bottom edges.
        (set_get(top=[("left", 0.3, "N/-")]), "off the grid"),
        (set_get(top=[("left", 1, "N/-")]), "off the grid"),
        # set_get is 2U at its shortest, but its pockets reach only 1U from an end.
        (set_get(top=[("left", 1.25, "N/-")]), "beyond its pocket reach 1U"),
        (set_get(top=[("left", -0.25, "N/-")]), "beyond its pocket reach 1U"),
        (set_get(top=[("middle", 0.25, "N/-")]), "`from` must be left or right"),
        (set_get(top=[("left", "a", "N/-")]), "`at` must be a number"),
        # At most 2 pockets on top/bottom edges.
        (
            set_get(bottom=[("left", 0.25, "N/-"), ("left", 0.5, "N/-"), ("left", 0.75, "N/-")]),
            "at most 2",
        ),
        # Left/right heights.
        (set_get(left=[(0.3, "N/-")]), "0.25, 0.5 or 0.75"),
        (set_get(right=[(1, "N/-")]), "0.25, 0.5 or 0.75"),
        # No two pockets at the same position.
        (set_get(top=[("left", 0.25, "N/-"), ("left", 0.25, "S/-")]), "same position"),
        (set_get(left=[(0.5, "N/-"), (0.5, "S/-")]), "same position"),
        # from: left 0.25 and from: right 1.75 meet on a 2U block head.
        (
            arrangement(block_head={"bottom": [("left", 0.25, "N/-"), ("right", 1.75, "S/-")]}),
            "collide on a card 2U long",
        ),
        # Layers.
        (set_get(top=[("left", 0.25, "X/-")]), "layers 'X/-'"),
        (set_get(top=[("left", 0.25, "N")]), "layers 'N'"),
        (set_get(top=[("left", 0.25, "N/S/F")]), "layers 'N/S/F'"),
        (set_get(top=[("left", 0.25, "-/-")]), "-/- is no pocket"),
        # Unknown names.
        ({"flip": "sideways", "classes": {}}, "unknown flip"),
        ({"flip": "top_bottom", "classes": {"teapot": {}}}, "unknown card class 'teapot'"),
        ({"flip": "top_bottom", "classes": {"set_get": {"middle": []}}}, "unknown key(s) middle"),
        ({"flip": "top_bottom", "classes": {}, "extra": 1}, "unknown key(s) extra"),
    ],
)
def test_rejects(arrangement, message):
    with pytest.raises(ArrangementError) as err:
        check_pairs(arrangement)
    assert message in str(err.value)


def test_pockets_that_never_share_a_whole_length_do_not_collide():
    # 0.25 + 0.5 = 0.75 is not a card length.
    check_pairs(set_get(top=[("left", 0.25, "N/-"), ("right", 0.5, "S/-")]))


def test_pockets_meeting_below_the_shortest_length_do_not_collide():
    # from: left 0.25 and from: right 0.75 meet on a 1U card, but set_get is 2U at its shortest.
    check_pairs(set_get(top=[("left", 0.25, "N/-"), ("right", 0.75, "S/-")]))


def test_a_class_set_back_to_1u_checks_its_collisions_at_1u():
    classes = pair_classes()
    classes["set_get"]["min_length"] = 1
    with pytest.raises(ArrangementError, match="collide on a card 1U long"):
        check_pairs(set_get(top=[("left", 0.25, "N/-"), ("right", 0.75, "S/-")]), class_data=classes)


def test_unknown_bundled_arrangement():
    with pytest.raises(ArrangementError, match="no arrangement file or bundled arrangement"):
        check_pairs("nonexistent")


def test_missing_arrangement_file(tmp_path):
    with pytest.raises(ArrangementError, match="not found"):
        check_pairs(tmp_path / "missing.yaml")


@pytest.mark.parametrize("at", [float("inf"), float("nan")])
def test_rejects_non_finite_positions(at):
    with pytest.raises(ArrangementError, match="`at` must be a number"):
        check_pairs(set_get(top=[("left", at, "N/-")]))


def test_rejects_malformed_yaml(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("flip: [\n")
    with pytest.raises(ArrangementError, match="not valid YAML"):
        check_pairs(bad)


def test_reads_an_existing_file_whatever_its_extension(tmp_path):
    mine = tmp_path / "mine"
    mine.write_text("flip: top_bottom\n")
    assert check_pairs(mine).arrangement.name == "mine"


def test_rejects_max_length_below_a_minimum_card_length():
    with pytest.raises(ValueError, match="max_length 0"):
        check_pairs("example", max_length=0)
