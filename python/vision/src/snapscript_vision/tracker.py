"""Cards as tracks (#105): sightings in, the steady table out.

A marker names a card kind, not a physical card, so a sighting goes to the nearest track with the same marker
within the gate. A new card counts on its second sighting in a row. A marker seen elsewhere while its track is
hidden is the same card, moved. A still card's pose is averaged; a move counts only past the dead band.

A counted card whose marker is missed isn't taken as lifted: its spot is compared with its face (#147, see
`faces`). Still the card: it stays as if seen. Bare table: it was lifted, and goes after `lift_s`. Anything else:
it's covered, and goes after `hold_s` unseen.
"""

from dataclasses import dataclass, field

import numpy as np

from . import faces
from .geometry import wrap
from .settings import Settings


@dataclass
class Sighting:
    marker: int
    c: np.ndarray   # marker centre, table mm
    a: float        # degrees
    corners: np.ndarray = None  # the marker's corners in the frame, px


@dataclass
class Track:
    id: int
    marker: int
    c: np.ndarray
    a: float
    last: float
    corners: np.ndarray = None
    counted_at: float | None = None
    streak: int = 1
    pose: tuple = field(default=None)  # (centre, angle) as sent: changes only past the dead band
    face: tuple = None                 # faces.look of the card where it was last seen ...
    face_t: float = None               # ... taken then
    bare_since: float = None           # missed, its spot bare table since then

    @property
    def live(self):
        return self.counted_at is not None


class Tracker:
    def __init__(self, s: Settings, sheet):
        """`sheet(marker)`: (sheet size mm, marker centre on the sheet mm) of what the marker is printed on."""
        self.s, self.sheet = s, sheet
        self.tracks: list[Track] = []
        self.next_id = 0

    def step(self, t: float, sightings: list[Sighting], grey=None) -> list[Track]:
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
            tr.corners, tr.streak, tr.last, tr.bare_since = x.corners, tr.streak + 1, t, None
        for i, x in enumerate(sightings):
            if i in used_s:
                continue
            hidden = [j for j, tr in enumerate(self.tracks)
                      if tr.marker == x.marker and tr.live and j not in used_t]
            if hidden:  # seen elsewhere while its track is hidden: the same card, moved
                j = min(hidden, key=lambda j: np.linalg.norm(x.c - self.tracks[j].c))
                used_t.add(j)
                tr = self.tracks[j]
                tr.c, tr.a, tr.corners, tr.last, tr.streak, tr.bare_since = x.c, x.a, x.corners, t, 1, None
                tr.face = None  # its face was taken where it lay before
            else:
                self.tracks.append(Track(self.next_id, x.marker, x.c, x.a, t, x.corners))
                used_t.add(len(self.tracks) - 1)
                self.next_id += 1

        kept = []
        for j, tr in enumerate(self.tracks):
            if j not in used_t:
                tr.streak = 0
                if not tr.live:
                    continue  # an uncounted card missed once was a false read
                spot = self._spot(tr, grey)
                tr.bare_since = (tr.bare_since or t) if spot == faces.BARE else None
                if spot == faces.CARD:
                    tr.last = t  # the marker was just missed: the card stays as if seen
                elif tr.bare_since is not None and t - tr.bare_since >= s.lift_s - 1e-9:
                    continue  # its spot looks like bare table: lifted
                elif t - tr.last > s.hold_s:
                    continue  # covered too long
            else:
                if not tr.live and tr.streak >= s.confirm_sightings:
                    tr.counted_at, tr.pose = t, (tr.c, tr.a)
                elif tr.live:
                    c0, a0 = tr.pose
                    if np.linalg.norm(tr.c - c0) > s.band_mm or abs(wrap(tr.a - a0)) > s.band_deg:
                        tr.pose = (tr.c, tr.a)
                if tr.live and (tr.face is None or t - tr.face_t >= s.face_every_s - 1e-9):
                    tr.face, tr.face_t = self._look(tr, grey), t
            kept.append(tr)
        # a different card that counts, seen on a missed card's spot, replaces it in the same state
        seen = {self.tracks[j].id for j in used_t}
        laid = [o for o in kept if o.id in seen and o.live]

        def replaced(tr):
            return tr.live and tr.id not in seen and any(
                o.marker != tr.marker and np.linalg.norm(o.c - tr.pose[0]) <= s.replace_mm for o in laid)

        self.tracks = [tr for tr in kept if not replaced(tr)]
        return [tr for tr in self.tracks if tr.live]

    def _look(self, tr, grey):
        if grey is None or tr.corners is None:
            return None
        return faces.look(grey, tr.corners, *self.sheet(tr.marker))

    def _spot(self, tr, grey):
        """What a missed card's spot looks like next to its face, or None with no face to compare."""
        spot = self._look(tr, grey) if tr.face is not None else None
        return faces.judge(tr.face, spot, self.s) if spot is not None else None
