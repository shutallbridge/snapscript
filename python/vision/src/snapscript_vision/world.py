"""A live drawn table (`world:WORLD.json`): every frame is drawn from the file as it is at that moment, so a test can
change the table while the service runs (lay a card or the ruler page, have the projector show markers, dim the
room). It answers to exposure like a camera, so calibration can be tested off the Pi. The file:

    {"start_t": 1000000.0, "period_s": 0.125,
     "camera": {"px_per_mm": 4, "origin_mm": [-15, -10], "size_mm": [400, 270], "k1": 0.0},
     "room": 5.0,
     "projector": {"mm_per_ph": 250.0, "light": 40.0,
                   "shows": [{"marker": 300, "x": 0.1, "y": 0.1, "size": 0.12}]},
     "cards": [{"marker": 1001, "x": 150, "y": 120, "angle": 0}],
     "ruler": {"x": 190, "y": 125, "angle": 2, "mm": 257} | null}

- **Camera**: table mm (x, y) is seen at pixel p where `Lineup.undistort(p)` is ((x, y) - origin_mm) * px_per_mm:
  one lens term, the same one the line-up fits.
- **Light**: `room` is the grey a white surface gives per ms of exposure (times gain). The projector's top-left
  is table mm (0, 0); `shows` are markers it draws, centre and printed width in projector heights, upright, black
  on a white square 1.5 times the marker's width (`light` on white, nothing on black).
- **Exposure**: fixed (ms, gain), or auto: the frame's mean grey comes out at `AUTO_GREY`.
- Cards and pages are drawn as the `drawn:` source draws them. The ruler page is an A4 sheet, landscape, centred
  at (x, y) and turned `angle` degrees, with its two markers on its middle line, `mm` apart.
"""

import json
import time
from pathlib import Path

import numpy as np

from . import geometry as g
from .markers import Marker
from .sources import sheet
from .tags import pattern

TABLE, PAPER, INK = 0.44, 0.94, 0.10   # how much light each gives back
AUTO_GREY = 100.0
AUTO_MS = (0.1, 66.0)
WHITE = 1.5                              # a projected marker's white square, times its width
SUPERSAMPLE = 3
RULER_PAGE_MM = (297.0, 210.0)


class Camera:
    """Pixels to table mm and back for the drawn camera, with its lens term."""

    def __init__(self, cam):
        self.ppm = float(cam["px_per_mm"])
        self.origin = np.array(cam["origin_mm"], float)
        self.w, self.h = (int(round(v * self.ppm)) for v in cam["size_mm"])
        self.k1 = float(cam.get("k1", 0.0))
        self.ctr = np.array([self.w, self.h], float) / 2
        self.norm = float(np.hypot(*self.ctr))

    def to_mm(self, u, v):
        """Pixel arrays -> table mm arrays."""
        if self.k1:
            du, dv = u - self.ctr[0], v - self.ctr[1]
            f = 1 + self.k1 * (du * du + dv * dv) / self.norm ** 2
            u, v = self.ctr[0] + du * f, self.ctr[1] + dv * f
        return u / self.ppm + self.origin[0], v / self.ppm + self.origin[1]

    def box(self, corners_mm):
        """The pixel box (x0, y0, x1, y1) that holds these table mm points, with room for the lens term."""
        px = (np.asarray(corners_mm, float) - self.origin) * self.ppm
        pad = abs(self.k1) * self.norm + 2
        x0, y0 = np.floor(px.min(0) - pad).astype(int)
        x1, y1 = np.ceil(px.max(0) + pad).astype(int)
        return max(x0, 0), max(y0, 0), min(x1, self.w), min(y1, self.h)

    def samples(self, box):
        """Table mm of every sub-pixel sample in a pixel box, shaped (h, w, k, k)."""
        x0, y0, x1, y1 = box
        k = SUPERSAMPLE
        ys, xs = np.mgrid[y0:y1, x0:x1]
        sub = (np.arange(k) + 0.5) / k
        u = xs[..., None, None] + sub[None, None, None, :]
        v = ys[..., None, None] + sub[None, None, :, None]
        u, v = np.broadcast_arrays(u, v)
        return self.to_mm(u, v)


def _in_frame(x, y, centre, angle):
    """Table mm -> the frame of a thing at `centre`, turned `angle` degrees (x right, y down as printed)."""
    a = np.radians(angle)
    tx, ty = x - centre[0], y - centre[1]
    return np.cos(a) * tx + np.sin(a) * ty, -np.sin(a) * tx + np.cos(a) * ty


def _marker_cells(sx, sy, mc, width, marker_id):
    """True where (sx, sy) (in a sheet's own mm) is on a black cell of the marker centred at mc."""
    cell = width / 9
    cx = np.floor((sx - (mc[0] - width / 2)) / cell).astype(int)
    cy = np.floor((sy - (mc[1] - width / 2)) / cell).astype(int)
    inside = (cx >= 0) & (cx < 9) & (cy >= 0) & (cy < 9)
    black = np.zeros(sx.shape, bool)
    black[inside] = pattern(marker_id)[cy[inside], cx[inside]]
    return black


def _sheets(world, markers):
    """Every sheet on the table, as (size mm, centre mm, angle, [(marker, centre on the sheet mm)])."""
    out = []
    for c in world.get("cards", []):
        (sw, sh), mc = sheet(int(c["marker"]), markers)
        out.append(((sw, sh), np.array([c["x"], c["y"]], float), float(c.get("angle", 0.0)),
                    np.array(mc, float), [(int(c["marker"]), np.array(mc, float))]))
    r = world.get("ruler")
    if r:
        rulers = [m.id for m in markers.values() if m.kind == "ruler"]
        pw, ph = RULER_PAGE_MM
        mid = np.array([pw / 2, ph / 2])
        half = float(r["mm"]) / 2
        out.append(((pw, ph), np.array([r["x"], r["y"]], float), float(r.get("angle", 0.0)), mid,
                    [(rulers[0], mid - [half, 0]), (rulers[1], mid + [half, 0])]))
    return out


def render(world, markers, exposure):
    """One grey frame of the world. `exposure` is (ms, gain), or None for auto. Returns (frame, (ms, gain))."""
    cam = Camera(world["camera"])
    refl = np.full((cam.h, cam.w), TABLE)
    for (sw, sh), centre, angle, anchor, marks in _sheets(world, markers):
        corners = np.array([[0, 0], [sw, 0], [sw, sh], [0, sh]], float) - anchor
        a = np.radians(angle)
        rot = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
        box = cam.box(corners @ rot.T + centre)
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        x, y = cam.samples(box)
        fx, fy = _in_frame(x, y, centre, angle)
        sx, sy = fx + anchor[0], fy + anchor[1]
        on = (sx >= 0) & (sx < sw) & (sy >= 0) & (sy < sh)
        val = np.full(sx.shape, PAPER)
        for mid, mc in marks:
            val[_marker_cells(sx, sy, mc, g.MARKER_MM, mid)] = INK
        cover = on.mean(axis=(2, 3))
        part = np.where(on, val, 0).sum(axis=(2, 3)) / SUPERSAMPLE ** 2
        b = refl[box[1]:box[3], box[0]:box[2]]
        b[:] = b * (1 - cover) + part

    light = np.full((cam.h, cam.w), float(world["room"]))
    proj = world.get("projector") or {}
    mm_ph = float(proj.get("mm_per_ph", 1.0))
    for s in proj.get("shows", []):
        centre = np.array([s["x"], s["y"]], float) * mm_ph
        width = float(s["size"]) * mm_ph
        half = width * WHITE / 2
        box = cam.box(centre + np.array([[-half, -half], [half, half]]))
        if box[2] <= box[0] or box[3] <= box[1]:
            continue
        x, y = cam.samples(box)
        fx, fy = x - centre[0], y - centre[1]
        lit = (np.abs(fx) < half) & (np.abs(fy) < half)
        lit &= ~_marker_cells(fx, fy, (0.0, 0.0), width, int(s["marker"]))
        light[box[1]:box[3], box[0]:box[2]] += float(proj["light"]) * lit.mean(axis=(2, 3))

    seen = refl * light  # grey per ms
    if exposure is None:
        ms = float(np.clip(AUTO_GREY / max(seen.mean(), 1e-6), *AUTO_MS))
        exposure = (round(ms, 3), 1.0)
    ms, gain = exposure
    return np.clip(seen * ms * gain, 0, 255).astype(np.uint8), exposure


class WorldSource:
    """Frames drawn from the world file, one at a time, with exposure set like a camera's."""

    def __init__(self, path, markers: dict[int, Marker]):
        self.path, self.markers = Path(path), markers
        self.fixed = None      # (ms, gain), or None for auto
        self.exposure = None   # what the last frame was taken at

    def expose(self, ms=None, gain=1.0):
        """Fixed exposure, or auto with no arguments."""
        self.fixed = None if ms is None else (float(ms), float(gain))

    def __iter__(self):
        i = 0
        while True:
            world = json.loads(self.path.read_text())
            frame, self.exposure = render(world, self.markers, self.fixed)
            yield world["start_t"] + i * world["period_s"], frame
            i += 1
            time.sleep(0.01)
