"""The line-up (camera px -> table mm), a marker's pose, and the card sheet's layout (#101)."""

import json
import os
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

    The file, owned by calibration (#172) and kept on the Pi:

        {"k1": 0.0, "H": 3x3, "mm_per_projector_height": 781.0, "image_size": [w, h],
         "exposure": {"ms": 48.0, "gain": 1.0}, "saved": "2026-11-03 21:14:05"}

    `image_size` is only needed with a lens term. `exposure` is the camera's fixed exposure for the room; without
    it the camera runs on auto exposure. `saved` says when calibration saved it."""
    k1: float
    H: np.ndarray
    mm_per_ph: float
    image_size: tuple | None = None
    exposure: tuple | None = None   # (ms, gain)

    @classmethod
    def load(cls, path):
        d = json.loads(Path(path).read_text())
        size, ex = d.get("image_size"), d.get("exposure")
        return cls(float(d.get("k1", 0.0)), np.array(d["H"], float), float(d["mm_per_projector_height"]),
                   tuple(size) if size else None, (float(ex["ms"]), float(ex["gain"])) if ex else None)

    def save(self, path, saved: str):
        """Write the file whole, then put it in place, so a crash never leaves half a line-up."""
        d = {"k1": self.k1, "H": np.asarray(self.H).tolist(), "mm_per_projector_height": self.mm_per_ph}
        if self.image_size:
            d["image_size"] = list(self.image_size)
        if self.exposure:
            d["exposure"] = {"ms": self.exposure[0], "gain": self.exposure[1]}
        d["saved"] = saved
        path = Path(path)
        tmp = path.with_name(path.name + ".tmp")
        tmp.write_text(json.dumps(d, indent=1) + "\n")
        os.replace(tmp, path)

    def undistort(self, px):
        px = np.asarray(px, float)
        if not self.k1:
            return px
        return undistort(px, self.k1, self.image_size)

    def to_ph(self, px):
        return apply(self.H, self.undistort(px))

    def to_mm(self, px):
        return self.to_ph(px) * self.mm_per_ph

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


def undistort(px, k1, image_size):
    """Undo one radial lens term about the picture's centre, in units of its half diagonal."""
    px = np.asarray(px, float)
    ctr = np.array(image_size, float) / 2
    q = (px - ctr) / np.hypot(*ctr)
    return ctr + (px - ctr) * (1 + k1 * (q ** 2).sum(-1, keepdims=True))


def fit_homography(src, dst):
    """The homography taking src to dst (4 or more points), least squares on the normalised DLT."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)

    def norm(p):
        m, s = p.mean(0), np.sqrt(2) / max(np.linalg.norm(p - p.mean(0), axis=1).mean(), 1e-12)
        return np.array([[s, 0, -s * m[0]], [0, s, -s * m[1]], [0, 0, 1]])

    ts, td = norm(src), norm(dst)
    a, b = apply(ts, src), apply(td, dst)
    rows = []
    for (x, y), (u, v) in zip(a, b):
        rows.append([-x, -y, -1, 0, 0, 0, u * x, u * y, u])
        rows.append([0, 0, 0, -x, -y, -1, v * x, v * y, v])
    h = np.linalg.svd(np.array(rows))[2][-1].reshape(3, 3)
    h = np.linalg.inv(td) @ h @ ts
    return h / h[2, 2]


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
