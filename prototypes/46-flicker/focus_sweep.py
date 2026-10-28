"""PROTOTYPE (#46), throwaway: find the focus setting for the rig.

Runs on the Pi. Locks exposure, then steps LensPosition and takes one 16 MP
frame at each. Finds every tagStandard41h12 marker and scores sharpness in a
patch around it (variance of the Laplacian), split into the near half of the
frame (top, by the stand) and the far half (bottom). Saves a crop of the
sharpest-near and sharpest-far marker at every step for a by-eye check.

    venv/bin/python focus_sweep.py                       # 3.40 .. 3.90 in 0.05 steps
    venv/bin/python focus_sweep.py --lo 3.5 --hi 3.8 --step 0.02
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image
from pupil_apriltags import Detector

W, H = 4624, 3472
HERE = Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("--lo", type=float, default=3.40)
ap.add_argument("--hi", type=float, default=3.90)
ap.add_argument("--step", type=float, default=0.05)
args = ap.parse_args()

cam = Picamera2()
cam.configure(cam.create_still_configuration(main={"size": (W, H), "format": "YUV420"}, buffer_count=2))
cam.start()
time.sleep(1.0)
md = cam.capture_metadata()
cam.set_controls({"AeEnable": False, "ExposureTime": md["ExposureTime"], "AnalogueGain": md["AnalogueGain"],
                  "AfMode": controls.AfModeEnum.Manual})
print(f"exposure locked: {md['ExposureTime']} us, gain {md['AnalogueGain']:.2f}, lux {md.get('Lux', 0):.0f}")

det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0)


def gray():
    return cam.capture_array("main")[:H, :W]


def lap_var(a):
    a = a.astype(np.float32)
    lap = a[1:-1, 1:-1] * 4 - a[:-2, 1:-1] - a[2:, 1:-1] - a[1:-1, :-2] - a[1:-1, 2:]
    return float(lap.var())


out = HERE / "runs" / f"focus-{time.strftime('%Y%m%d-%H%M%S')}"
out.mkdir(parents=True, exist_ok=True)
rows = []
spots = {}
cam.set_controls({"LensPosition": args.lo})
time.sleep(1.5)  # the first move can be long
lens = args.lo
while lens <= args.hi + 1e-6:
    cam.set_controls({"LensPosition": lens})
    time.sleep(0.6)
    for _ in range(2):  # drop frames from before the lens moved
        cam.capture_metadata()
    g = gray()
    dets = det.detect(g)
    halves = {"near": [], "far": []}
    best = {}
    for d in dets:
        cx, cy = d.center
        side = float(np.linalg.norm(d.corners[0] - d.corners[1]))
        r = int(side * 1.6)  # the marker plus some writing next to it
        x0, y0 = int(cx - r), int(cy - r)
        patch = g[max(y0, 0):y0 + 2 * r, max(x0, 0):x0 + 2 * r]
        if patch.size == 0:
            continue
        s = lap_var(patch)
        half = "near" if cy < H / 2 else "far"
        halves[half].append(s)
        if half not in best or d.decision_margin > best[half][0]:
            best[half] = (d.decision_margin, int(cx), int(cy), r)
    row = {"lens": round(lens, 3), "markers": len(dets)}
    for half, ss in halves.items():
        row[f"{half}_n"] = len(ss)
        row[f"{half}_sharp"] = round(float(np.median(ss)), 1) if ss else None
    rows.append(row)
    print(row, flush=True)
    for h, (_, cx, cy, _) in best.items():  # a fixed spot per half so crops compare like for like
        spots.setdefault(h, (cx, cy))
    for h, (cx, cy) in spots.items():
        R = 500  # ~23 cm of table at ~2.2 px/mm
        Image.fromarray(g[max(cy - R // 2, 0):cy + R // 2, max(cx - R, 0):cx + R]).save(out / f"{h}-{lens:.2f}.png")
    lens += args.step

cam.stop()
(out / "sweep.json").write_text(json.dumps({"exposure": md["ExposureTime"], "gain": md["AnalogueGain"], "rows": rows}, indent=1))
for h in ("near", "far"):
    ok = [r for r in rows if r[f"{h}_sharp"]]
    if ok:
        b = max(ok, key=lambda r: r[f"{h}_sharp"])
        print(f"sharpest {h}: LensPosition {b['lens']}")
print(out)
