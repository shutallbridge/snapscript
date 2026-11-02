"""Handwritten cards (#105, #147, #110): whiteboard crops judged here, read in the cloud.

The whiteboard is cropped from the card's pose and the sheet layout. Ink is strokes clearly darker than the paper
around them. A crop is judged only once it has held steady and looks like paper (its brightness near the white
beside the marker), so a hand lying still over a whiteboard never reads as blank. Blank is decided here, with no
cloud call. A rewrite is enough ink added or removed since the crop that was read, held for a few calm frames,
and isn't judged while the paper's brightness is far off its brightness at the read. A card being read again
keeps its text, with state `reading`.

States: `not read yet`, `reading` (with kept text), `blank`, `read error` (no text back for a card with writing
on it), `connection error` (the request failed), `read`. Failed requests are retried one at a time; when one
gets through, every card with a connection error is read again as normal.
"""

from dataclasses import dataclass, field

import numpy as np
from PIL import Image, ImageFilter

from .geometry import CARD_MARKER_CENTRE
from .readers import Answer
from .settings import Settings

CROP_PX_PER_MM = 3
WHITE_BESIDE_MARKER = ((0.6, 4, 1.6, 26), (15.4, 4, 16.4, 26))  # sheet mm, either side of the printed marker


def sample(grey, lineup, centre, angle, box, ppm):
    """The picture of a box on a card's sheet (sheet mm), `ppm` pixels per mm, bilinear from the camera frame."""
    x0, y0, x1, y1 = box
    w, h = max(1, int(round((x1 - x0) * ppm))), max(1, int(round((y1 - y0) * ppm)))
    ys, xs = np.mgrid[0:h, 0:w]
    sheet = np.stack([x0 + (xs.ravel() + 0.5) / ppm, y0 + (ys.ravel() + 0.5) / ppm], 1) - CARD_MARKER_CENTRE
    a = np.radians(angle)
    rot = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    px = lineup.to_px(sheet @ rot.T + centre) - 0.5  # pixel centres sit at +0.5
    u = np.clip(px[:, 0], 0, grey.shape[1] - 1.001)
    v = np.clip(px[:, 1], 0, grey.shape[0] - 1.001)
    u0, v0 = u.astype(int), v.astype(int)
    fu, fv = u - u0, v - v0
    g = grey.astype(float)
    out = (g[v0, u0] * (1 - fu) * (1 - fv) + g[v0, u0 + 1] * fu * (1 - fv)
           + g[v0 + 1, u0] * (1 - fu) * fv + g[v0 + 1, u0 + 1] * fu * fv)
    return out.reshape(h, w)


def ink_mask(a):
    im = Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
    bg = np.asarray(im.filter(ImageFilter.GaussianBlur(5 * CROP_PX_PER_MM)), float)
    return (a - bg) < -0.2 * bg - 4  # strokes clearly darker than the paper (and any shadow) around them


def mm2(mask):
    return float(mask.sum()) / CROP_PX_PER_MM ** 2


def _grow(mask):
    im = Image.fromarray(mask.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * CROP_PX_PER_MM + 1))
    return np.asarray(im) > 0


def diff(a, b):
    """mm² of ink in one crop with no ink within about 1 mm of it in the other, both ways."""
    return mm2(a & ~_grow(b)) + mm2(b & ~_grow(a))


@dataclass
class Card:
    state: str = "not read yet"
    text: str | None = None
    prev: np.ndarray | None = None      # the last crop's ink
    calm: int = 0                       # frames in a row the crop has held steady and looked like paper
    read_ink: np.ndarray | None = None  # the crop that was judged, and its paper's brightness
    read_paper: float = 0.0
    read_image: np.ndarray | None = None
    changed: int = 0                    # calm frames in a row the crop has differed from the judged one
    pending: object = None              # the read on its way
    since: float = 0.0                  # when this card got its connection error, to retry the oldest first

    def json(self):
        out = {"state": self.state}
        if self.text is not None:
            out["text"] = self.text
        return out


@dataclass
class Handwriting:
    s: Settings
    reader: object
    lineup: object
    known: dict
    cards: dict = field(default_factory=dict)  # track id -> Card
    probe: int | None = None                   # the connection-error card whose retry is on its way
    retry_at: float | None = None

    def step(self, t, grey, live):
        """One frame: crops for the handwritten cards seen in it, and reads coming back."""
        hw = {tr.id: tr for tr in live if self._whiteboard(tr) is not None}
        self.cards = {k: v for k, v in self.cards.items() if k in hw}
        if self.probe not in self.cards:
            self.probe = None
        for k in hw:
            self.cards.setdefault(k, Card())
        for k, card in list(self.cards.items()):
            if card.pending is not None:
                answer = card.pending.poll(t)
                if answer is not None:
                    self._answer(t, k, card, answer)
        self._retry(t)
        for k, tr in hw.items():
            if tr.last == t:
                self._look(t, grey, tr, self.cards[k])

    def json(self, tr):
        card = self.cards.get(tr.id)
        return card.json() if card is not None else None

    def _whiteboard(self, tr):
        m = self.known.get(tr.marker)
        return m.whiteboard if m is not None and m.handwritten else None

    def _look(self, t, grey, tr, card):
        s = self.s
        box = self._whiteboard(tr)
        crop = sample(grey, self.lineup, tr.c, tr.a, box, CROP_PX_PER_MM)
        ink = ink_mask(crop)
        white = np.concatenate([sample(grey, self.lineup, tr.c, tr.a, b, CROP_PX_PER_MM).ravel()
                                for b in WHITE_BESIDE_MARKER])
        paper = float(np.median(crop[~ink])) / max(1.0, float(np.median(white))) if (~ink).any() else 0.0
        steady = card.prev is not None and diff(ink, card.prev) < s.hw_steady_mm2
        card.calm = card.calm + 1 if steady and s.hw_paper_lo <= paper <= s.hw_paper_hi else 0
        card.prev = ink
        if card.calm < s.hw_steady_frames:
            return
        if card.read_ink is not None:
            lit = abs(paper / max(card.read_paper, 1e-6) - 1) > s.hw_light_tol
            card.changed = card.changed + 1 if not lit and diff(ink, card.read_ink) >= s.hw_rewrite_mm2 else 0
            if card.changed < s.hw_rewrite_frames:
                return
        card.read_ink, card.read_paper, card.changed = ink, paper, 0
        card.pending = None  # a read of the old writing is dropped
        if self.probe == tr.id:
            self.probe = None
        if mm2(ink) < s.hw_blank_mm2:
            card.state, card.text = "blank", None
            return
        card.read_image = np.clip(sample(grey, self.lineup, tr.c, tr.a, box, s.reader_px_per_mm), 0, 255) \
            .astype(np.uint8)
        if card.state == "connection error" and self.retry_at is not None:
            return  # rewritten while still offline: it waits its turn for the retry, with the new writing
        self._send(t, card)

    def _send(self, t, card):
        card.text = card.text if card.state in ("read", "reading") else None  # a card read again keeps its text
        card.state = "reading"
        card.pending = self.reader.request(card.read_image, t)

    def _answer(self, t, k, card, answer: Answer):
        card.pending = None
        was_probe = self.probe == k
        if was_probe:
            self.probe = None
        if answer.failed:
            if card.state != "connection error":
                card.since = t
            card.state, card.text = "connection error", None
            if self.retry_at is None or was_probe:
                self.retry_at = t + self.s.hw_retry_s
            return
        card.state, card.text = ("read", answer.text) if answer.text else ("read error", None)
        self.retry_at = None
        for other in self.cards.values():  # a request got through: the cards that failed are read as normal
            if other.state == "connection error" and other.pending is None:
                self._send(t, other)

    def _retry(self, t):
        if self.retry_at is None or self.probe is not None or t < self.retry_at:
            return
        waiting = [(c.since, k) for k, c in self.cards.items() if c.state == "connection error" and c.pending is None]
        if not waiting:
            self.retry_at = None
            return
        k = min(waiting)[1]
        card = self.cards[k]
        self.probe = k
        card.pending = self.reader.request(card.read_image, t)  # still a connection error until it gets through
