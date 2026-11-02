"""Thresholds are named settings, changed by a settings file, not literals (#169)."""

from vision_harness import Card, Hand, frame_t, hw_of, run_drawn, states, written


def test_how_many_sightings_a_card_needs_is_a_setting(tmp_path):
    card = Card(400, 150, 120)
    sent = states(run_drawn(tmp_path, [[card]] * 5, settings={"confirm_sightings": 3}))

    assert [m["t"] for m in sent] == [frame_t(2)]


def test_how_long_a_covered_card_stays_is_a_setting(tmp_path):
    card = Card(400, 150, 120)
    frames = [[card]] * 2 + [[card, Hand(165, 125)]] * 8
    sent = states(run_drawn(tmp_path, frames, settings={"hold_s": 0.5}))

    assert [len(m["cards"]) for m in sent] == [1, 0]
    assert sent[1]["t"] - frame_t(1) > 0.5
    assert sent[1]["t"] - frame_t(1) <= 0.5 + 0.125


def test_the_dead_band_is_a_setting(tmp_path):
    laid, nudged = Card(400, 200, 150), Card(400, 201, 150)
    frames = [[laid]] * 2 + [[nudged]] * 8

    assert len(states(run_drawn(tmp_path, frames))) == 1
    assert len(states(run_drawn(tmp_path, frames, settings={"band_mm": 0.5}))) == 2


def test_how_much_darker_than_the_paper_ink_is_are_settings(tmp_path):
    card = Card(65, 120, 120, ink=written("500"))  # [num{}]: a handwritten card
    frames = [[card]] * 12

    def last_hw(name, settings=None):
        d = tmp_path / name
        d.mkdir()
        return hw_of(run_drawn(d, frames, settings=settings), 65)[-1]

    assert last_hw("defaults")["state"] == "reading"
    assert last_hw("share", {"hw_ink_share": 1.0}) == {"state": "blank"}
    assert last_hw("grey", {"hw_ink_grey": 255.0}) == {"state": "blank"}
