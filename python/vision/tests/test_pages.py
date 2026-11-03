"""A page is followed like a card, and the newest page in view is the current page (#169)."""

from vision_harness import Card, run_drawn, states


def test_the_newest_page_in_view_is_the_current_page(tmp_path):
    first, second = Card(403, 120, 160), Card(404, 330, 160, 5)
    card = Card(400, 200, 30)
    frames = [[first, card]] * 2 + [[first, second, card]] * 2 + [[first, card]] * 6
    sent = states(run_drawn(tmp_path, frames, settings={"hold_s": 0.5}))

    def current(m):
        return next(c["marker"] for c in m["cards"] if c["track"] == m["page"])

    assert [current(m) for m in sent] == [403, 404, 403]
    p = next(c for c in sent[1]["cards"] if c["marker"] == 404)
    assert abs(p["x"] - 330) <= 0.5 and abs(p["y"] - 160) <= 0.5 and abs(p["angle"] - 5) <= 0.5


def test_no_page_in_view_is_null(tmp_path):
    card = Card(400, 200, 30)
    sent = states(run_drawn(tmp_path, [[card]] * 3))

    assert sent[0]["page"] is None


def test_the_ruler_pages_markers_are_not_cards(tmp_path):
    card = Card(400, 200, 30)
    frames = [[card, Card(312, 100, 200), Card(313, 300, 200)]] * 3
    sent = states(run_drawn(tmp_path, frames))

    assert [[c["marker"] for c in m["cards"]] for m in sent] == [[400]]


def test_a_marker_the_service_doesnt_know_is_still_sent(tmp_path):
    # the table reader marks it as an unknown card, so it needs its place
    frames = [[Card(400, 200, 30), Card(1500, 200, 150)]] * 3
    sent = states(run_drawn(tmp_path, frames))

    assert sorted(c["marker"] for c in sent[-1]["cards"]) == [400, 1500]
