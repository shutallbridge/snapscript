# /// script
# requires-python = ">=3.12"
# dependencies = ["numpy", "pillow", "pupil-apriltags", "pymupdf"]
# ///
"""PROTOTYPE (#128), throwaway: check geometry.py on the printed pages before the rig.

Renders results/pages.pdf at about the rig's resolution (4 px/mm: 16 MP across ~1.2 m), lays each page
on a grey table at a random spot and angle, seen through a mild camera tilt, with blur and noise, runs the real detector,
and reports how far the predicted paper corners land from the true ones, in mm.

    uv run test_geometry.py [--px-per-mm 4] [--trials 20]
"""

import argparse
import json
from pathlib import Path

import numpy as np
import pymupdf
from PIL import Image, ImageFilter
from pupil_apriltags import Detector

from geometry import apply, fit_homography, page_corners

HERE = Path(__file__).parent
FITS = ["similarity", "homography"]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--px-per-mm", type=float, default=4.0)
    ap.add_argument("--trials", type=int, default=20)
    args = ap.parse_args()
    book = json.loads((HERE / "pages.json").read_text())
    w, h = book["paper"]
    k = args.px_per_mm
    global CAMERA  # table mm -> image px: k px/mm, with a few degrees of tilt
    tilt = np.array([[1, 0.02, 0], [0.01, 1, 0], [0.00015, 0.0001, 1]])
    CAMERA = np.diag([k, k, 1]) @ tilt
    det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0, refine_edges=1)
    rng = np.random.default_rng(1)
    pdf = pymupdf.open(HERE / "results" / "pages.pdf")

    for page, pdfpage in zip(book["pages"], pdf):
        pix = pdfpage.get_pixmap(dpi=round(k * 25.4 * 2))  # render at 2x, place at 1x below
        paper = Image.frombytes("RGB", (pix.width, pix.height), pix.samples).convert("L")
        errs, missed = {f: [] for f in FITS}, 0
        for _ in range(args.trials):
            # the paper lies flat at a random spot and angle on the table (mm), and the camera sees the table
            # through a mild tilt: a fixed homography, table mm -> image px
            ang = rng.uniform(0, 2 * np.pi)
            c, s = np.cos(ang), np.sin(ang)
            rect = np.array([[0, 0], [w, 0], [w, h], [0, h]], float) - [w / 2, h / 2]
            on_table = rect @ np.array([[c, s], [-s, c]]) + [200, 200] + rng.uniform(-10, 10, 2)
            dst = apply(CAMERA, on_table)  # the paper's corners in the image
            # page_corners works on the table plane, as vision.py does through the line-up
            src = np.array([[0, 0], [paper.width, 0], [paper.width, paper.height], [0, paper.height]], float)
            inv = fit_homography(dst, src)  # output px -> paper image px, which PIL's transform wants
            table = Image.new("L", (1600, 1600), 90)
            warped = paper.transform((1600, 1600), Image.Transform.PERSPECTIVE, (inv / inv[2, 2]).ravel()[:8], Image.Resampling.BILINEAR, fillcolor=0)
            mask = Image.new("L", paper.size, 255).transform((1600, 1600), Image.Transform.PERSPECTIVE, (inv / inv[2, 2]).ravel()[:8], fillcolor=0)
            table.paste(warped, mask=mask)
            img = np.asarray(table.filter(ImageFilter.GaussianBlur(0.8)), float) + rng.normal(0, 4, (1600, 1600))
            found = {d.tag_id: d.corners for d in det.detect(np.clip(img, 0, 255).astype(np.uint8))}
            if not all(int(t) in found for t in page["markers"]):
                missed += 1
                continue
            for fit in FITS:
                corners, _ = page_corners(found, page, book["marker"], book["paper"], fit, to_plane=np.linalg.inv(CAMERA))
                errs[fit].append(np.linalg.norm(corners - on_table, axis=1).max())
        n = len(page["markers"])
        for fit in FITS:
            e = np.array(errs[fit])
            print(f'page {page["key"]:>3} ({n} marker{"s" if n > 1 else ""}), {fit:>10}: worst corner off by median '
                  f"{np.median(e):.1f} mm, max {e.max():.1f} mm over {len(e)} trials; {missed} missed")


if __name__ == "__main__":
    main()
