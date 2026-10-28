"""PROTOTYPE (#46), throwaway: projector images that light the near or far half
of the table (split at a camera row), using calib.json.

    venv/bin/python halves.py --split 1900     # -> /tmp/flicker46-{nearlit,farlit,nearred}.png
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

W, H = 4624, 3472
PW, PH = 1920, 1080
HERE = Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("--split", type=int, default=1900, help="camera row between the near and far sheets")
args = ap.parse_args()

C2P = np.linalg.inv(np.array(json.loads((HERE / "calib.json").read_text())["proj_to_cam"]))


def to_proj(pts):
    q = np.c_[pts, np.ones(len(pts))] @ C2P.T
    return [tuple(p) for p in q[:, :2] / q[:, 2:]]


near = np.array([[-500, -500], [W + 500, -500], [W + 500, args.split], [-500, args.split]], float)
far = np.array([[-500, args.split], [W + 500, args.split], [W + 500, H + 500], [-500, H + 500]], float)
for name, poly, colour in [("nearlit", near, "white"), ("farlit", far, "white"), ("nearred", near, "#ff0000")]:
    im = Image.new("RGB", (PW, PH), "black")
    ImageDraw.Draw(im).polygon(to_proj(poly), fill=colour)
    im.save(f"/tmp/flicker46-{name}.png")
    print(f"/tmp/flicker46-{name}.png")
