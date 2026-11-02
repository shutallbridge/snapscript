"""The table app sends the marker data over the socket when it connects; `--markers` is for tests (#184)."""

from calibration_harness import CALIBRATION, MM_PER_PH, Service, World
from test_calibration import through_step_2
from vision_harness import Card, run_drawn, run_service, states, write_lineup, write_recording, written


def test_with_no_markers_file_the_service_waits_for_the_markers_message(tmp_path):
    # the drawn frames run out in well under a second: had the service started on them, they'd have come early
    early = []
    sent = run_drawn(tmp_path, [[Card(1001, 150, 120)]] * 3, markers="socket", send_markers_after_s=1.5, early=early)

    assert early == []
    assert [m["seq"] for m in states(sent)] == [1]
    assert [c["marker"] for c in states(sent)[0]["cards"]] == [1001]


def test_the_markers_message_and_the_file_give_the_same_table_states(tmp_path):
    # a page, a ruler marker and a handwritten card: each kind of marker in the data acts the same either way
    frames = [[Card(2000, 120, 160), Card(2080, 330, 60), Card(1027, 250, 230, ink=written("4"))]] * 30
    (tmp_path / "file").mkdir()
    (tmp_path / "socket").mkdir()
    by_file = run_drawn(tmp_path / "file", frames, markers="file")
    by_socket = run_drawn(tmp_path / "socket", frames, markers="socket")

    assert states(by_socket) == states(by_file)
    assert states(by_file)[-1]["page"] is not None
    assert any(c.get("hw", {}).get("state") == "read" for c in states(by_file)[-1]["cards"])


def test_a_recording_waits_for_the_markers_message_too(tmp_path):
    base = write_recording(tmp_path, ["one-card"] * 3, [5000.0, 5000.13, 5000.27])
    early = []
    sent = states(run_service(tmp_path, f"recording:{base}", markers="socket", send_markers_after_s=1.0, early=early))

    assert early == []
    assert [[c["marker"] for c in m["cards"]] for m in sent] == [[1001]]


def test_calibration_takes_the_tables_own_markers_from_the_message(tmp_path):
    # step 1 projects the message's 12 calibration markers; step 2 measures with its ruler's two and their distance
    world = World(tmp_path)
    with Service(tmp_path, f"world:{world.path}", write_lineup(tmp_path, mm_per_ph=270.0), markers="socket") as svc:
        step1, fit, size = through_step_2(svc, world)

    assert sorted(m["marker"] for m in step1["markers"]) == CALIBRATION
    assert fit["ok"] is True
    assert size["ok"] is True and abs(size["mm_per_projector_height"] - MM_PER_PH) <= 0.5
