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
# num/str, true/false, two colors, and + - * / < > <= >= == != and or.
FLIP_PAIRS = {"literal", "bool", "color", "operator"}


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
        if part.kind != "frame":
            continue
        path = out / f"{part.card_class}-{part.length}u.stl"
        export_stl(part.solid, str(path))
        found.append((part, trimesh.load_mesh(path)))
    return found


def test_one_frame_per_mentioned_class_and_length():
    parts = bases("example")
    # The example mentions simple_head, get and literal; every class is 2U at its shortest.
    expected = [(cls, n) for cls in ("simple_head", "get", "literal") for n in range(2, 7)]
    assert [(p.card_class, p.length) for p in parts if p.kind == "frame"] == expected


def test_a_core_and_faces_per_length_and_a_back_face_only_for_a_flip_pair():
    # literal is a flip pair; get isn't.
    shared = [(p.kind, p.card_class, p.length) for p in bases("example") if p.kind != "frame"]
    kinds = ("core", "front-face", "back-face")
    assert shared == [(kind, None, n) for n in range(2, 7) for kind in kinds]
    shared = [(p.kind, p.length) for p in bases("example", classes=["get"], max_length=3) if p.kind != "frame"]
    assert shared == [("core", 2), ("front-face", 2), ("core", 3), ("front-face", 3)]


def test_a_frame_carries_its_class_id_and_a_shared_part_none():
    parts = bases("example", max_length=2)
    assert [(p.kind, p.card_class, p.class_id) for p in parts] == [
        ("frame", "simple_head", 0),
        ("frame", "get", 1),
        ("frame", "literal", 8),
        ("core", None, None),
        ("front-face", None, None),
        ("back-face", None, None),
    ]
    # Building some classes alone keeps each one's usual ID.
    [frame] = [p for p in bases(FULL_SEARCH, classes=["color"], max_length=2) if p.kind == "frame"]
    assert (frame.card_class, frame.class_id) == ("color", 10)


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
    for part, mesh in full_frames:
        middle = (part.length * U / 2, U / 2)
        height = mesh.bounds[1][2] - mesh.bounds[0][2]
        assert mesh.bounds[0][2] == pytest.approx(0)
        # Within the card's outline, pads and all.
        assert list(mesh.bounds[:, :2].flatten()) == pytest.approx([0, 0, part.length * U, U])
        if part.card_class in FLIP_PAIRS:
            # Open front and back, for the core to slide into.
            assert height == pytest.approx(10)
            assert not mesh.contains([(*middle, 0.6)])[0]
        else:
            # The back, 1.2 mm thick, 0.2 mm (the sheet clearance) below the frame.
            assert height == pytest.approx(11.4)
            assert mesh.contains([(*middle, 0.6)])[0]


def test_classes_and_max_length_narrow_the_set():
    parts = bases("example", classes=["get", "on"], max_length=3)
    frames = [(p.card_class, p.length) for p in parts if p.kind == "frame"]
    assert frames == [("get", 2), ("get", 3), ("on", 2), ("on", 3)]


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


@pytest.fixture(scope="module")
def shared_parts(tmp_path_factory):
    """Every core and face from 2U to 6U, as (part, its mesh from the STL)."""
    out = tmp_path_factory.mktemp("shared")
    found = []
    for part in bases("example"):
        if part.kind == "frame":
            continue
        path = out / f"{part.kind}-{part.length}u.stl"
        export_stl(part.solid, str(path))
        found.append((part, trimesh.load_mesh(path)))
    return found


def test_every_core_and_face_is_watertight_and_ready_to_print(shared_parts):
    assert len(shared_parts) == 3 * 5
    leaky = [(p.kind, p.length) for p, mesh in shared_parts if not mesh.is_watertight]
    assert leaky == []
    for part, mesh in shared_parts:
        assert len(part.solid.solids()) == 1
        assert mesh.bounds[0][2] == pytest.approx(0)
        if part.kind == "core":
            assert mesh.bounds[1][2] == pytest.approx(10)
        else:
            # The 1.2 mm plate on the bed, under the legs.
            middle = (part.length * U / 2, U / 2)
            assert mesh.contains([(*middle, 0.6)])[0]
            assert not mesh.contains([(*middle, 1.8)])[0]
            assert mesh.bounds[1][2] > 1.2


def plate(tolerances, length=3, kind="front-face"):
    """A face plate's (length, width), at the bed, in mm."""
    parts = bases(ONE_POCKET, tolerances=tolerances, max_length=length)
    (face,) = [p for p in parts if p.kind == kind and p.length == length]
    box = face.solid.bounding_box()
    return round(box.size.X, 6), round(box.size.Y, 6)


def test_a_3u_face_plate_is_inset_by_the_sheet_clearance():
    assert plate(Tolerances()) == (89.6, 29.6)
    assert plate(Tolerances(), kind="back-face") == (89.6, 29.6)
    assert plate(Tolerances(sheet_clearance=0.3)) == (89.4, 29.4)
    assert plate(Tolerances(sheet_clearance=0)) == (90, 30)


def solid_at(part, *point):
    """Whether this point, in the card's axes, is inside the part where it sits in the card."""
    return (part.placement * part.solid).is_inside(Vector(*point))


@pytest.mark.parametrize("length, rib", [(2, False), (3, False), (4, True), (6, True)])
def test_cores_from_4u_have_a_centre_rib(length, rib):
    parts = bases(ONE_POCKET, classes=["get"], max_length=length)
    (core,) = [p for p in parts if p.kind == "core" and p.length == length]
    (frame,) = [p for p in parts if p.kind == "frame" and p.length == length]
    middle = (length * U / 2, U / 2)
    assert solid_at(core, *middle, 5) == rib
    # The pads under the core of a single-sided frame follow it.
    assert solid_at(frame, *middle, -0.1) == rib


def card(parts, card_class, length):
    """{kind: part} of one card's base."""
    found = {p.kind: p for p in parts if p.length == length and p.card_class in (card_class, None)}
    if card_class not in FLIP_PAIRS:
        found.pop("back-face", None)
    return found


def overlap(a, b):
    """The volume, in mm³, that two parts share where they sit in the card."""
    shared = (a.placement * a.solid) & (b.placement * b.solid)
    return sum(s.volume for s in shared.solids()) if shared else 0


# The hook's tip reaches 1.4 mm back from the leg, through a window in the
# 2 mm cross-bar 10 mm from each end: at x = 11 it is in the window.
FRONT_HOOK, BACK_HOOK, IN_WINDOW = 4.5, 5.5, 11


@pytest.mark.parametrize("length", [2, 3, 4])
@pytest.mark.parametrize("card_class", ["literal", "color", "get"])  # double- and single-sided
def test_assembled_parts_fit_without_overlap_and_hook_through_the_windows(card_class, length):
    # Over the ID beam too: color's is 01010, get's 00001.
    parts = card(bases(FULL_SEARCH, classes=[card_class], max_length=length), card_class, length)
    kinds = list(parts)
    pairs = [(a, b) for i, a in enumerate(kinds) for b in kinds[i + 1 :]]
    assert [(a, b) for a, b in pairs if overlap(parts[a], parts[b]) > 1e-6] == []
    length_mm = length * U
    # The front face's two legs at each end, and the back face's one, in the
    # back face or in a single-sided frame.
    back = parts.get("back-face", parts["frame"])
    for x in (IN_WINDOW, length_mm - IN_WINDOW):
        assert solid_at(parts["front-face"], x, 9, FRONT_HOOK)
        assert solid_at(parts["front-face"], x, 21, FRONT_HOOK)
        assert solid_at(back, x, 15, BACK_HOOK)
        assert solid_at(parts["core"], x, 3, FRONT_HOOK)  # the cross-bar, around the windows


def first(inside, start, stop):
    """The first of start, start + 0.01, … up to stop, to 0.01 mm, where `inside` holds."""
    return next(round(v / 100, 2) for v in range(round(start * 100), round(stop * 100)) if inside(v / 100 + 0.005))


def fits(tolerances):
    """In ONE_POCKET's 3U card, in mm: across the bottom edge at x = 45 and
    z = 5, where the frame ends and the core starts; across the near-end
    cross-bar at the front face's leg (y = 9), where its window starts and
    ends; and up the middle, where the frame ends and the front face's plate
    starts."""
    parts = {p.kind: p for p in bases(ONE_POCKET, tolerances=tolerances, max_length=3) if p.length == 3}
    frame, core, face = parts["frame"], parts["core"], parts["front-face"]

    def window(y):
        return not solid_at(core, IN_WINDOW, y, FRONT_HOOK)

    return {
        "core": (
            first(lambda y: not solid_at(frame, 45, y, 5), 0, 5),
            first(lambda y: solid_at(core, 45, y, 5), 0, 5),
        ),
        "window": (first(window, 4, 12), first(lambda y: not window(y), 7, 12)),
        "plate": (
            first(lambda z: not solid_at(frame, 45, 0.1, z), 9, 12),
            first(lambda z: solid_at(face, 45, 0.5, z), 9, 12),
        ),
    }


@pytest.mark.parametrize(
    "tolerances, core, window, plate",
    [
        # The frame wall's 2.2 mm, then 0.2 mm to the core; a 4.4 mm window for the 4 mm leg.
        (Tolerances(), (2.2, 2.4), (6.8, 11.2), (10, 10.2)),
        # A looser slide thins the frame wall, so the core stays put.
        (Tolerances(slide_clearance=0.3), (2.1, 2.4), (6.7, 11.3), (10, 10.2)),
        (Tolerances(slide_clearance=0), (2.4, 2.4), (7.0, 11.0), (10, 10.2)),
        (Tolerances(sheet_clearance=0.4), (2.2, 2.4), (6.8, 11.2), (10, 10.4)),
    ],
)
def test_slide_and_sheet_clearances_set_the_fits_but_never_move_a_bore(tolerances, core, window, plate):
    assert fits(tolerances) == {"core": core, "window": window, "plate": plate}
    assert [b[:2] for b in bores(tolerances)] == [(15, 2.5), (15, 7.5)]


# The ID beam: 3.2 mm along the card at x = 20, 2 mm thick, its marks 1 mm
# tall on top. With the default tolerances the marks span y = 4.6 to 25.4:
# a baseline 0.8 mm wide along the beam's left-end edge, and 6 cross ridges
# that leave 5 cells 2.4 mm along by 3.2 mm across, bit 1's nearest the top edge.
BEAM_X, IN_BEAM, IN_MARKS = 20, 1, 2.5
ON_BASELINE = 18.8  # along the card: the baseline's middle, from the beam's 18.4 start
CELL_MID_X = 20.4  # a cell's middle, along the card: past the baseline
CELL_MID_Y = (23, 19, 15, 11, 7)  # each cell's middle, bit 1 first


@pytest.mark.parametrize("length", [2, 4])
def test_every_frame_has_an_id_beam_and_cores_and_faces_none(length):
    parts = [p for p in bases(FULL_SEARCH, classes=["get", "color"], max_length=length) if p.length == length]
    for part in parts:
        assert solid_at(part, BEAM_X, U / 2, IN_BEAM) == (part.kind == "frame"), part.kind


def read_beam(frame):
    """The frame's beam as read: a 1 for each cell with a stroke through its middle."""
    return "".join("1" if solid_at(frame, CELL_MID_X, y, IN_MARKS) else "0" for y in CELL_MID_Y)


@pytest.mark.parametrize("length", [2, 4])
@pytest.mark.parametrize("card_class, bits", [("get", "00001"), ("color", "01010")])
def test_a_frames_beam_reads_back_its_class_id(card_class, bits, length):
    (frame,) = [p for p in bases(FULL_SEARCH, classes=[card_class], max_length=length) if p.kind == "frame" and p.length == length]
    assert read_beam(frame) == bits
    # Every cell is walled in, so an empty one still reads as a 0: the baseline
    # along its left-end edge, and a cross ridge either side.
    for y in CELL_MID_Y:
        assert solid_at(frame, ON_BASELINE, y, IN_MARKS)
        assert solid_at(frame, CELL_MID_X, y + 2, IN_MARKS)
        assert solid_at(frame, CELL_MID_X, y - 2, IN_MARKS)
    # Nothing past the marks, a slide gap clear of the core's inner walls at 4.4 and 25.6.
    assert not solid_at(frame, CELL_MID_X, 4.5, IN_MARKS)
    assert not solid_at(frame, CELL_MID_X, 25.5, IN_MARKS)


def test_a_beam_stroke_is_a_slash_as_read():
    # Read with the left end toward you, so left is +y: a / runs from the
    # cell's near left corner to its far right one.
    (frame, *_) = bases(FULL_SEARCH, classes=["get"], max_length=2)
    near, far = 19.5, 21.3
    assert solid_at(frame, near, 7 + 1.2, IN_MARKS) and solid_at(frame, far, 7 - 1.2, IN_MARKS)
    assert not solid_at(frame, near, 7 - 1.2, IN_MARKS) and not solid_at(frame, far, 7 + 1.2, IN_MARKS)


@pytest.mark.parametrize("length", [2, 4])
def test_a_core_has_a_notch_over_the_beam_at_both_ends(length):
    (core,) = [p for p in bases(FULL_SEARCH, classes=["get"], max_length=length) if p.kind == "core" and p.length == length]
    # Its long walls are 2 mm thick, at y = 2.4 to 4.4 and 25.6 to 27.6.
    for x in (BEAM_X, length * U - BEAM_X):
        for y in (3.4, 26.6):
            assert not solid_at(core, x, y, 1)
            assert solid_at(core, x, y, 2.5)  # above the notch
            assert solid_at(core, x - 2.5, y, 1)  # beside it
            assert solid_at(core, x + 2.5, y, 1)


def test_a_single_sided_frames_beam_is_joined_to_its_back():
    (frame, *_) = bases(FULL_SEARCH, classes=["get"], max_length=2)
    # Through the 0.2 mm sheet gap between the frame and its back.
    assert solid_at(frame, BEAM_X, U / 2, -0.1)
    assert not solid_at(frame, BEAM_X + 3, U / 2, -0.1)


def beam_fits(tolerances):
    """In get's 2U card, in mm: the beam's ends along the card, at the
    middle; its top; the core's notch's ends along the card and its top, in
    the near long wall; and where the marks start across the card, along
    the baseline, and where the core's inner wall ends."""
    parts = {p.kind: p for p in bases(FULL_SEARCH, classes=["get"], max_length=2, tolerances=tolerances)}
    frame, core = parts["frame"], parts["core"]
    in_wall = 3.4
    return {
        "beam": (
            first(lambda x: solid_at(frame, x, U / 2, IN_BEAM), 15, 25),
            first(lambda x: not solid_at(frame, x, U / 2, IN_BEAM), 19, 25),
            first(lambda z: not solid_at(frame, CELL_MID_X, CELL_MID_Y[2], z), 0, 5),  # in an empty cell
        ),
        "notch": (
            first(lambda x: not solid_at(core, x, in_wall, IN_BEAM), 15, 25),
            first(lambda x: solid_at(core, x, in_wall, IN_BEAM), 19, 25),
            first(lambda z: solid_at(core, BEAM_X, in_wall, z), 0, 5),
        ),
        "marks": (
            first(lambda y: solid_at(frame, ON_BASELINE, y, IN_MARKS), 3, 10),
            first(lambda y: not solid_at(core, 30, y, 5), 2.5, 10),
        ),
    }


@pytest.mark.parametrize(
    "tolerances, notch, marks",
    [
        # The beam's 3.2 by 2 mm, and 0.2 mm all round it; the marks 0.2 mm from the core.
        (Tolerances(), (18.2, 21.8, 2.2), (4.6, 4.4)),
        (Tolerances(slide_clearance=0.3), (18.1, 21.9, 2.3), (4.7, 4.4)),
        (Tolerances(slide_clearance=0), (18.4, 21.6, 2.0), (4.4, 4.4)),
    ],
)
def test_slide_clearance_sets_the_notch_and_the_marks_gap_but_never_moves_the_beam(tolerances, notch, marks):
    assert beam_fits(tolerances) == {"beam": (18.4, 21.6, 2.0), "notch": notch, "marks": marks}
    assert [b[:2] for b in bores(tolerances)] == [(15, 2.5), (15, 7.5)]
