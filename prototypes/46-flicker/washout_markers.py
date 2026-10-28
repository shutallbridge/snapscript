"""PROTOTYPE (#46), throwaway: does projected light wash out the markers?

Runs on the Pi with show.py running and calib.json from calibrate.py. Finds the
marker sheets (make_sheets.py layout from prototype/46-marker-size), then for
each projected pattern and each exposure setting takes N frames in the 16 MP
mode and finds the smallest size whose every copy reads in >= N - N//30 frames,
per sheet, plus the paper's grey level on that sheet.

Patterns (aimed at the sheets with calib.json):
  black   projector on, all black
  white   all white
  litA    white over near + far-centre, black elsewhere
  litB    white over far-left + far-right, black elsewhere
  redA    like litA, in red (an error highlight)

    venv/bin/python washout_markers.py --settings 8.333:1,16.667:1 --frames 30
    venv/bin/python washout_markers.py --probe          # one frame each, levels only
"""

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image, ImageDraw
from pupil_apriltags import Detector

W, H = 4624, 3472
PW, PH = 1920, 1080
HERE = Path(__file__).parent
SHOW = Path("/tmp/flicker46-show")
SIZES = list(range(8, 19))
COPIES = 6
PAGES = ["centre", "near", "far-left", "far-centre", "far-right"]
GROUP_A = {"near", "far-centre", "centre"}


def where(tag_id):
    page, rest = divmod(tag_id, 100)
    if page >= len(PAGES) or rest >= len(SIZES) * COPIES:
        return None
    return page, SIZES[rest // COPIES]


ap = argparse.ArgumentParser()
ap.add_argument("--settings", default="8.333:1,16.667:1", help="exposure_ms:gain,...")
ap.add_argument("--patterns", default="black,white,litA,litB,redA")
ap.add_argument("--frames", type=int, default=30)
ap.add_argument("--probe", action="store_true")
ap.add_argument("--label", default="markers")
args = ap.parse_args()
if args.probe:
    args.frames = 1

P2C = np.array(json.loads((HERE / "calib.json").read_text())["proj_to_cam"])
C2P = np.linalg.inv(P2C)


def to_proj(pts):
    q = np.c_[pts, np.ones(len(pts))] @ C2P.T
    return q[:, :2] / q[:, 2:]


cam = Picamera2()
cam.configure(cam.create_still_configuration(main={"size": (W, H), "format": "YUV420"}, buffer_count=2))
cam.start()
cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": 3.75, "AeEnable": False,
                  "ExposureTime": 16667, "AnalogueGain": 2.0})
time.sleep(1.0)
det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0)


def grab(e_us, gain=None):
    for _ in range(12):
        req = cam.capture_request()
        md = req.get_metadata()
        if abs(md["ExposureTime"] - e_us) < 0.03 * e_us and (gain is None or abs(md["AnalogueGain"] - gain) < 0.05 * gain):
            g = req.make_array("main")[:H, :W].copy()
            req.release()
            return g
        req.release()
    raise RuntimeError("exposure never applied")


# Find the sheets once, with the projector black.
SHOW.write_text("#000000")
time.sleep(0.5)
g = grab(16667)
corners = defaultdict(list)
for d in det.detect(g):
    w = where(d.tag_id)
    if w:
        corners[PAGES[w[0]]].extend(d.corners.tolist())
boxes = {}
for page, pts in corners.items():
    pts = np.array(pts)
    (x0, y0), (x1, y1) = pts.min(0), pts.max(0)
    mx, my = (x1 - x0) * 0.15, (y1 - y0) * 0.15
    boxes[page] = (int(x0 - mx), int(y0 - my), int(x1 + mx), int(y1 + my))
print("sheets in view:", {p: b for p, b in boxes.items()})


def pattern(name):
    if name in ("black", "white"):
        return "#000000" if name == "black" else "#ffffff"
    im = Image.new("RGB", (PW, PH), "black")
    draw = ImageDraw.Draw(im)
    group = GROUP_A if name.endswith("A") else set(PAGES) - GROUP_A
    colour = "#ff0000" if name.startswith("red") else "#ffffff"
    for page, (x0, y0, x1, y1) in boxes.items():
        if page in group:
            draw.polygon([tuple(p) for p in to_proj(np.array([[x0, y0], [x1, y0], [x1, y1], [x0, y1]]))], fill=colour)
    path = Path(f"/tmp/flicker46-{name}.png")
    im.save(path)
    return f"image {path}"


def lit(page, name):
    if name == "white":
        return "lit"
    if name == "black":
        return "dark"
    group = GROUP_A if name.endswith("A") else set(PAGES) - GROUP_A
    return ("red" if name.startswith("red") else "lit") if page in group else "dark"


out = HERE / "runs" / f"washout-{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
out.mkdir(parents=True, exist_ok=True)
results = []
n = args.frames
need = n - n // 30
for name in args.patterns.split(","):
    SHOW.write_text(pattern(name))
    time.sleep(0.6)
    for setting in args.settings.split(","):
        e_ms, gain = map(float, setting.split(":"))
        e_us = int(round(e_ms * 1000))
        cam.set_controls({"ExposureTime": e_us, "AnalogueGain": gain})
        reads = defaultdict(int)
        misreads = 0
        for f in range(n):
            g = grab(e_us, gain)
            for d in det.detect(g):
                if where(d.tag_id):
                    reads[d.tag_id] += 1
                else:
                    misreads += 1
            if f == 0:
                levels = {}
                for page, (x0, y0, x1, y1) in boxes.items():
                    patch = g[max(y0, 0):y1, max(x0, 0):x1]
                    levels[page] = (float(np.percentile(patch, 90)), float(np.percentile(patch, 5)),
                                    float((patch >= 250).mean()))
                Image.fromarray(g[::4, ::4]).save(out / f"{name}-{e_ms:.2f}ms-g{gain:g}.jpg", quality=85)
        for page in boxes:
            p = PAGES.index(page)
            smallest = None
            for s, size in enumerate(SIZES):
                ids = [p * 100 + s * COPIES + k for k in range(COPIES)]
                if min(reads[i] for i in ids) >= need:
                    smallest = size
                    break
            paper, ink, clip = levels[page]
            row = {"pattern": name, "exposure_ms": e_ms, "gain": gain, "sheet": page, "light": lit(page, name),
                   "smallest_mm": smallest, "paper": round(paper), "ink": round(ink), "clip": round(clip, 3),
                   "misreads": misreads}
            results.append(row)
            print(f"{name:6s} {e_ms:6.2f} ms g{gain:<4g} {page:10s} {row['light']:5s} paper {paper:5.0f} ink {ink:4.0f} "
                  f"clip {clip:.3f}  smallest {smallest or '-':>2}{' mm' if smallest else ''}  misreads {misreads}",
                  flush=True)

SHOW.write_text("#000000")
cam.stop()
(out / "results.json").write_text(json.dumps({"frames": n, "boxes": boxes, "rows": results}, indent=1))
print(out)
