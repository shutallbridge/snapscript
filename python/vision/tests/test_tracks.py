"""Cards become tracks, and table states go out only when the table changes (#169)."""

from vision_harness import Card, frame_t, run_drawn, states, write_lineup


def test_a_card_counts_on_its_second_frame_not_its_first(tmp_path):
    card = Card(400, 150, 120)
    sent = states(run_drawn(tmp_path, [[card], [card], [card], [card]]))

    assert len(sent) == 1
    assert sent[0]["t"] == frame_t(1)
    assert [c["marker"] for c in sent[0]["cards"]] == [400]


def test_a_marker_seen_in_one_frame_only_sends_nothing(tmp_path):
    sent = states(run_drawn(tmp_path, [[Card(400, 150, 120)], [], [], []]))

    assert sent == []


def test_positions_are_the_marker_centre_in_table_mm_and_angles_are_degrees(tmp_path):
    cards = [Card(400, 212.3, 148.7, 30.0), Card(402, 80.0, 250.0, -90.0), Card(401, 330.0, 40.0, 175.0)]
    sent = states(run_drawn(tmp_path, [cards] * 3))

    got = {c["marker"]: c for c in sent[-1]["cards"]}
    for want in cards:
        c = got[want.marker]
        assert abs(c["x"] - want.x) <= 0.5 and abs(c["y"] - want.y) <= 0.5, c
        assert abs((c["angle"] - want.angle + 180) % 360 - 180) <= 0.5, c


def test_a_card_slid_across_the_table_keeps_its_track(tmp_path):
    other = Card(401, 200, 250)
    slide = [[Card(402, 60 + 25 * i, 100, 2 * i), other] for i in range(13)]  # 25 mm a frame, as a quick slide
    sent = states(run_drawn(tmp_path, [slide[0], slide[0]] + slide + [slide[-1]]))

    circle = [next(c for c in m["cards"] if c["marker"] == 402) for m in sent]
    assert len({c["track"] for c in circle}) == 1
    assert abs(circle[-1]["x"] - 360) <= 0.5 and abs(circle[-1]["angle"] - 24) <= 0.5
    assert all(len(m["cards"]) == 2 for m in sent[1:])


def test_a_card_picked_up_and_laid_elsewhere_while_hidden_is_the_same_card(tmp_path):
    a, b = Card(402, 80, 100), Card(402, 320, 220)
    sent = states(run_drawn(tmp_path, [[a], [a], [], [], [b], [b]]))

    assert [len(m["cards"]) for m in sent] == [1, 1]
    assert sent[0]["cards"][0]["track"] == sent[1]["cards"][0]["track"]
    moved = sent[1]["cards"][0]
    assert abs(moved["x"] - 320) <= 0.5 and abs(moved["y"] - 220) <= 0.5


# Readings around where the card was laid (mm, mm, degrees): small ones are averaged in, and ones more than
# 1.5 mm apart jump, so both reach the dead band.
WOBBLE = [(1.0, 0.0, 2.0), (-1.0, 0.5, -2.0), (1.8, 0.0, 2.5), (0.0, 0.0, -2.5), (0.0, 1.8, 2.5),
          (0.0, 0.0, -2.5), (-1.8, 0.0, 2.5), (0.0, -1.8, -2.5), (0.0, 0.0, 0.0)]


def test_wobble_inside_2_mm_and_3_degrees_sends_nothing(tmp_path):
    laid = Card(400, 200, 150, 10.0)
    wobble = [[Card(400, 200 + dx, 150 + dy, 10.0 + da)] for dx, dy, da in WOBBLE * 3]
    sent = states(run_drawn(tmp_path, [[laid], [laid]] + wobble))

    assert len(sent) == 1


def test_a_move_past_the_dead_band_sends_a_new_state(tmp_path):
    laid, moved, turned = Card(400, 200, 150, 10.0), Card(400, 204, 150, 10.0), Card(400, 204, 150, 15.0)
    # a turn in place is averaged in, so it shows within about a second
    sent = states(run_drawn(tmp_path, [[laid]] * 3 + [[moved]] * 3 + [[turned]] * 8))

    assert len(sent) == 3
    assert abs(sent[1]["cards"][0]["x"] - 204) <= 0.5
    assert 13 <= sent[2]["cards"][0]["angle"] <= 15.5
    assert sent[2]["t"] - sent[1]["t"] <= 1.0


def test_every_message_carries_mm_per_projector_height(tmp_path):
    lineup = write_lineup(tmp_path, mm_per_ph=790.0)
    a, b = Card(400, 150, 120), Card(402, 300, 200)
    sent = states(run_drawn(tmp_path, [[a], [a], [a, b], [a, b]], lineup=lineup))

    assert len(sent) == 2
    assert all(m["mm_per_projector_height"] == 790.0 for m in sent)
