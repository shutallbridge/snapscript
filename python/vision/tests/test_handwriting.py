"""Handwritten cards are read, and their state goes out in the table state's `hw` field (#171)."""

import pytest
from vision_harness import Card, Hand, frame_t, hw_of, reader_calls, run_drawn, states, written

NUM = 65      # [num{}], 4U: its whiteboard is x 41-117 mm, y 3-27 mm on the sheet
DEFINE = 90   # [define{}], 5U


def test_hw_appears_only_on_handwritten_cards(tmp_path):
    frames = [[Card(400, 200, 40), Card(NUM, 120, 120), Card(DEFINE, 120, 200)]] * 4
    sent = states(run_drawn(tmp_path, frames))

    for m in sent:
        has = {c["marker"]: "hw" in c for c in m["cards"]}
        assert has == {400: False, NUM: True, DEFINE: True}
    assert hw_of(sent, NUM)[0] == {"state": "not read yet"}


def changes(seq):
    """The values in order, with repeats in a row dropped."""
    out = []
    for x in seq:
        if not out or out[-1] != x:
            out.append(x)
    return out


def test_a_blank_whiteboard_is_blank_with_no_reader_call(tmp_path):
    sent = run_drawn(tmp_path, [[Card(NUM, 120, 120)]] * 12)

    assert changes(hw_of(sent, NUM)) == [{"state": "not read yet"}, {"state": "blank"}]
    assert reader_calls(tmp_path) == []


def test_a_written_card_is_reading_and_then_read_when_the_reader_answers(tmp_path):
    card = Card(NUM, 120, 120, 8.0, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 30, reader=[{"text": "500", "after_s": 2.0}])

    assert changes(hw_of(sent, NUM)) == [{"state": "not read yet"}, {"state": "reading"},
                                         {"state": "read", "text": "500"}]
    assert len(reader_calls(tmp_path)) == 1
    reading = next(m for m in states(sent) if m["cards"][0]["hw"]["state"] == "reading")
    read = next(m for m in states(sent) if m["cards"][0]["hw"]["state"] == "read")
    assert read["t"] - reading["t"] == pytest.approx(2.0, abs=0.13)


def test_a_rewrite_is_reading_with_the_old_text_and_then_read_with_the_new(tmp_path):
    before, after = Card(NUM, 120, 120, ink=written("40")), Card(NUM, 120, 120, ink=written("400"))
    sent = run_drawn(tmp_path, [[before]] * 24 + [[after]] * 24,
                     reader=[{"text": "40", "after_s": 1.0}, {"text": "400", "after_s": 2.0}])

    assert changes(hw_of(sent, NUM)) == [
        {"state": "not read yet"}, {"state": "reading"}, {"state": "read", "text": "40"},
        {"state": "reading", "text": "40"}, {"state": "read", "text": "400"}]
    assert len(reader_calls(tmp_path)) == 2


# A hand lying still over the whiteboard of a card laid at (120, 120): the whiteboard is table mm x 152-228,
# y 108-132, the palm covers x 150-230, y 95-155, and the marker (x 114-126) stays in view.
OVER_WHITEBOARD = Hand(190, 125)


def test_a_covered_whiteboard_is_never_judged_blank(tmp_path):
    card = Card(NUM, 120, 120)
    sent = run_drawn(tmp_path, [[card, OVER_WHITEBOARD]] * 16 + [[card]] * 8)

    assert changes(hw_of(sent, NUM)) == [{"state": "not read yet"}, {"state": "blank"}]
    blank = next(m for m in states(sent) if m["cards"][0]["hw"]["state"] == "blank")
    assert blank["t"] > frame_t(16)


def test_a_covered_whiteboard_is_never_judged_a_rewrite(tmp_path):
    card = Card(NUM, 120, 120, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 16 + [[card, OVER_WHITEBOARD]] * 24 + [[card]] * 8,
                     reader=[{"text": "500", "after_s": 0.5}])

    assert changes(hw_of(sent, NUM)) == [{"state": "not read yet"}, {"state": "reading"},
                                         {"state": "read", "text": "500"}]
    assert len(reader_calls(tmp_path)) == 1


def test_no_text_back_is_a_read_error(tmp_path):
    card = Card(NUM, 120, 120, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 20, reader=[{"text": "", "after_s": 1.0}])

    assert changes(hw_of(sent, NUM))[-1] == {"state": "read error"}


def test_a_failed_request_is_a_connection_error_retried_until_it_gets_through(tmp_path):
    card = Card(NUM, 120, 120, ink=written("500"))
    sent = run_drawn(tmp_path, [[card]] * 60, settings={"hw_retry_s": 2.0},
                     reader=[{"fail": "connect", "after_s": 0.5}, {"fail": "server", "after_s": 0.5},
                             {"text": "500", "after_s": 1.0}])

    assert changes(hw_of(sent, NUM)) == [{"state": "not read yet"}, {"state": "reading"},
                                         {"state": "connection error"}, {"state": "read", "text": "500"}]
    assert len(reader_calls(tmp_path)) == 3


def test_when_a_request_gets_through_every_card_with_a_connection_error_is_read(tmp_path):
    a, b = Card(NUM, 120, 80, ink=written("500")), Card(NUM, 120, 200, ink=written("12"))
    sent = run_drawn(tmp_path, [[a, b]] * 60, settings={"hw_retry_s": 2.0},
                     reader=[{"fail": "connect", "after_s": 0.5}, {"fail": "connect", "after_s": 0.5},
                             {"text": "7", "after_s": 1.0}])

    assert [c["hw"] for c in states(sent)[-1]["cards"]] == [{"state": "read", "text": "7"}] * 2
    seen = [sorted(c["hw"]["state"] for c in m["cards"]) for m in states(sent)]
    # one card is retried at a time; once it gets through, the other goes back to reading
    assert ["connection error", "connection error"] in seen
    assert ["read", "reading"] in seen
    assert len(reader_calls(tmp_path)) == 4


def test_a_card_read_again_keeps_its_text_while_its_failed_request_is_retried(tmp_path):
    before, after = Card(NUM, 120, 120, ink=written("40")), Card(NUM, 120, 120, ink=written("400"))
    sent = run_drawn(tmp_path, [[before]] * 24 + [[after]] * 60, settings={"hw_retry_s": 2.0},
                     reader=[{"text": "40", "after_s": 1.0}, {"fail": "connect", "after_s": 0.5},
                             {"fail": "server", "after_s": 0.5}, {"text": "400", "after_s": 1.0}])

    assert changes(hw_of(sent, NUM)) == [
        {"state": "not read yet"}, {"state": "reading"}, {"state": "read", "text": "40"},
        {"state": "reading", "text": "40"}, {"state": "read", "text": "400"}]
    assert len(reader_calls(tmp_path)) == 4
