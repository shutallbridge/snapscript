"""Thresholds are named settings, changed by a settings file, not literals (#169)."""

from vision_harness import Card, Hand, frame_t, run_drawn, states


def test_how_many_sightings_a_card_needs_is_a_setting(tmp_path):
    card = Card(1001, 150, 120)
    sent = states(run_drawn(tmp_path, [[card]] * 5, settings={"confirm_sightings": 3}))

    assert [m["t"] for m in sent] == [frame_t(2)]


def test_how_long_a_covered_card_stays_is_a_setting(tmp_path):
    card = Card(1001, 150, 120)
    frames = [[card]] * 2 + [[card, Hand(165, 125)]] * 8
    sent = states(run_drawn(tmp_path, frames, settings={"hold_s": 0.5}))

    assert [len(m["cards"]) for m in sent] == [1, 0]
    assert sent[1]["t"] - frame_t(1) > 0.5
    assert sent[1]["t"] - frame_t(1) <= 0.5 + 0.125


def test_the_dead_band_is_a_setting(tmp_path):
    laid, nudged = Card(1001, 200, 150), Card(1001, 201, 150)
    frames = [[laid]] * 2 + [[nudged]] * 8

    assert len(states(run_drawn(tmp_path, frames))) == 1
    assert len(states(run_drawn(tmp_path, frames, settings={"band_mm": 0.5}))) == 2
