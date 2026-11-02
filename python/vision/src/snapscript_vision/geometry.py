"""The line-up (camera px -> table mm), a marker's pose, and the card sheet's layout (#101)."""

import json
from dataclasses import dataclass
from pathlib import Path

import numpy as np

U_MM = 30.0                     # every card is 1U tall and a whole number of U long
MARKER_MM = 13.0                # a printed marker, 9 x 9 cells
QUAD = 5 / 9                    # the detector's quad spans the middle 5 of the marker's 9 cells
CARD_MARKER_CENTRE = (8.5, 15.0)  # sheet mm from a card's top-left corner
PAGE_MM = (210.0, 297.0)
PAGE_MARKER_CENTRE = (193.5, 280.5)  # the textbook page's marker, bottom-right (#128)

# The detector's corner order, in the marker's own frame (x right, y down, as printed), in half quad sides.
CORNER_ORDER = np.array([[-1, 1], [1, 1], [1, -1], [-1, -1]], float)
MARKER_CORNERS = CORNER_ORDER * (MARKER_MM * QUAD / 2)  # mm from the marker's centre


def apply(h, pts):
    pts = np.asarray(pts, float)
    p = np.c_[pts, np.ones(len(pts))] @ np.asarray(h, float).T
    return p[:, :2] / p[:, 2:3]


def wrap(deg):
    return (deg + 180.0) % 360.0 - 180.0


@dataclass(frozen=True)
class Lineup:
    """Camera px -> projector heights (one lens term undone, then a homography), times mm per projector height.

    The file (owned by calibration, #172): {"k1": 0.0, "H": 3x3, "mm_per_projector_height": 781.0,
    "image_size": [w, h]}. `image_size` is only needed with a lens term."""
    k1: float
    H: np.ndarray
    mm_per_ph: float
    image_size: tuple | None = None

    @classmethod
    def load(cls, path):
        d = json.loads(Path(path).read_text())
        size = d.get("image_size")
        return cls(float(d.get("k1", 0.0)), np.array(d["H"], float), float(d["mm_per_projector_height"]),
                   tuple(size) if size else None)

    def undistort(self, px):
        px = np.asarray(px, float)
        if not self.k1:
            return px
        ctr = np.array(self.image_size, float) / 2
        q = (px - ctr) / np.hypot(*ctr)
        return ctr + (px - ctr) * (1 + self.k1 * (q ** 2).sum(-1, keepdims=True))

    def to_mm(self, px):
        return apply(self.H, self.undistort(px)) * self.mm_per_ph

    def to_px(self, mm):
        """Table mm -> camera px: the homography undone, then the lens term put back (a few fixed-point steps)."""
        q = apply(np.linalg.inv(self.H), np.asarray(mm, float) / self.mm_per_ph)
        if not self.k1:
            return q
        ctr = np.array(self.image_size, float) / 2
        px = q.copy()
        for _ in range(8):
            r = (px - ctr) / np.hypot(*ctr)
            px = ctr + (q - ctr) / (1 + self.k1 * (r ** 2).sum(-1, keepdims=True))
        return px


def fit_similarity(src, dst):
    """Least-squares rotation, one scale and a shift taking src to dst (Umeyama), as a 3x3 matrix."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)
    ms, md = src.mean(0), dst.mean(0)
    a, b = src - ms, dst - md
    u, sig, vt = np.linalg.svd(b.T @ a / len(src))
    d = np.diag([1, np.sign(np.linalg.det(u @ vt))])
    r = u @ d @ vt
    scale = np.trace(np.diag(sig) @ d) / a.var(0).sum()
    m = np.eye(3)
    m[:2, :2], m[:2, 2] = scale * r, md - scale * r @ ms
    return m


def marker_pose(corners_mm):
    """(centre, angle in degrees, scale) of a marker, fitted from all four of its corners in table mm at once:
    position, angle and scale only, no perspective (#105, #132)."""
    m = fit_similarity(MARKER_CORNERS, corners_mm)
    angle = float(np.degrees(np.arctan2(m[1, 0], m[0, 0])))
    scale = float(np.hypot(m[0, 0], m[1, 0]))
    return m[:2, 2].copy(), angle, scale
