"""Printable frames from an arrangement, through `magnets.bases`."""

from fractions import Fraction
from pathlib import Path

import pytest
import trimesh
import yaml
from build123d import GeomType, Vector, export_stl

from helpers import arrangement
from magnets import Tolerances, bases

FULL_SEARCH = Path(__file__).parent / "fixtures" / "full_search.yaml"
U = 30
# Every position in a 1U cell, in mm; and the layers' centres through the 10 mm frame.
CELL = (5, 15, 25)
LAYERS = {"up": 7.5, "down": 2.5}
# Inside a bore, if there is one: past the 0.6 mm skin.
IN_BORE = 1.0


def magnets_at(pockets, length):
    """{(edge, mm along it, layer)} of every magnet in a front's YAML: along
    from the left end on top/bottom, and up from the bottom (y) on left/right."""
    found = set()
    for edge, listed in pockets.items():
        for p in listed:
            at = Fraction(p["at"]) * U
            if edge in ("top", "bottom"):
                along = at if p.get("from", "left") == "left" else length * U - at
            else:
                along = U - at
            up, down = p["layers"].split("/")
            found |= {(edge, float(along), layer) for layer, pole in (("up", up), ("down", down)) if pole != "-"}
    return found


def every_place(length):
    """(edge, mm along, layer) of every position on every edge, in both layers."""
    along = {"top": [c * U + x for c in range(length) for x in CELL], "left": CELL}
    along["bottom"], along["right"] = along["top"], along["left"]
    return [(edge, float(a), layer) for edge, xs in along.items() for a in xs for layer in LAYERS]


def probe(edge, along, depth, length):
    """A point `depth` mm in from the outside of an edge, at `along`, in the frame's (x, y)."""
    return {
        "top": (along, U - depth),
        "bottom": (along, depth),
        "left": (depth, along),
        "right": (length * U - depth, along),
    }[edge]


@pytest.fixture(scope="module")
def full_frames(tmp_path_factory):
    """Every frame of the full search, as (part, its mesh from the STL)."""
    out = tmp_path_factory.mktemp("frames")
    found = []
    for part in bases(FULL_SEARCH):
        path = out / f"{part.card_class}-{part.length}u.stl"
        export_stl(part.solid, str(path))
        found.append((part, trimesh.load_mesh(path)))
    return found


def test_one_frame_per_mentioned_class_and_length():
    parts = bases("example")
    # The example mentions simple_head, get and literal; every class is 2U at its shortest.
    expected = [(cls, n) for cls in ("simple_head", "get", "literal") for n in range(2, 7)]
    assert [(p.card_class, p.length) for p in parts] == expected
    assert {p.kind for p in parts} == {"frame"}


def test_every_frame_of_the_full_search_is_watertight(full_frames):
    assert len(full_frames) == 23 * 5
    leaky = [(p.card_class, p.length) for p, mesh in full_frames if not mesh.is_watertight]
    assert leaky == []
    assert all(len(p.solid.solids()) == 1 for p, _ in full_frames)


def test_a_bore_exactly_where_the_arrangement_has_a_magnet(full_frames):
    fronts = yaml.safe_load(FULL_SEARCH.read_text())["classes"]
    wrong = []
    for part, mesh in full_frames:
        expected = magnets_at(fronts[part.card_class], part.length)
        # A single-sided frame sits on its back, so its frame starts above z = 0.
        z0 = mesh.bounds[1][2] - 10
        places = every_place(part.length)
        bored = [(*probe(e, a, IN_BORE, part.length), z0 + LAYERS[layer]) for e, a, layer in places]
        skin = [(*probe(e, a, 0.3, part.length), z0 + LAYERS[layer]) for e, a, layer in places]
        solid, skin_solid = mesh.contains(bored), mesh.contains(skin)
        for place, is_solid, has_skin in zip(places, solid, skin_solid):
            if is_solid == (place in expected) or not has_skin:
                wrong.append((part.card_class, part.length, place))
    assert wrong == []


# A flip pair, so its frame lies with its frame at z = 0: a uniform pocket on the bottom edge.
ONE_POCKET = arrangement(literal={"bottom": [("left", "1/2", "N/N")]})


def bores(tolerances):
    """(x, z, diameter, nearest y) of each bore of ONE_POCKET's 2U frame, by the bounding box of its cylinder."""
    (part, *_) = bases(ONE_POCKET, tolerances=tolerances)
    boxes = [f.bounding_box() for f in part.solid.faces().filter_by(GeomType.CYLINDER)]
    return sorted(
        (round(b.center().X, 6), round(b.center().Z, 6), round(b.size.X, 6), round(b.min.Y, 6)) for b in boxes
    )


def wall(tolerances):
    """How far in from the bottom edge the frame is solid, where there is no bore, to 0.01 mm."""
    (part, *_) = bases(ONE_POCKET, tolerances=tolerances)
    depth = 0.0
    while part.solid.is_inside(Vector(45, depth + 0.005, 5)):
        depth += 0.01
    return round(depth, 2)


def test_default_tolerances_give_the_blueprints_wall_and_bore():
    # One bore per layer, 3.4 mm wide, from the 0.6 mm skin; the wall is 2.2 mm.
    assert bores(Tolerances()) == [(15, 2.5, 3.4, 0.6), (15, 7.5, 3.4, 0.6)]
    assert wall(Tolerances()) == 2.2


@pytest.mark.parametrize(
    "tolerances, diameter, frame_wall",
    [
        (Tolerances(magnet_clearance=0.4), 3.8, 2.2),
        (Tolerances(magnet_clearance=0), 3.0, 2.2),
        (Tolerances(magnet_depth_clearance=0.5), 3.4, 2.4),  # what the reference was drawn with
        (Tolerances(magnet_depth_clearance=0.1, magnet_clearance=0.3), 3.6, 2.0),
    ],
)
def test_magnet_tolerances_resize_bores_but_never_move_them(tolerances, diameter, frame_wall):
    assert bores(tolerances) == [(15, 2.5, diameter, 0.6), (15, 7.5, diameter, 0.6)]
    assert wall(tolerances) == frame_wall


def test_flip_pairs_get_double_sided_frames_and_others_a_built_in_back(full_frames):
    # num/str, true/false, two colors, and + - * / < > <= >= == != and or.
    flip_pairs = {"literal", "bool", "color", "operator"}
    for part, mesh in full_frames:
        middle = (part.length * U / 2, U / 2)
        height = mesh.bounds[1][2] - mesh.bounds[0][2]
        assert mesh.bounds[0][2] == pytest.approx(0)
        if part.card_class in flip_pairs:
            # Open front and back, for the core to slide into.
            assert height == pytest.approx(10)
            assert not mesh.contains([(*middle, 0.6)])[0]
        else:
            # The back, 1.2 mm thick, 0.2 mm (the sheet clearance) below the frame.
            assert height == pytest.approx(11.4)
            assert mesh.contains([(*middle, 0.6)])[0]


def test_classes_and_max_length_narrow_the_set():
    parts = bases("example", classes=["get", "on"], max_length=3)
    assert [(p.card_class, p.length) for p in parts] == [("get", 2), ("get", 3), ("on", 2), ("on", 3)]


def test_an_unknown_class_or_too_short_max_length_is_an_error():
    with pytest.raises(ValueError, match="unknown card class.*nope"):
        bases("example", classes=["nope"])
    with pytest.raises(ValueError, match="no card classes given"):
        bases("example", classes=[])
    with pytest.raises(ValueError, match="max_length 1"):
        bases("example", max_length=1)


@pytest.mark.parametrize(
    "bad, message",
    [
        ({"magnet_clearance": -0.1}, "magnet_clearance must be 0 or more"),
        ({"sheet_clearance": float("nan")}, "sheet_clearance must be 0 or more"),
        ({"slide_clearance": 1.8}, "leaves no bore"),
        ({"magnet_clearance": 1.0}, "between a pocket's layers"),
        ({"magnet_depth_clearance": 1.5}, "at a corner"),
    ],
)
def test_a_tolerance_that_is_negative_or_leaves_no_wall_is_an_error(bad, message):
    with pytest.raises(ValueError, match=message):
        Tolerances(**bad)


def test_zero_tolerances_still_build_a_watertight_frame(tmp_path):
    zero = Tolerances(slide_clearance=0, sheet_clearance=0, magnet_clearance=0, magnet_depth_clearance=0)
    (part, *_) = bases(FULL_SEARCH, tolerances=zero, classes=["get"], max_length=2)
    export_stl(part.solid, str(tmp_path / "get.stl"))
    assert trimesh.load_mesh(tmp_path / "get.stl").is_watertight
