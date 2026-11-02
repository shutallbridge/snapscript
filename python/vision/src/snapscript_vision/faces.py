"""A card's face, and what its spot looks like when its marker is missed (#147).

While a card is seen, the service keeps its **face**: the whole sheet as a small greyscale picture (1 px per mm),
taken from the frame through the marker's corners and refreshed every so often. When the marker is missed, the
card's spot (where the face was taken) is compared with the face, ignoring overall brightness:

- **card**: it still looks like the card (the match, a normalised correlation, is at least `face_match`), so the
  marker was just missed;
- **bare**: its contrast is under `lift_contrast` of the face's, so it looks like bare table: the card was lifted;
- **covered**: anything else, such as a hand over it.
"""

import numpy as np

from .geometry import MARKER_CORNERS, fit_similarity

CARD, BARE, COVERED = "card", "bare", "covered"


def look(grey, corners_px, sheet_mm, marker_centre_mm):
    """The sheet as it lies in the frame, 1 px per mm: (mean 0 and unit norm, its standard deviation)."""
    to_px = fit_similarity(MARKER_CORNERS, corners_px)  # marker mm -> frame px
    w, h = (int(round(v)) for v in sheet_mm)
    ys, xs = np.mgrid[0:h, 0:w] + 0.5
    pts = np.c_[xs.ravel() - marker_centre_mm[0], ys.ravel() - marker_centre_mm[1], np.ones(xs.size)] @ to_px.T
    a = _bilinear(grey, pts[:, 0], pts[:, 1]).reshape(h, w)
    a -= a.mean()
    sd = float(a.std())
    return a / max(float(np.linalg.norm(a)), 1e-6), sd


def judge(face, spot, s):
    """Compare a missed card's spot with its face, both from `look`."""
    (f, f_sd), (g, g_sd) = face, spot
    if float((f * g).sum()) >= s.face_match:
        return CARD
    if g_sd < s.lift_contrast * max(f_sd, 1e-6):
        return BARE
    return COVERED


def _bilinear(img, x, y):
    """img sampled at pixel coordinates (x, y), pixel centres at +0.5; off the frame reads as its nearest edge."""
    h, w = img.shape
    x, y = np.clip(x - 0.5, 0, w - 1), np.clip(y - 0.5, 0, h - 1)
    x0, y0 = np.minimum(x.astype(int), w - 2), np.minimum(y.astype(int), h - 2)
    fx, fy = x - x0, y - y0
    i = img.astype(float)
    return (i[y0, x0] * (1 - fx) * (1 - fy) + i[y0, x0 + 1] * fx * (1 - fy)
            + i[y0 + 1, x0] * (1 - fx) * fy + i[y0 + 1, x0 + 1] * fx * fy)
