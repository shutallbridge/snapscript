"""PROTOTYPE (#128), throwaway: where a page lies, from its marker(s). Shared by vision.py and test_geometry.py.

A page's markers sit at known spots on the paper (pages.json, mm). Every detected marker gives 4 corners
whose paper position is known, so all the corners of a page's markers fit one homography, paper mm ->
camera px, and the paper's own corners follow. A 4-corner homography from one 13 mm marker can't pin down
perspective across a 297 mm page (the offline test puts corners 5 cm off), so the default fit is a similarity:
rotation, one scale and a shift. It is done on the table plane (the detections mapped through the camera-to-
projector line-up first), where a flat page really is a rotated, shifted rectangle, as long as the projector's
pixels are about square on the table.
"""

import numpy as np

# The detector's quad is the tag's black border, which for tagStandard41h12 spans the middle 5 of its
# 9 cells. Checked by test_geometry.py on a rendered page.
QUAD = 5 / 9
# pupil_apriltags corner order, in the tag's own frame (x right, y down, as printed), as offsets from
# the tag centre in units of half the quad side. Checked by test_geometry.py.
CORNER_ORDER = np.array([[-1, 1], [1, 1], [1, -1], [-1, -1]], float)


def fit_homography(src, dst):
    """Least-squares homography (DLT, normalised) taking src points to dst points, both (n, 2), n >= 4."""
    src, dst = np.asarray(src, float), np.asarray(dst, float)

    def norm(p):
        c = p.mean(0)
        s = np.sqrt(2) / max(np.mean(np.linalg.norm(p - c, axis=1)), 1e-9)
        return np.array([[s, 0, -s * c[0]], [0, s, -s * c[1]], [0, 0, 1]])

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
    """Least-squares rotation + uniform scale + shift taking src to dst (Umeyama), as a 3x3 matrix."""
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


def apply(h, pts):
    pts = np.asarray(pts, float)
    p = np.c_[pts, np.ones(len(pts))] @ np.asarray(h).T
    return p[:, :2] / p[:, 2:3]


def marker_corners_mm(top_left, size):
    """Paper mm of a printed marker's 4 detected corners, in the detector's order."""
    centre = np.asarray(top_left, float) + size / 2
    return centre + CORNER_ORDER * (QUAD * size / 2)


def page_corners(detections, page, size, paper, fit="similarity", to_plane=None):
    """Paper corners (TL, TR, BR, BL), from whichever of the page's markers were detected, in camera px, or
    in the plane to_plane (a homography from camera px) maps to. detections: {tag_id: (4, 2) corners}.
    Returns (corners, ids used) or (None, [])."""
    src, dst, used = [], [], []
    for tid, top_left in page["markers"].items():
        if int(tid) in detections:
            src.extend(marker_corners_mm(top_left, size))
            dst.extend(detections[int(tid)] if to_plane is None else apply(to_plane, detections[int(tid)]))
            used.append(int(tid))
    if not used:
        return None, []
    w, h = paper
    m = fit_homography(src, dst) if fit == "homography" else fit_similarity(src, dst)
    return apply(m, [[0, 0], [w, 0], [w, h], [0, h]]), used
