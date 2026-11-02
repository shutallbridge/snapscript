"""Calibration (#132): the service owns one line-up, at the table's height, kept in a file on the Pi.

The table app runs three steps from its settings menu. Each is a command on the table-state socket, and each gets a
result back on it (every client sees both):

    -> {"type": "calibrate", "step": "clear", "aspect": 1.5}
    <- {"type": "calibration", "step": "clear", "ok": true, "white": 1.5,
        "markers": [{"marker": 300, "x": 0.1, "y": 0.1, "size": 0.12}, ...]}

Step 1, clear the table. `aspect` is the projector picture's width over its height. The answer is the 12 markers
to project: centre (`x`, `y`) and printed width (`size`, all 9 cells) in projector heights from the picture's
top-left, upright, black on a white square `white` times the marker's width.

    -> {"type": "calibrate", "step": "shown"}
    <- {"type": "calibration", "step": "shown", "ok": true, "seen": 12, "of": 12, "k1": 0.031,
        "error_mm": {"mean": 0.4, "max": 0.9}}

The table app says the markers are shown. The camera goes to auto exposure, the line-up is fitted from the
markers' centres plus one lens term, and the camera goes back to the room's exposure. `error_mm` is how far the
fit leaves the markers, in mm at the old line-up's size until step 2 measures it.

    -> {"type": "calibrate", "step": "ruler"}
    <- {"type": "calibration", "step": "ruler", "ok": true, "mm_per_projector_height": 781.0,
        "exposure": {"ms": 48.0, "gain": 1.0}, "paper": 148, "error_mm": {"mean": 0.8, "max": 1.4},
        "ruler_page": {"x": 585.2, "y": 390.6, "angle": 0.8}}

Step 2, the ruler page lies flat. The camera's exposure is fixed so the page's paper comes out at
`paper_grey`, and the real size comes from its two markers, a known distance apart. From here on, table states
use the new line-up, so the table app can draw its check outlines. `ruler_page` is where the page lies by the new
line-up: the centre between its two markers in table mm, and the angle from the first to the second in degrees.

    -> {"type": "calibrate", "step": "save"}      or      {"type": "calibrate", "step": "keep"}
    <- {"type": "calibration", "step": "save", "ok": true}

Step 3. Save writes the new line-up to the file. Keep drops it and goes back to the old one, whose file is left
untouched. A step that can't be done answers `"ok": false` with `why`, and changes nothing.
"""

import time

import numpy as np

from .geometry import Lineup, apply, fit_homography, undistort

COLS, ROWS = 4, 3     # the step-1 markers' grid
INSET = 0.1           # projector heights from the picture's edge to the outer markers' centres
SIZE = 0.12           # a step-1 marker's printed width, projector heights
WHITE = 1.5           # its white square, times its width
K1_RANGE = (-0.3, 0.3, 601)  # the lens terms tried


def stats(e):
    e = np.asarray(e, float)
    return {"mean": round(float(e.mean()), 2), "max": round(float(e.max()), 2)}


def fit_lens(src, dst, size):
    """The one lens term and homography that take camera px to projector heights best (mean error)."""
    def fit(k):
        u = undistort(src, k, size)
        h = fit_homography(u, dst)
        return h, np.linalg.norm(apply(h, u) - dst, axis=1)

    best = None
    for k in np.linspace(*K1_RANGE):
        h, err = fit(k)
        if best is None or err.mean() < best[2].mean():
            best = (float(k), h, err)
    return best


class Calibration:
    def __init__(self, path, saved: Lineup, source, detector, table, settings):
        self.path, self.saved, self.live = path, saved, saved
        self.source, self.det, self.table, self.s = source, detector, table, settings
        self.grid = None      # step 1: {marker: centre in projector heights}
        self.pending = None   # the new line-up, as far as it's got
        self.fit_err = None   # step 1's fit error, projector heights
        self.sized = False    # step 2 done
        self.room()

    # ---- the camera's exposure --------------------------------------------------------------------------------

    def can_expose(self):
        return hasattr(self.source, "expose")

    def room(self):
        """The room's exposure: the live line-up's fixed one, or auto when it has none."""
        if self.can_expose():
            if self.live.exposure:
                self.source.expose(*self.live.exposure)
            else:
                self.source.expose()

    def grab(self, frames):
        return next(frames)[1]

    # ---- the steps ----------------------------------------------------------------------------------------------

    def command(self, cmd, frames):
        step = cmd.get("step")
        try:
            out = getattr(self, f"step_{step}")(cmd, frames) if step in STEPS else self.no(f"no step {step!r}")
        except StopIteration:
            out = self.no("the frames ran out")
        return {"type": "calibration", "step": step, **out}

    @staticmethod
    def no(why):
        return {"ok": False, "why": why}

    def step_clear(self, cmd, frames):
        ids = list(self.table.calibration)
        if len(ids) != COLS * ROWS:
            return self.no(f"the marker data has {len(ids)} calibration markers, not {COLS * ROWS}")
        aspect = cmd.get("aspect")
        if not isinstance(aspect, (int, float)) or aspect <= 2 * INSET:
            return self.no("say the projector's aspect (its width over its height)")
        self.grid = {}
        for i, mid in enumerate(ids):
            col, row = i % COLS, i // COLS
            self.grid[mid] = np.array([INSET + col / (COLS - 1) * (aspect - 2 * INSET),
                                       INSET + row / (ROWS - 1) * (1 - 2 * INSET)])
        self.pending, self.sized = None, False
        return {"ok": True, "white": WHITE,
                "markers": [{"marker": mid, "x": round(float(c[0]), 5), "y": round(float(c[1]), 5), "size": SIZE}
                            for mid, c in self.grid.items()]}

    def step_shown(self, cmd, frames):
        if self.grid is None:
            return self.no("do step 1 (clear) first")
        if self.can_expose():
            self.source.expose()  # auto: projected markers want a shorter exposure than the room's
        found, size = {}, None
        try:
            for _ in range(self.s.calibration_tries):
                grey = self.grab(frames)
                size = (grey.shape[1], grey.shape[0])
                now = {int(d.tag_id): d.corners for d in self.det.detect(grey) if int(d.tag_id) in self.grid}
                if len(now) > len(found):
                    found = now
                if len(found) == len(self.grid):
                    break
        finally:
            self.room()
        if len(found) < self.s.calibration_min_markers:
            return {**self.no(f"saw {len(found)} of the {len(self.grid)} markers"), "seen": len(found),
                    "of": len(self.grid)}
        ids = sorted(found)
        src = np.array([found[i].mean(0) for i in ids])  # centres: projector glare grows a marker about its centre
        dst = np.array([self.grid[i] for i in ids])
        k1, h, err = fit_lens(src, dst, size)
        self.pending = Lineup(k1, h, self.live.mm_per_ph, size, self.live.exposure)
        self.sized, self.fit_err = False, err
        return {"ok": True, "seen": len(found), "of": len(self.grid), "k1": round(k1, 4),
                "error_mm": stats(err * self.live.mm_per_ph)}

    def step_ruler(self, cmd, frames):
        if self.pending is None:
            return self.no("do step 1 (clear, then shown) first")
        if not self.table.ruler_mm or len(self.table.ruler) != 2:
            return self.no("the marker data has no ruler page")
        s = self.s
        ms, gain = self.pending.exposure or self.current_exposure()
        best = None  # (paper, ms, gain, the ruler's markers) at the last exposure that saw the page
        for _ in range(s.calibration_tries):
            if self.can_expose():
                self.source.expose(ms, gain)
            grey = self.grab(frames)
            found = {int(d.tag_id): d.corners for d in self.det.detect(grey) if int(d.tag_id) in self.table.ruler}
            if len(found) < 2:
                continue
            paper = float(np.median([paper_around(grey, c) for c in found.values()]))
            best = (paper, ms, gain, found)
            if not self.can_expose() or abs(paper - s.paper_grey) <= s.paper_tolerance:
                break
            want = ms * gain * s.paper_grey / max(paper, 1.0)  # brightness goes with exposure times gain
            if want <= s.exposure_max_ms:
                ms, gain = max(want, 0.05), 1.0
            else:
                ms, gain = s.exposure_max_ms, min(s.gain_max, want / s.exposure_max_ms)
        if best is None:
            self.room()
            return self.no("didn't see the ruler page's 2 markers")
        paper, ms, gain, found = best
        a, b = (self.pending.to_ph(found[i]).mean(0) for i in self.table.ruler)
        mm_per_ph = self.table.ruler_mm / float(np.linalg.norm(a - b))
        exposure = (round(ms, 3), round(gain, 3)) if self.can_expose() else None
        p = self.pending
        self.pending = Lineup(p.k1, p.H, mm_per_ph, p.image_size, exposure)
        self.live, self.sized = self.pending, True  # the check view: table states use the new line-up
        self.room()
        a_mm, b_mm = a * mm_per_ph, b * mm_per_ph
        mid, d = (a_mm + b_mm) / 2, b_mm - a_mm
        out = {"ok": True, "mm_per_projector_height": round(mm_per_ph, 2), "paper": round(paper),
               "error_mm": stats(self.fit_err * mm_per_ph),
               "ruler_page": {"x": round(float(mid[0]), 2), "y": round(float(mid[1]), 2),
                              "angle": round(float(np.degrees(np.arctan2(d[1], d[0]))), 2)}}
        if exposure:
            out["exposure"] = {"ms": exposure[0], "gain": exposure[1]}
        return out

    def current_exposure(self):
        ex = getattr(self.source, "exposure", None)
        return ex if ex else (20.0, 1.0)

    def step_save(self, cmd, frames):
        if not self.sized:
            return self.no("nothing to save: do steps 1 and 2 first")
        self.pending.save(self.path, time.strftime("%Y-%m-%d %H:%M:%S"))
        self.saved = self.live = self.pending
        self.pending, self.grid, self.sized = None, None, False
        self.room()
        return {"ok": True}

    def step_keep(self, cmd, frames):
        self.live = self.saved
        self.pending, self.grid, self.sized = None, None, False
        self.room()
        return {"ok": True}


STEPS = {"clear", "shown", "ruler", "save", "keep"}


def paper_around(grey, corners):
    """The median grey of the paper around a marker: a ring from 0.6 to 1 times the printed marker's width out
    from its centre (the detected square is the middle 5 of its 9 cells)."""
    c = corners.mean(0)
    side = float(np.mean([np.linalg.norm(corners[i] - corners[i - 1]) for i in range(4)])) * 9 / 5
    r0, r1 = 0.6 * side, 1.0 * side
    x0, y0 = np.maximum(np.floor(c - r1).astype(int), 0)
    x1 = min(int(np.ceil(c[0] + r1)), grey.shape[1])
    y1 = min(int(np.ceil(c[1] + r1)), grey.shape[0])
    ys, xs = np.mgrid[y0:y1, x0:x1]
    d = np.maximum(np.abs(xs - c[0]), np.abs(ys - c[1]))
    ring = grey[y0:y1, x0:x1][(d >= r0) & (d <= r1)]
    return float(np.median(ring)) if ring.size else 0.0
