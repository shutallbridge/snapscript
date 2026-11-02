"""Frame sources, chosen by configuration: `drawn:SCENE.json` or `recording:PATH`. Each yields (t, grey frame).

- **Drawn**: test frames drawn by rendering card sheets with their markers onto a table picture, so tests run
  off the Pi. A scene is JSON:

      {"start_t": 1000000.0, "period_s": 0.125,
       "camera": {"px_per_mm": 4, "origin_mm": [-20, -10], "size_mm": [420, 300]},
       "frames": [[{"marker": 1001, "x": 150, "y": 120, "angle": 0}], ...]}

  Each card is placed by its marker's centre in table mm and its angle in degrees. The drawn camera sees table mm
  (x, y) at pixel ((x, y) - origin_mm) * px_per_mm. A card with `"smudged": true` has a smudge on its marker's
  corner, so the camera misses the marker while the card looks the same. `{"hand": [x, y]}` in a frame is a hand
  lying flat, its palm centred at (x, y) table mm. Things are drawn in order, later ones on top.
- **Recording**: frames recorded on the rig, in the card tracking prototype's format (#105): PATH.json holds
  {"w", "h", "t": [one time stamp per frame]} and PATH.y the frames' grey planes back to back.

(The camera source comes with calibration, #172.)
"""

import json
from pathlib import Path

import numpy as np

from . import geometry as g
from .markers import Marker
from .tags import pattern

TABLE_GREY = 110
PAPER_GREY = 235
INK_GREY = 25
SKIN_GREY = 190
SUPERSAMPLE = 3


def make(spec: str, markers: dict[int, Marker]):
    kind, _, arg = spec.partition(":")
    if kind == "drawn":
        return drawn(arg, markers)
    if kind == "recording":
        return recording(arg)
    raise ValueError(f"unknown frame source {spec!r} (drawn:SCENE.json or recording:PATH)")


def recording(base):
    base = str(base)
    meta = json.loads(Path(base + ".json").read_text())
    w, h, ts = meta["w"], meta["h"], meta["t"]
    frames = np.memmap(base + ".y", np.uint8, "r").reshape(-1, h, w)
    for t, f in zip(ts, frames):
        yield float(t), np.ascontiguousarray(f)


def drawn(scene_path, markers):
    scene = json.loads(Path(scene_path).read_text())
    for i, cards in enumerate(scene["frames"]):
        yield scene["start_t"] + i * scene["period_s"], draw(scene["camera"], cards, markers)


def sheet(marker_id: int, markers: dict[int, Marker]):
    """(sheet size mm, marker centre on the sheet mm) for what a marker is printed on."""
    m = markers.get(marker_id)
    if m is not None and m.kind == "page":
        return g.PAGE_MM, g.PAGE_MARKER_CENTRE
    length = m.length if m is not None and m.length else 2
    return (length * g.U_MM, g.U_MM), g.CARD_MARKER_CENTRE


def draw(camera, cards, markers):
    """One grey frame of the table with these cards' sheets lying on it, later ones on top."""
    ppm = float(camera["px_per_mm"])
    origin = np.array(camera["origin_mm"], float)
    w, h = (int(round(v * ppm)) for v in camera["size_mm"])
    img = np.full((h, w), float(TABLE_GREY))
    for c in cards:
        if "hand" in c:
            _draw_hand(img, ppm, origin, c["hand"])
        else:
            _draw_sheet(img, ppm, origin, c, markers)
    return np.clip(img, 0, 255).astype(np.uint8)


def _draw_hand(img, ppm, origin, centre):
    """A palm (80 x 60 mm) and four fingers (15 x 55 mm, 5 mm apart) above it, shaded from wrist to fingertips."""
    x, y = centre
    parts = [(x - 40, y - 30, x + 40, y + 30)] + [(x - 40 + 20 * i, y - 85, x - 25 + 20 * i, y - 30) for i in range(4)]
    h, w = img.shape
    for x0, y0, x1, y1 in parts:
        (c0, r0), (c1, r1) = ((np.array(p) - origin) * ppm for p in ((x0, y0), (x1, y1)))
        c0, r0 = max(int(c0), 0), max(int(r0), 0)
        c1, r1 = min(int(c1), w), min(int(r1), h)
        if c1 > c0 and r1 > r0:
            rows = (np.arange(r0, r1) / ppm + origin[1] - (y - 85)) / 115  # 0 at the fingertips, 1 at the wrist
            img[r0:r1, c0:c1] = (SKIN_GREY - 40 * rows)[:, None]


def _draw_sheet(img, ppm, origin, card, markers):
    (sw, sh), mc = sheet(int(card["marker"]), markers)
    mc = np.array(mc, float)
    a = np.radians(card["angle"])
    rot = np.array([[np.cos(a), -np.sin(a)], [np.sin(a), np.cos(a)]])
    centre = np.array([card["x"], card["y"]], float)
    corners = (np.array([[0, 0], [sw, 0], [sw, sh], [0, sh]]) - mc) @ rot.T + centre
    px = (corners - origin) * ppm
    x0, y0 = np.maximum(np.floor(px.min(0)).astype(int) - 1, 0)
    x1 = min(int(np.ceil(px[:, 0].max())) + 1, img.shape[1])
    y1 = min(int(np.ceil(px[:, 1].max())) + 1, img.shape[0])
    if x1 <= x0 or y1 <= y0:
        return
    # every sub-pixel sample in the box, back to sheet mm
    k = SUPERSAMPLE
    ys, xs = np.mgrid[y0:y1, x0:x1]
    sub = (np.arange(k) + 0.5) / k
    u = xs[..., None, None] + sub[None, None, None, :]
    v = ys[..., None, None] + sub[None, None, :, None]
    tx, ty = u / ppm + origin[0] - centre[0], v / ppm + origin[1] - centre[1]
    sx = np.cos(a) * tx + np.sin(a) * ty + mc[0]
    sy = -np.sin(a) * tx + np.cos(a) * ty + mc[1]
    on = (sx >= 0) & (sx < sw) & (sy >= 0) & (sy < sh)
    grey = np.full(sx.shape, float(PAPER_GREY))
    cell = g.MARKER_MM / 9
    cx = np.floor((sx - (mc[0] - g.MARKER_MM / 2)) / cell).astype(int)
    cy = np.floor((sy - (mc[1] - g.MARKER_MM / 2)) / cell).astype(int)
    in_tag = (cx >= 0) & (cx < 9) & (cy >= 0) & (cy < 9)
    bits = pattern(int(card["marker"]))
    if card.get("smudged"):
        bits = bits.copy()
        bits[2, 2] = True  # a dark smudge on the marker's inner ring, at its corner: no quad there
    black = np.zeros(sx.shape, bool)
    black[in_tag] = bits[cy[in_tag], cx[in_tag]]
    grey[black] = INK_GREY
    cover = on.mean(axis=(2, 3))
    paper = np.where(on, grey, 0).sum(axis=(2, 3)) / (k * k)
    box = img[y0:y1, x0:x1]
    box[:] = box * (1 - cover) + paper
