"""PROTOTYPE (#105), throwaway: cut a card's whole face (and its whiteboard) out of recorded frames using only
its marker's pose and the sheet layout from #101. Runs on the Pi.

Card frame, in mm: x along the card from its left end, y down from its top edge. The 13 mm marker is centred in
the 17 mm marker zone, so its centre is (8.5, 15). pupil_apriltags' corners are the black border, 5 of the
tag's 9 cells = 7.22 mm, in CORNER_ORDER (x right, y down, as printed).

    ~/marker46/venv/bin/python crops.py CLIP TAG LENGTH_U WORD_LETTERS OUT.png [EVERY_N]
"""

import json
import sys

import numpy as np
from PIL import Image

from geometry import CORNER_ORDER, fit_homography, apply

base, tag, L, letters, out = sys.argv[1], sys.argv[2], int(sys.argv[3]), int(sys.argv[4]), sys.argv[5]
every = int(sys.argv[6]) if len(sys.argv) > 6 else 15
PX = 6  # output px per mm
half = 13 * 5 / 9 / 2
wb_x0 = 17 + 1.5 + 3 + letters * 5.5 + 3
wb = (wb_x0, 3, L * 30 - 3, 27)

meta = json.loads(open(base + ".json").read())
W, H = meta["w"], meta["h"]
v = np.memmap(base + ".y", np.uint8, "r").reshape(-1, H, W)
rows = [json.loads(l) for l in open(base + ".det2.jsonl")]
mk_mm = np.array([8.5, 15]) + CORNER_ORDER * half

tiles = []
for r in rows[::every]:
    if tag not in r["m"]:
        continue
    corners = np.array(r["m"][tag][0])
    to_img = fit_homography(mk_mm, corners)
    # output pixel (u, v) -> card mm (u/PX - 2, v/PX - 2) -> image px; PIL wants output->input coefficients
    S = np.array([[1 / PX, 0, -2], [0, 1 / PX, -2], [0, 0, 1]])
    M = to_img @ S
    M = M / M[2, 2]
    tw, th = int((L * 30 + 4) * PX), int(34 * PX)
    face = Image.fromarray(np.array(v[r["i"]])).transform((tw, th), Image.PERSPECTIVE, M.flatten()[:8].tolist(), Image.BILINEAR)
    a = np.array(face.convert("RGB"))
    x0, y0, x1, y1 = [int((c + 2) * PX) for c in wb]
    a[y0, x0:x1] = a[y1, x0:x1] = [255, 0, 255]
    a[y0:y1, x0] = a[y0:y1, x1] = [255, 0, 255]
    tiles.append((r["t"] - rows[0]["t"], a))

sheet = Image.new("RGB", (tiles[0][1].shape[1], sum(t[1].shape[0] + 4 for t in tiles)), "black")
y = 0
for t, a in tiles:
    sheet.paste(Image.fromarray(a), (0, y))
    y += a.shape[0] + 4
sheet.save(out)
print(len(tiles), "tiles", [round(t, 1) for t, _ in tiles])
