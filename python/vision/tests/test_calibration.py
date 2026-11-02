"""Calibration (#132, #172): three steps, each a command over the table-state socket with a result back.

1. Clear the table: the service says which 12 markers the projector should draw, and where. Once they're shown, it
   fits the line-up from their centres plus one lens term, at auto exposure.
2. The ruler page: the camera's exposure is fixed from the page's paper, and the real size from its two markers.
3. Save the new line-up, or keep the old one.
"""

import json

from calibration_harness import (ASPECT, CALIBRATION, MM_PER_PH, ROOM, RULER_MM, Service, World, card_at)
from vision_harness import Card, write_lineup

OLD_MM_PER_PH = 270.0   # the old line-up's size: 8% off the drawn projector's true 250


def old_lineup(d):
    """An old line-up: it maps the drawn camera to the projector as if the lens were straight, and says the wrong
    size (8% too big)."""
    p = write_lineup(d, mm_per_ph=MM_PER_PH)
    lineup = json.loads(p.read_text())
    lineup["mm_per_projector_height"] = OLD_MM_PER_PH
    p.write_text(json.dumps(lineup))
    return p


def show(world, markers):
    """The table app draws the markers step 1 asked for."""
    world.set(shows=[{k: m[k] for k in ("marker", "x", "y", "size")} for m in markers])


def through_step_2(svc, world, ruler=(190.0, 120.0, 1.0)):
    step1 = svc.calibrate("clear", aspect=ASPECT)
    show(world, step1["markers"])
    fit = svc.calibrate("shown")
    world.set(shows=[], ruler={"x": ruler[0], "y": ruler[1], "angle": ruler[2], "mm": RULER_MM})
    size = svc.calibrate("ruler")
    world.set(ruler=None)
    return step1, fit, size


def test_step_1_says_which_markers_to_project_and_where(tmp_path):
    world = World(tmp_path)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        res = svc.calibrate("clear", aspect=ASPECT)

    assert res["ok"] is True
    assert sorted(m["marker"] for m in res["markers"]) == CALIBRATION
    for m in res["markers"]:  # inside the projector's picture, in projector heights, with room for the white
        half = m["size"] * res["white"] / 2
        assert half <= m["x"] <= ASPECT - half and half <= m["y"] <= 1 - half, m
    xs, ys = sorted({m["x"] for m in res["markers"]}), sorted({m["y"] for m in res["markers"]})
    assert xs[-1] - xs[0] > 0.7 * ASPECT and ys[-1] - ys[0] > 0.7  # spread out to the table's edges


def test_once_shown_the_markers_are_fitted_with_one_lens_term(tmp_path):
    world = World(tmp_path, k1=0.04)  # a lens that bends the picture's corners by several mm
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        show(world, svc.calibrate("clear", aspect=ASPECT)["markers"])
        res = svc.calibrate("shown")

    assert res["ok"] is True
    assert (res["seen"], res["of"]) == (12, 12)
    assert res["error_mm"]["max"] <= 0.5
    assert abs(res["k1"] - 0.04) <= 0.005


def test_step_1_fails_when_the_markers_arent_seen(tmp_path):
    world = World(tmp_path)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        svc.calibrate("clear", aspect=ASPECT)
        res = svc.calibrate("shown")  # the projector didn't show them

    assert res["ok"] is False
    assert res["seen"] == 0 and "0 of the 12" in res["why"]


def test_shown_before_clear_is_refused(tmp_path):
    world = World(tmp_path)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        res = svc.calibrate("shown")

    assert res["ok"] is False and "step 1" in res["why"]


def test_the_ruler_page_gives_the_real_size_and_fixes_the_exposure_from_its_paper(tmp_path):
    world = World(tmp_path, k1=0.04)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        _, _, res = through_step_2(svc, world)

    assert res["ok"] is True
    assert abs(res["mm_per_projector_height"] - MM_PER_PH) <= 0.5
    # the drawn room: paper gives back 0.94 of ROOM grey per ms, so 150 grey wants about 31.9 ms at gain 1
    ex = res["exposure"]
    assert abs(ex["ms"] * ex["gain"] - 150 / (0.94 * ROOM)) <= 3.0
    assert abs(res["paper"] - 150) <= 12


def test_a_dim_room_gets_a_longer_exposure(tmp_path):
    world = World(tmp_path)
    world.set(room=ROOM / 2)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        _, _, res = through_step_2(svc, world)

    ex = res["exposure"]
    assert abs(ex["ms"] * ex["gain"] - 150 / (0.94 * ROOM / 2)) <= 6.0


def test_the_ruler_step_fails_without_the_page(tmp_path):
    world = World(tmp_path)
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        show(world, svc.calibrate("clear", aspect=ASPECT)["markers"])
        svc.calibrate("shown")
        world.set(shows=[])
        res = svc.calibrate("ruler")

    assert res["ok"] is False and "ruler page" in res["why"]


# A 2U card near the picture's corner, where the lens bends most, clear of the ruler page: (marker, x, y) in true
# table mm.
CORNER_CARD = (19, 330.0, 248.0)


def lay(world, card):
    marker, x, y = card
    world.set(cards=[{"marker": marker, "x": x, "y": y, "angle": 0}])


def test_after_step_2_table_states_use_the_new_line_up_for_the_check(tmp_path):
    world = World(tmp_path, k1=0.04)
    marker, x, y = CORNER_CARD
    with Service(tmp_path, f"world:{world.path}", old_lineup(tmp_path)) as svc:
        lay(world, CORNER_CARD)  # it stays: it isn't a calibration marker, and it's clear of the ruler page
        before = card_at(svc.state_with(lambda m: card_at(m, marker)), marker)
        through_step_2(svc, world)
        after = svc.state_with(lambda m: m["mm_per_projector_height"] != OLD_MM_PER_PH and card_at(m, marker))

    assert abs(before["x"] - x) > 5  # the old line-up is well off here
    c = card_at(after, marker)
    assert abs(c["x"] - x) <= 0.7 and abs(c["y"] - y) <= 0.7
    assert abs(after["mm_per_projector_height"] - MM_PER_PH) <= 0.5


def test_a_saved_line_up_survives_a_restart(tmp_path):
    world = World(tmp_path, k1=0.04)
    lineup = old_lineup(tmp_path)
    marker, x, y = CORNER_CARD
    with Service(tmp_path, f"world:{world.path}", lineup) as svc:
        through_step_2(svc, world)
        saved = svc.calibrate("save")
    assert saved["ok"] is True

    lay(world, CORNER_CARD)
    with Service(tmp_path, f"world:{world.path}", lineup) as svc:
        state = svc.state_with(lambda m: card_at(m, marker))

    c = card_at(state, marker)
    assert abs(c["x"] - x) <= 0.7 and abs(c["y"] - y) <= 0.7
    assert abs(state["mm_per_projector_height"] - MM_PER_PH) <= 0.5


def test_keep_leaves_the_old_line_up_untouched(tmp_path):
    world = World(tmp_path, k1=0.04)
    lineup = old_lineup(tmp_path)
    old = lineup.read_bytes()
    marker = CORNER_CARD[0]
    with Service(tmp_path, f"world:{world.path}", lineup) as svc:
        lay(world, CORNER_CARD)
        before = card_at(svc.state_with(lambda m: card_at(m, marker)), marker)
        through_step_2(svc, world)
        kept = svc.calibrate("keep")
        back = svc.state_with(lambda m: m["mm_per_projector_height"] == OLD_MM_PER_PH and card_at(m, marker))

    assert kept["ok"] is True
    assert lineup.read_bytes() == old
    c = card_at(back, marker)
    assert abs(c["x"] - before["x"]) <= 0.5 and abs(c["y"] - before["y"]) <= 0.5

    with Service(tmp_path, f"world:{world.path}", lineup) as svc:  # and a restart still has the old one
        again = svc.state_with(lambda m: card_at(m, marker))
    assert again["mm_per_projector_height"] == OLD_MM_PER_PH


def test_save_before_step_2_is_refused_and_writes_nothing(tmp_path):
    world = World(tmp_path)
    lineup = old_lineup(tmp_path)
    old = lineup.read_bytes()
    with Service(tmp_path, f"world:{world.path}", lineup) as svc:
        show(world, svc.calibrate("clear", aspect=ASPECT)["markers"])
        svc.calibrate("shown")
        res = svc.calibrate("save")

    assert res["ok"] is False
    assert lineup.read_bytes() == old


def test_a_first_calibration_makes_the_line_up_file(tmp_path):
    world = World(tmp_path)
    lineup = tmp_path / "new-lineup.json"
    with Service(tmp_path, f"world:{world.path}", lineup) as svc:
        through_step_2(svc, world)
        assert svc.calibrate("save")["ok"] is True

    saved = json.loads(lineup.read_text())
    assert abs(saved["mm_per_projector_height"] - MM_PER_PH) <= 0.5
