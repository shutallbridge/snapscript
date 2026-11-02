"""Cards as tracks (#105): sightings in, the steady table out.

A marker names a card kind, not a physical card, so a sighting goes to the nearest track with the same marker
within the gate. A new card counts on its second sighting in a row. A marker seen elsewhere while its track is
hidden is the same card, moved. A still card's pose is averaged; a move counts only past the dead band.
"""

from dataclasses import dataclass, field

import numpy as np

from .geometry import wrap
from .settings import Settings


@dataclass
class Sighting:
    marker: int
    c: np.ndarray   # marker centre, table mm
    a: float        # degrees


@dataclass
class Track:
    id: int
    marker: int
    c: np.ndarray
    a: float
    last: float
    counted_at: float | None = None
    streak: int = 1
    pose: tuple = field(default=None)  # (centre, angle) as sent: changes only past the dead band

    @property
    def live(self):
        return self.counted_at is not None


class Tracker:
    def __init__(self, s: Settings):
        self.s = s
        self.tracks: list[Track] = []
        self.next_id = 0

    def step(self, t: float, sightings: list[Sighting]) -> list[Track]:
        """One frame. Returns the live tracks (the cards that count), oldest first."""
        s = self.s
        pairs = sorted((float(np.linalg.norm(x.c - tr.c)), i, j)
                       for i, x in enumerate(sightings) for j, tr in enumerate(self.tracks)
                       if tr.marker == x.marker and np.linalg.norm(x.c - tr.c) <= s.gate_mm)
        used_s, used_t = set(), set()
        for d, i, j in pairs:
            if i in used_s or j in used_t:
                continue
            used_s.add(i), used_t.add(j)
            tr, x = self.tracks[j], sightings[i]
            if d < s.still_mm:
                tr.c = tr.c + s.smooth * (x.c - tr.c)
                tr.a = tr.a + s.smooth * wrap(x.a - tr.a)
            else:
                tr.c, tr.a = x.c, x.a
            tr.streak, tr.last = tr.streak + 1, t
        for i, x in enumerate(sightings):
            if i in used_s:
                continue
            hidden = [j for j, tr in enumerate(self.tracks)
                      if tr.marker == x.marker and tr.live and j not in used_t]
            if hidden:  # seen elsewhere while its track is hidden: the same card, moved
                j = min(hidden, key=lambda j: np.linalg.norm(x.c - self.tracks[j].c))
                used_t.add(j)
                tr = self.tracks[j]
                tr.c, tr.a, tr.last, tr.streak = x.c, x.a, t, 1
            else:
                self.tracks.append(Track(self.next_id, x.marker, x.c, x.a, t))
                used_t.add(len(self.tracks) - 1)
                self.next_id += 1

        kept = []
        for j, tr in enumerate(self.tracks):
            if j not in used_t:
                tr.streak = 0
                if not tr.live or t - tr.last > s.hold_s:
                    continue  # an uncounted card missed once was a false read; a counted one is gone
            elif not tr.live and tr.streak >= s.confirm_sightings:
                tr.counted_at, tr.pose = t, (tr.c, tr.a)
            elif tr.live:
                c0, a0 = tr.pose
                if np.linalg.norm(tr.c - c0) > s.band_mm or abs(wrap(tr.a - a0)) > s.band_deg:
                    tr.pose = (tr.c, tr.a)
            kept.append(tr)
        self.tracks = kept
        return [tr for tr in kept if tr.live]
