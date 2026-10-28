"""PROTOTYPE (#46), throwaway: where do projector pixels land in the camera frame?

Runs on the Pi with show.py running. Projects one white square at a time on
black, finds it in the camera (difference from an all-black frame), and fits a
homography from projector pixels to camera pixels (16 MP frame), for the table
plane. Writes calib.json.

    venv/bin/python calibrate.py
"""

import json
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image, ImageDraw

W, H = 4624, 3472
PW, PH = 1920, 1080
HERE = Path(__file__).parent
SHOW = Path("/tmp/flicker46-show")
# dot centres in projector pixels: a 3 x 3 grid, inset from the edges
DOTS = [(x, y) for y in (200, 540, 880) for x in (300, 960, 1620)]
R = 30


def homography(src, dst):
    A = []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    h = np.linalg.svd(np.array(A, float))[2][-1]
    return (h / h[-1]).reshape(3, 3)


def show(img, name):
    path = Path(f"/tmp/flicker46-{name}.png")
    img.save(path)
    SHOW.write_text(f"image {path}")
    time.sleep(0.6)


cam = Picamera2()
cam.configure(cam.create_still_configuration(main={"size": (W, H), "format": "YUV420"}, buffer_count=2))
cam.start()
cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": 3.75, "AeEnable": False,
                  "ExposureTime": 16667, "AnalogueGain": 1.0})
time.sleep(1.0)


def gray():
    for _ in range(2):
        cam.capture_metadata()
    return cam.capture_array("main")[:H, :W].astype(np.int16)


show(Image.new("RGB", (PW, PH), "black"), "black")
base = gray()
found = []
for i, (x, y) in enumerate(DOTS):
    im = Image.new("RGB", (PW, PH), "black")
    ImageDraw.Draw(im).ellipse((x - R, y - R, x + R, y + R), fill="white")
    show(im, f"dot{i}")
    d = gray() - base
    mask = d > 40
    ys, xs = np.nonzero(mask)
    if len(xs) < 50:
        print(f"dot {i} at {x},{y}: not found")
        continue
    # keep the main blob: pixels near the brightest point
    cy, cx = np.unravel_index(np.argmax(np.where(mask, d, 0)), d.shape)
    near = (abs(xs - cx) < 300) & (abs(ys - cy) < 300)
    u, v = float(xs[near].mean()), float(ys[near].mean())
    found.append(((x, y), (u, v)))
    print(f"dot {i} at {x},{y} -> camera {u:.0f},{v:.0f} ({near.sum()} px)")

SHOW.write_text("#000000")
cam.stop()
Hm = homography([f[0] for f in found], [f[1] for f in found])
err = []
for (p, c) in found:
    q = Hm @ [p[0], p[1], 1]
    err.append(float(np.hypot(q[0] / q[2] - c[0], q[1] / q[2] - c[1])))
print(f"{len(found)} dots, fit error: max {max(err):.1f} px, mean {np.mean(err):.1f} px (camera)")
(HERE / "calib.json").write_text(json.dumps({"proj_to_cam": Hm.tolist(), "dots": found, "err_px": err}, indent=1))
