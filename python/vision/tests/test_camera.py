"""The camera frame source (#172), run off the Pi against a stand-in picamera2 that photographs a drawn world.

What's checked is what crosses the process's edges: table states over TCP, and what the camera was told to do.
That it works with the real camera is the rig's to show (#175).
"""

import json
import os

from calibration_harness import ASPECT, FAKE_CAMERA, RULER_MM, Service, World, card_at, write_markers
from vision_harness import write_lineup

CARD = (1009, 150.0, 120.0)


def camera(tmp_path, world, lineup, spec="camera:lens=3.75"):
    log = tmp_path / "camera.jsonl"
    env = {"PYTHONPATH": os.pathsep.join([str(FAKE_CAMERA), os.environ.get("PYTHONPATH", "")]),
           "FAKE_CAMERA_WORLD": str(world.path), "FAKE_CAMERA_MARKERS": str(write_markers(tmp_path)),
           "FAKE_CAMERA_LOG": str(log)}
    return Service(tmp_path, spec, lineup, env=env), log


def told(log):
    """Every set_controls call the camera got, in order."""
    return [r["set_controls"] for r in map(json.loads, log.read_text().splitlines()) if "set_controls" in r]


def lay(world, card):
    world.set(cards=[{"marker": card[0], "x": card[1], "y": card[2], "angle": 0}])


def with_exposure(path, ms, gain):
    d = json.loads(path.read_text())
    d["exposure"] = {"ms": ms, "gain": gain}
    path.write_text(json.dumps(d))
    return path


def test_with_no_fixed_exposure_the_camera_runs_on_auto_and_sends_table_states(tmp_path):
    world = World(tmp_path)
    lay(world, CARD)
    svc, log = camera(tmp_path, world, write_lineup(tmp_path, mm_per_ph=250.0))
    with svc:
        state = svc.state_with(lambda m: card_at(m, CARD[0]))

    c = card_at(state, CARD[0])
    assert abs(c["x"] - CARD[1]) <= 0.5 and abs(c["y"] - CARD[2]) <= 0.5
    ctl = told(log)
    assert {"AfMode": 0, "LensPosition": 3.75} in ctl  # the focus is held where it was told
    assert ctl[-1] == {"AeEnable": True}


def test_a_line_ups_fixed_exposure_goes_to_the_camera_at_start(tmp_path):
    world = World(tmp_path)
    lay(world, CARD)
    lineup = with_exposure(write_lineup(tmp_path, mm_per_ph=250.0), 30.0, 1.5)
    svc, log = camera(tmp_path, world, lineup)
    with svc:
        state = svc.state_with(lambda m: card_at(m, CARD[0]))

    assert card_at(state, CARD[0]) is not None
    assert told(log)[-1] == {"AeEnable": False, "ExposureTime": 30000, "AnalogueGain": 1.5}


def test_with_no_lens_given_it_focuses_once_and_holds_it(tmp_path):
    world = World(tmp_path)
    lay(world, CARD)
    svc, log = camera(tmp_path, world, write_lineup(tmp_path, mm_per_ph=250.0), spec="camera")
    with svc:
        svc.state_with(lambda m: card_at(m, CARD[0]))

    ctl = told(log)
    assert ctl[0] == {"AfMode": 1}
    assert ctl[1]["AfMode"] == 0 and "LensPosition" in ctl[1]


def test_calibration_through_the_camera_uses_auto_for_step_1_and_fixes_the_exposure_in_step_2(tmp_path):
    world = World(tmp_path)
    lineup = with_exposure(write_lineup(tmp_path, mm_per_ph=270.0), 10.0, 1.0)
    svc, log = camera(tmp_path, world, lineup)
    with svc:
        step1 = svc.calibrate("clear", aspect=ASPECT)
        world.set(shows=[{k: m[k] for k in ("marker", "x", "y", "size")} for m in step1["markers"]])
        n = len(told(log))
        fit = svc.calibrate("shown")
        during = told(log)[n:]
        world.set(shows=[], ruler={"x": 190.0, "y": 120.0, "angle": 1.0, "mm": RULER_MM})
        size = svc.calibrate("ruler")
        saved = svc.calibrate("save")

    assert fit["ok"] is True and fit["seen"] == 12
    # step 1 goes to auto, then back to the room's fixed exposure
    assert during[0] == {"AeEnable": True}
    assert during[-1] == {"AeEnable": False, "ExposureTime": 10000, "AnalogueGain": 1.0}
    assert size["ok"] is True and saved["ok"] is True
    ex = size["exposure"]
    assert told(log)[-1] == {"AeEnable": False, "ExposureTime": int(round(ex["ms"] * 1000)),
                             "AnalogueGain": ex["gain"]}
    assert json.loads(lineup.read_text())["exposure"] == ex
