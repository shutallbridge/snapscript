"""A recorded frame source replays a recording (#169), in the format the rig records (#105)."""

from vision_harness import run_service, states, write_recording


def test_a_recording_replays_with_its_own_time_stamps(tmp_path):
    times = [5000.0, 5000.13, 5000.27, 5000.4, 5000.53]
    base = write_recording(tmp_path, ["one-card", "one-card", "two-cards", "two-cards", "two-cards"], times)
    sent = states(run_service(tmp_path, f"recording:{base}"))

    assert [m["t"] for m in sent] == [5000.13, 5000.4]
    assert sorted(c["marker"] for c in sent[-1]["cards"]) == [0, 1001]
    circle = next(c for c in sent[-1]["cards"] if c["marker"] == 0)
    assert abs(circle["x"] - 300) <= 0.5 and abs(circle["y"] - 200) <= 0.5 and abs(circle["angle"] - 45) <= 0.5
