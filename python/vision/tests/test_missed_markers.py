"""A missed marker isn't a lifted card: its spot is compared with the card's face (#170, #147).

The spot still looks like the card: the marker was just missed, and the card stays as if seen. It looks like bare
table: the card was lifted, and goes after 0.5 s. Anything else, like a hand: the card is covered, and stays up
to 30 s.
"""

from vision_harness import PERIOD_S, Card, Hand, frame_t, run_drawn, states


def test_a_missed_marker_whose_face_is_still_visible_sends_nothing(tmp_path):
    card, missed = Card(1001, 150, 120, 10), Card(1001, 150, 120, 10, smudged=True)
    # a covered card would go after the 1 s hold; one that still looks like itself stays
    frames = [[card]] * 2 + [[missed]] * 24
    sent = states(run_drawn(tmp_path, frames, settings={"hold_s": 1.0}))

    assert len(sent) == 1


def test_a_bare_spot_removes_the_card_after_half_a_second(tmp_path):
    card, other = Card(1001, 150, 120, 10), Card(0, 250, 250)
    frames = [[card, other]] * 3 + [[other]] * 12  # lifted after frame 2: its spot is bare from frame 3
    sent = states(run_drawn(tmp_path, frames))

    assert [sorted(c["marker"] for c in m["cards"]) for m in sent] == [[0, 1001], [0]]
    assert 0.5 <= sent[1]["t"] - frame_t(3) < 0.5 + PERIOD_S


def test_a_hand_over_a_card_keeps_it_for_up_to_30_s_then_it_goes(tmp_path):
    card = Card(1001, 150, 120, 10)
    frames = [[card]] * 2 + [[card, Hand(165, 125)]] * 64  # a frame every 0.5 s: 32 s under the hand
    sent = states(run_drawn(tmp_path, frames, period_s=0.5))

    assert [len(m["cards"]) for m in sent] == [1, 0]
    assert 30 < sent[1]["t"] - frame_t(1, 0.5) <= 30.5


def test_a_different_marker_laid_on_a_cards_spot_replaces_it_at_once(tmp_path):
    gold, blue = Card(1001, 150, 120, 10), Card(0, 155, 125, 12)  # laid over it, 7 mm off: its marker is hidden
    frames = [[gold]] * 2 + [[gold, blue]] * 6
    sent = states(run_drawn(tmp_path, frames))

    # the new card counts on its second frame, and takes the old one's place in the same state
    assert [[c["marker"] for c in m["cards"]] for m in sent] == [[1001], [0]]
    assert sent[1]["t"] == frame_t(3)


def test_a_different_marker_farther_than_15_mm_is_a_card_beside_it(tmp_path):
    gold, blue = Card(1001, 150, 120, 10), Card(0, 150, 140, 10)  # 20 mm down: over its marker, but not on its spot
    frames = [[gold]] * 2 + [[gold, blue]] * 6
    sent = states(run_drawn(tmp_path, frames))

    assert [sorted(c["marker"] for c in m["cards"]) for m in sent] == [[1001], [0, 1001]]


def test_a_card_comes_back_as_itself_when_the_hand_moves_off(tmp_path):
    card = Card(1001, 150, 120, 10)
    frames = [[card]] * 2 + [[card, Hand(165, 125)]] * 20 + [[card]] * 2
    sent = states(run_drawn(tmp_path, frames))

    assert len(sent) == 1
