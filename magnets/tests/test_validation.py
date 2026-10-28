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
        # The old quarter positions are off the grid too.
        (set_get(top=[("left", 0.25, "N/-")]), "off the grid"),
        (set_get(left=[(0.75, "N/-")]), "1/6, 1/2 or 5/6"),
        # set_get is 2U at its shortest, but its pockets reach only 1U from an end.
        (set_get(top=[("left", "7/6", "N/-")]), "beyond its pocket reach 1U"),
        (set_get(top=[("left", "-1/6", "N/-")]), "beyond its pocket reach 1U"),
        (set_get(top=[("middle", "1/6", "N/-")]), "`from` must be left or right"),
        (set_get(top=[("left", "a", "N/-")]), "`at` must be a number"),
        (set_get(top=[("left", "1/0", "N/-")]), "`at` must be a number"),
        # At most 2 pockets on top/bottom edges.
        (
            set_get(bottom=[("left", "1/6", "N/-"), ("left", "1/2", "N/-"), ("left", "5/6", "N/-")]),
            "at most 2",
        ),
        # Left/right heights.
        (set_get(left=[(0.3, "N/-")]), "1/6, 1/2 or 5/6"),
        (set_get(right=[(1, "N/-")]), "1/6, 1/2 or 5/6"),
        # No two pockets at the same position.
        (set_get(top=[("left", "1/6", "N/-"), ("left", "1/6", "S/-")]), "same position"),
        (set_get(left=[("1/2", "N/-"), ("1/2", "S/-")]), "same position"),
        # from: left 1/6 and from: right 11/6 meet on a 2U block head.
        (
            arrangement(block_head={"bottom": [("left", "1/6", "N/-"), ("right", "11/6", "S/-")]}),
            "collide on a card 2U long",
        ),
        # Layers.
        (set_get(top=[("left", "1/6", "X/-")]), "layers 'X/-'"),
        (set_get(top=[("left", "1/6", "N")]), "layers 'N'"),
        (set_get(top=[("left", "1/6", "N/S/N")]), "layers 'N/S/N'"),
        # Pockets hold magnets only: there is no `F` layer.
        (set_get(top=[("left", "1/6", "F/-")]), "each layer one of N S -"),
        (set_get(top=[("left", "1/6", "N/F")]), "each layer one of N S -"),
        (set_get(top=[("left", "1/6", "-/-")]), "-/- is no pocket"),
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
    # 1/6 + 1/2 = 2/3 is not a card length.
    check_pairs(set_get(top=[("left", "1/6", "N/-"), ("right", "1/2", "S/-")]))


def test_pockets_meeting_below_the_shortest_length_do_not_collide():
    # from: left 1/6 and from: right 5/6 meet on a 1U card, but set_get is 2U at its shortest.
    check_pairs(set_get(top=[("left", "1/6", "N/-"), ("right", "5/6", "S/-")]))


def test_a_class_set_back_to_1u_checks_its_collisions_at_1u():
    classes = pair_classes()
    classes["set_get"]["min_length"] = 1
    with pytest.raises(ArrangementError, match="collide on a card 1U long"):
        check_pairs(set_get(top=[("left", "1/6", "N/-"), ("right", "5/6", "S/-")]), class_data=classes)


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


def test_an_off_grid_top_or_bottom_pocket_is_told_the_positions_in_each_u():
    with pytest.raises(ArrangementError) as err:
        check_pairs(set_get(top=[("left", 0.3, "N/-")]))
    assert "1/6, 1/2 or 5/6 of each U" in str(err.value)


@pytest.mark.parametrize(
    "pocket, message",
    [
        # Positions are told as exact fractions, never as 0.333....
        (("left", "1/3", "N/-"), "at 1/3 is off the grid"),
        (("left", "13/6", "N/-"), "at 13/6 is beyond its pocket reach 1U"),
    ],
)
def test_positions_are_told_as_exact_fractions(pocket, message):
    with pytest.raises(ArrangementError) as err:
        check_pairs(set_get(top=[pocket]))
    assert message in str(err.value)


def test_a_collision_names_both_pockets_as_exact_fractions():
    # 5/6 from the left and 7/6 from the right meet on a 2U card.
    with pytest.raises(ArrangementError) as err:
        check_pairs(arrangement(block_head={"bottom": [("left", "5/6", "N/-"), ("right", "7/6", "S/-")]}))
    assert "{from: left, at: 5/6} and {from: right, at: 7/6} collide on a card 2U long" in str(err.value)
