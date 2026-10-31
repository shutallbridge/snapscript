"""The assembly page, through `magnets.assembly_page`: which pockets of each
frame get a magnet, on which layer, with which pole facing out, wall by wall."""

from fractions import Fraction as F
from importlib import resources
from pathlib import Path

import pytest
import yaml

from magnets import assembly_page

FULL_SEARCH = Path(__file__).parent / "fixtures" / "full_search.yaml"
EXAMPLE = resources.files("magnets") / "data" / "arrangements" / "example.yaml"

E = "-"  # an empty layer


def frame(page, card_class, length):
    return next(f for f in page.frames if (f.card_class, f.length) == (card_class, length))


def filled(wall):
    """(at, up, down) of each position on a wall that has a pocket, in the wall's order."""
    return [(p.at, p.up, p.down) for p in wall if p.pocket]


def test_the_example_get_frame_wall_by_wall():
    get = frame(assembly_page("example"), "get", 2)
    assert (get.class_id, get.flip_pair, get.magnets) == (1, False, 4)
    assert list(get.walls) == ["left", "top", "right", "bottom"]
    # top: S/N 1/6 U from the left end; bottom: N/S 1/6 U from the left end.
    assert filled(get.walls["top"]) == [(F(1, 6), "S", "N")]
    assert filled(get.walls["bottom"]) == [(F(1, 6), "N", "S")]
    assert filled(get.walls["left"]) == filled(get.walls["right"]) == []
    # Every position is listed: three per U on top and bottom, three on each end.
    assert [len(get.walls[edge]) for edge in get.walls] == [3, 6, 3, 6]


def test_each_wall_runs_in_order_from_inside_the_ring():
    # Two pockets on each edge of a 3U get frame, one nearer each end.
    near_ends = [{"from": "left", "at": "1/6", "layers": "N/N"}, {"from": "right", "at": "1/2", "layers": "S/S"}]
    heights = [{"at": "1/6", "layers": "N/N"}, {"at": "5/6", "layers": "S/S"}]
    edges = {"top": near_ends, "bottom": near_ends, "left": heights, "right": heights}
    walls = frame(assembly_page({"flip": "top_bottom", "classes": {"get": edges}}, max_length=3), "get", 3).walls
    # Left end: bottom edge -> top edge; top edge: left end -> right end;
    # right end: top edge -> bottom edge; bottom edge: right end -> left end.
    assert [at for at, *_ in filled(walls["left"])] == [F(5, 6), F(1, 6)]
    assert [at for at, *_ in filled(walls["top"])] == [F(1, 6), F(5, 2)]
    assert [at for at, *_ in filled(walls["right"])] == [F(1, 6), F(5, 6)]
    assert [at for at, *_ in filled(walls["bottom"])] == [F(5, 2), F(1, 6)]
    # `along` counts from the wall's left end as seen from inside, in the same order.
    for wall in walls.values():
        assert [p.along for p in wall] == sorted(p.along for p in wall)
    assert [p.along for p in walls["left"] if p.pocket] == [F(1, 6), F(5, 6)]
    assert [p.along for p in walls["bottom"] if p.pocket] == [F(1, 2), F(17, 6)]


def pockets_in(raw, card_class, length):
    """{(edge, U from the left end or top edge): (up, down)} of every pocket of a class in an arrangement's YAML."""
    found = {}
    for edge, listed in raw["classes"].get(card_class, {}).items():
        for p in listed:
            at = F(p["at"])
            if p.get("from") == "right":
                at = length - at
            found[edge, at] = tuple(p["layers"].split("/"))
    return found


@pytest.mark.parametrize("source", [EXAMPLE, FULL_SEARCH], ids=["example", "full_search"])
def test_every_wall_matches_the_arrangement(source):
    raw = yaml.safe_load(source.read_text(encoding="utf-8"))
    page = assembly_page(source if isinstance(source, Path) else "example")
    assert {f.card_class for f in page.frames} == set(raw["classes"])
    shapes = set()
    for f in page.frames:
        shown = {(edge, p.at): (p.up, p.down) for edge, wall in f.walls.items() for p in wall if p.pocket}
        assert shown == pockets_in(raw, f.card_class, f.length), (f.card_class, f.length)
        assert f.magnets == sum((up != E) + (down != E) for up, down in shown.values())
        for p in (p for wall in f.walls.values() for p in wall):
            shapes.add("empty" if not p.pocket else "half" if E in (p.up, p.down) else "uniform" if p.up == p.down else "split")
    # The full search has half pockets (-/N) and split ones (S/N); the example uniform and split.
    assert shapes >= ({"empty", "uniform", "split"} if source == EXAMPLE else {"empty", "half", "split"})


def test_each_magnet_faces_in_with_the_pole_opposite_the_one_facing_out():
    for f in assembly_page(FULL_SEARCH).frames:
        for p in (p for wall in f.walls.values() for p in wall):
            assert {(p.up, p.up_in), (p.down, p.down_in)} <= {("N", "S"), ("S", "N"), (E, E)}


def test_classes_and_max_length_limit_the_frames_as_they_limit_bases():
    # The frames `magnets bases example --classes get,on --max-length 3` writes.
    page = assembly_page("example", classes=["get", "on"], max_length=3)
    assert [(f.card_class, f.length) for f in page.frames] == [("get", 2), ("get", 3), ("on", 2), ("on", 3)]
    # By default, every class the arrangement names, up to 6U.
    assert [(f.card_class, f.length) for f in assembly_page("example").frames] == [
        (cls, n) for cls in ("simple_head", "get", "literal") for n in range(2, 7)
    ]
    # The page still knows every class, built or not.
    assert len(page.classes) == 23
    assert (page.classes["literal"].id, page.classes["literal"].min_length) == (8, 2)


@pytest.mark.parametrize(
    "options, message",
    [
        ({"classes": ["nope"]}, "unknown card class"),
        ({"classes": []}, "no card classes given"),
        ({"max_length": 1}, "max_length 1 is shorter"),
    ],
)
def test_bad_classes_or_max_length_raise_as_for_bases(options, message):
    with pytest.raises(ValueError, match=message):
        assembly_page("example", **options)


def test_the_page_is_one_self_contained_file():
    page = assembly_page("example")
    assert page.html.startswith("<!doctype html>")
    # No scripts, styles, fonts or requests from anywhere else.
    for outside in ("<script src", "<link", "@import", "url(http", "http://", "https://", "fetch("):
        assert outside not in page.html
    assert '"class": "literal"' in page.html
    assert "/*DATA*/" not in page.html
