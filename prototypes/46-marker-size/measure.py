"""PROTOTYPE (#46), throwaway: how small can a tagStandard41h12 marker be?

Runs on the Pi. Takes N frames in the 16 MP mode with focus and exposure
locked, searches each for markers, and prints how often each printed size
was read, on each sheet in view. Sheet layout comes from make_sheets.py:
id = page * 100 + size_index * COPIES + copy.

    venv/bin/python measure.py --label desk-1.3m              # 30 frames, focus 0.77 dioptres
    venv/bin/python measure.py --label desk-1.3m --af         # autofocus once, then lock
    venv/bin/python measure.py --frames 1 --label aim         # quick look: is the sheet in view?

Writes runs/<label>-<time>.json (every detection) and .jpg (annotated, 1/4 size).
"""

import argparse
import json
import statistics
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image, ImageDraw
from pupil_apriltags import Detector

SIZES = list(range(8, 19))
COPIES = 6
PAGES = ["centre", "near", "far-left", "far-centre", "far-right"]
W, H = 4624, 3472  # the 16 MP sensor mode
# The detector's corners sit 0.714 of the printed width apart (measured on the
# rendered sheet), so printed width in px = corner side / 0.714.
CORNER_TO_PRINTED = 1 / 0.714


def where(tag_id: int):
    """(page, size_mm) for an ID on the sheets, or None if it isn't printed."""
    page, rest = divmod(tag_id, 100)
    if page >= len(PAGES) or rest >= len(SIZES) * COPIES:
        return None
    return page, SIZES[rest // COPIES]


def side_px(corners) -> float:
    return float(np.mean([np.linalg.norm(corners[i] - corners[(i + 1) % 4]) for i in range(4)]))


def open_camera(args):
    cam = Picamera2()
    cfg = cam.create_still_configuration(
        main={"size": (W, H), "format": "YUV420"}, raw={"size": (W, H)}, buffer_count=2
    )
    cam.configure(cfg)
    cam.start()
    time.sleep(1.0)  # let auto exposure settle

    if args.af:
        cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
        ok = cam.autofocus_cycle()
        lens = cam.capture_metadata()["LensPosition"]
        print(f"autofocus {'ok' if ok else 'FAILED'}: LensPosition {lens:.2f} dioptres (~{100 / max(lens, 0.01):.0f} cm)")
    else:
        lens = args.lens
    cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": lens})

    md = cam.capture_metadata()
    exposure = args.exposure or md["ExposureTime"]
    gain = args.gain or md["AnalogueGain"]
    cam.set_controls({"AeEnable": False, "ExposureTime": int(exposure), "AnalogueGain": float(gain)})
    time.sleep(0.5)
    for _ in range(3):  # drop frames taken before the locked settings applied
        cam.capture_metadata()
    md = cam.capture_metadata()
    print(f"locked: LensPosition {md.get('LensPosition', lens):.2f}, ExposureTime {md['ExposureTime']} us, "
          f"AnalogueGain {md['AnalogueGain']:.2f}, Lux {md.get('Lux', 0):.0f}")
    return cam, {"lens": lens, "exposure": md["ExposureTime"], "gain": md["AnalogueGain"]}


def grab_gray(cam) -> np.ndarray:
    return cam.capture_array("main")[:H, :W]  # Y plane of YUV420 is the gray image


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="run")
    ap.add_argument("--frames", type=int, default=30)
    ap.add_argument("--lens", type=float, default=0.77, help="dioptres = 1 / distance in m")
    ap.add_argument("--af", action="store_true", help="autofocus once, then lock")
    ap.add_argument("--exposure", type=int, help="us; default: lock what auto exposure chose")
    ap.add_argument("--gain", type=float)
    args = ap.parse_args()

    cam, settings = open_camera(args)
    det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0)

    reads = defaultdict(int)  # tag_id -> frames read
    margins = defaultdict(list)  # tag_id -> decision margins
    sides = defaultdict(list)  # tag_id -> corner side, px
    misreads = defaultdict(int)  # IDs not on the sheets
    log, times = [], []
    last_gray, last_dets = None, []

    for f in range(args.frames):
        gray = grab_gray(cam)
        t0 = time.perf_counter()
        dets = det.detect(gray)
        times.append(time.perf_counter() - t0)
        for d in dets:
            log.append({"frame": f, "id": d.tag_id, "hamming": d.hamming, "margin": d.decision_margin,
                        "corners": d.corners.tolist()})
            if where(d.tag_id) is None:
                misreads[d.tag_id] += 1
                continue
            reads[d.tag_id] += 1
            margins[d.tag_id].append(d.decision_margin)
            sides[d.tag_id].append(side_px(d.corners))
        print(f"\rframe {f + 1}/{args.frames}: {len(dets)} markers, search {times[-1]:.2f} s", end="", flush=True)
        last_gray, last_dets = gray, dets
    print()
    cam.stop()

    # One table per sheet in view.
    n = args.frames
    pages = sorted({where(i)[0] for i in reads})
    if not pages:
        print("No sheet markers read. Is the sheet in view and in focus? Try --frames 1 and look at the .jpg.")
    for p in pages:
        print(f"\n== {PAGES[p]} sheet ==  pass = all {COPIES} copies read in >= {n - max(1, n // 30)}/{n} frames, no misreads")
        print(f"{'size':>5} {'reads':>9} {'worst copy':>10} {'min margin':>10} {'px across':>9} {'px/cell':>7}  ")
        px_per_mm = []
        for s, size in enumerate(SIZES):
            ids = [p * 100 + s * COPIES + k for k in range(COPIES)]
            total = sum(reads[i] for i in ids)
            worst = min(reads[i] for i in ids)
            ms = [m for i in ids for m in margins[i]]
            ss = [x for i in ids for x in sides[i]]
            across = statistics.median(ss) * CORNER_TO_PRINTED if ss else 0
            if ss:
                px_per_mm.append(across / size)
            ok = worst >= n - max(1, n // 30) and not misreads
            print(f"{size:>3}mm {total:>4}/{n * COPIES:<4} {worst:>5}/{n:<4} {min(ms) if ms else 0:>10.0f} "
                  f"{across:>9.1f} {across / 9:>7.2f}  {'PASS' if ok else '-'}")
        if px_per_mm:
            print(f"table detail here: ~{statistics.median(px_per_mm):.2f} px/mm in the 16 MP frame")
    print(f"\nmisreads (IDs not printed): {dict(misreads) or 'none'}")
    print(f"search time per frame: median {statistics.median(times):.2f} s, max {max(times):.2f} s")

    out = Path(__file__).parent / "runs"
    out.mkdir(exist_ok=True)
    stem = out / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
    stem.with_suffix(".json").write_text(json.dumps(
        {"label": args.label, "frames": n, "settings": settings, "search_s": times, "detections": log}))
    im = Image.fromarray(last_gray).convert("RGB")
    draw = ImageDraw.Draw(im)
    for d in last_dets:
        colour = (0, 200, 0) if where(d.tag_id) else (255, 0, 0)
        draw.polygon([tuple(c) for c in d.corners], outline=colour, width=6)
        draw.text(tuple(d.corners[0]), str(d.tag_id), fill=colour, font_size=40)
    im.resize((W // 4, H // 4)).save(stem.with_suffix(".jpg"), quality=85)
    print(f"saved {stem}.json and .jpg")


if __name__ == "__main__":
    main()
