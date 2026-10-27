"""PROTOTYPE (#46), throwaway: a quick test photo for aiming the camera.

Takes one 16 MP frame (autofocus, then locked), finds the markers, and saves a
¼-size preview with each page outlined and labelled with its page number, U size,
markers read / printed, and px/mm. Prints the same per page.

    venv/bin/python aim.py [--af | --lens 3.65]   # -> runs/aim-<time>.jpg (preview) and -full.jpg
"""

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pupil_apriltags import Detector

from read_hw import CORNERS, HERE, capture, homography, px_per_mm

ap = argparse.ArgumentParser()
ap.add_argument("--mode", default="16")
ap.add_argument("--af", action="store_true", help="autofocus once (it sometimes fails and leaves the lens at 0)")
ap.add_argument("--lens", type=float, default=3.65)
ap.add_argument("--exposure", type=int)
ap.add_argument("--gain", type=float)
args = ap.parse_args()

cards = {c["id"]: c for c in json.loads((HERE / "cards.json").read_text())}
printed = defaultdict(int)
for c in cards.values():
    printed[c["page"]] += 1
u_of = {c["page"]: c["u_mm"] for c in cards.values()}

img = capture(args)
stem = HERE / "runs" / f"aim-{time.strftime('%Y%m%d-%H%M%S')}"
stem.parent.mkdir(exist_ok=True)
img.save(f"{stem}-full.jpg", quality=92)
dets = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0).detect(np.asarray(img.convert("L")))

by_page = defaultdict(list)
for d in dets:
    if d.tag_id in cards:
        by_page[cards[d.tag_id]["page"]].append(d)

S = 4
small = img.resize((img.width // S, img.height // S))
draw = ImageDraw.Draw(small)
font = ImageFont.load_default(size=28)
print(f"frame {img.width}×{img.height}, markers {len(dets)}")
for p in sorted(printed):
    ds = by_page.get(p, [])
    line = f"page {p + 1} (U={u_of[p]}): {len(ds)}/{printed[p]} markers"
    if len(ds) >= 2:
        src = np.concatenate([np.array(cards[d.tag_id]["tag_center"]) + CORNERS * cards[d.tag_id]["tag_mm"] for d in ds])
        H = homography(src, np.concatenate([d.corners for d in ds]))
        ppm = px_per_mm(H, 105, 148)
        line += f", {ppm:.2f} px/mm"
        corners = np.array([[0, 0], [210, 0], [210, 297], [0, 297], [0, 0]], float)
        pts = np.c_[corners, np.ones(5)] @ H.T
        pts = pts[:, :2] / pts[:, 2:] / S
        draw.line([tuple(q) for q in pts], fill=(0, 200, 0), width=4)
        cx, cy = pts[:4].mean(0)
        draw.text((cx - 60, cy - 30), f"p{p + 1} U{u_of[p]}\n{len(ds)}/{printed[p]} {ppm:.2f}", fill=(255, 0, 0), font=font)
    for d in ds:
        draw.polygon([tuple(q / S) for q in d.corners], outline=(0, 255, 0), width=2)
    print(line)
small.save(f"{stem}.jpg", quality=85)
print(f"wrote {stem}.jpg")
