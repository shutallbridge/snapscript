"""A recorded frame source replays a recording (#169), in the format the rig records (#105)."""

import json

import numpy as np
from snapscript_vision.markers import load as load_markers
from snapscript_vision.sources import draw

from vision_harness import MARKERS, Card, run_service, states, write_scene


def write_recording(d, frames, times):
    """A recording as the rig's record.py writes it: NAME.json (w, h, a time per frame) and NAME.y (grey planes)."""
    camera = json.loads(write_scene(d, []).read_text())["camera"]
    (d / "m.json").write_text(json.dumps(MARKERS))
    known = load_markers(d / "m.json")
    pics = [draw(camera, [c.json() for c in f], known) for f in frames]
    h, w = pics[0].shape
    base = d / "clip"
    (d / "clip.y").write_bytes(np.stack(pics).tobytes())
    (d / "clip.json").write_text(json.dumps({"w": w, "h": h, "t": times}))
    return base


def test_a_recording_replays_with_its_own_time_stamps(tmp_path):
    a, b = Card(1001, 150, 120), Card(0, 300, 200, 45)
    times = [5000.0, 5000.13, 5000.27, 5000.4, 5000.53]
    base = write_recording(tmp_path, [[a], [a], [a, b], [a, b], [a, b]], times)
    sent = states(run_service(tmp_path, f"recording:{base}"))

    assert [m["t"] for m in sent] == [5000.13, 5000.4]
    assert sorted(c["marker"] for c in sent[-1]["cards"]) == [0, 1001]
    circle = next(c for c in sent[-1]["cards"] if c["marker"] == 0)
    assert abs(circle["x"] - 300) <= 0.5 and abs(circle["y"] - 200) <= 0.5 and abs(circle["angle"] - 45) <= 0.5
