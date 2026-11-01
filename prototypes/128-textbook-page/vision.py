"""PROTOTYPE (#128), throwaway: where the textbook pages lie, for table.html. Runs on the Pi.

Loops: grab a frame, find markers, place each page on the table (geometry.py), decide the current page, and
write state.json for table.html. Watches control.json (written over SSH) for one-off requests:

    {"calibrate": n}  bump n: table.html shows tags, this maps camera px to projector space (calib.json)
    {"snap": n}       bump n: save the frame, with what was found drawn on it, to runs/
    {"view": {...}}   read by table.html only (margin, outline, lit), see README.md

Projector space: x across in units of the projector's height (0 .. aspect), y down (0 .. 1).

    venv/bin/python vision.py --label rig-1 [--res full|half] [--rule sticky|inview] [--fit similarity|homography]
"""

import argparse
import json
import os
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image, ImageDraw
from pupil_apriltags import Detector

from geometry import CORNER_ORDER, QUAD, apply, fit_homography, page_corners

HERE = Path(__file__).parent
RES = {"full": (4624, 3472), "half": (2312, 1736)}


def write_json(path: Path, data) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(data))
    os.replace(tmp, path)


def read_json(path: Path, default):
    try:
        return json.loads(path.read_text())
    except (OSError, ValueError):
        return default


def open_camera(size, lens):
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": size, "format": "YUV420"}, raw={"size": RES["full"]}, buffer_count=2))
    cam.start()
    time.sleep(1.0)
    if lens is None:
        cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
        ok = cam.autofocus_cycle()
        lens = cam.capture_metadata()["LensPosition"]
        print(f"autofocus {'ok' if ok else 'FAILED'}: LensPosition {lens:.2f}")
    cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": lens})
    return cam


def calib_points(calib, aspect):
    """Each calibration tag's 4 detected corners in projector space, the same layout table.html draws."""
    pts = {}
    for i, tid in enumerate(calib["ids"]):
        col, row = i % calib["cols"], i // calib["cols"]
        centre = np.array([(col + 0.5) / calib["cols"] * aspect, (row + 0.5) / calib["rows"]])
        pts[tid] = centre + CORNER_ORDER * (QUAD * calib["size"] / 2)
    return pts


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", default="run")
    ap.add_argument("--res", choices=RES, default="full")
    ap.add_argument("--decimate", type=float, default=1.0)
    ap.add_argument("--lens", type=float, help="dioptres; default: autofocus once at start")
    ap.add_argument("--aspect", type=float, default=16 / 9, help="projector width / height")
    ap.add_argument("--grace", type=float, default=1.0, help="s a page stays 'in view' after its last read")
    ap.add_argument("--rule", choices=["sticky", "inview"], default="sticky",
                    help="sticky: the current page stays until another page arrives; inview: none when no page is seen")
    ap.add_argument("--fit", choices=["similarity", "homography"], default="similarity")
    ap.add_argument("--smooth", type=float, default=0.25,
                    help="share of each new reading averaged into a still page's place (1 = off)")
    ap.add_argument("--jump", type=float, default=12, help="mm a corner must move for the page to count as moved")
    ap.add_argument("--hold", type=float, default=2, help="mm the average must move before what's projected moves")
    args = ap.parse_args()

    book = json.loads((HERE / "pages.json").read_text())
    pages = {p["key"]: p for p in book["pages"]}
    page_of = {int(t): k for k, p in pages.items() for t in p["markers"]}
    calib_ids = set(book["calib"]["ids"])
    runs = HERE / "runs"
    runs.mkdir(exist_ok=True)
    log = open(runs / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}.jsonl", "a")

    size = RES[args.res]
    cam = open_camera(size, args.lens)
    det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=args.decimate, refine_edges=1)
    cal = read_json(HERE / "calib.json", None)
    to_proj = np.array(cal["H"]) if cal else None
    ctrl_seen = read_json(HERE / "control.json", {})
    seen = {}       # page key -> {"last": t, "since": t, "corners": [...], "markers": [...]}
    current = None
    mode = "run"
    print(f"running: {size[0]}x{size[1]}, rule {args.rule}, fit {args.fit}, smooth {args.smooth} jump {args.jump} mm hold {args.hold} mm, "
          f"{'calibrated' if cal else 'NOT calibrated: bump calibrate in control.json'}")

    def publish(extra=None):
        now = time.time()
        write_json(HERE / "state.json", {
            "t": now, "mode": mode, "aspect": args.aspect, "calibrated": to_proj is not None, "rule": args.rule,
            "current": current, "calib": book["calib"],
            "pages": [{"key": k, "corners": s["corners"], "markers": s["markers"], "age": round(now - s["last"], 2)}
                      for k, s in seen.items() if now - s["last"] < args.grace and s["corners"] is not None],
            **(extra or {})})

    while True:
        ctrl = read_json(HERE / "control.json", {})
        if ctrl.get("calibrate", 0) != ctrl_seen.get("calibrate", 0):
            mode = "calibrate"
            publish()
            time.sleep(2.0)  # table.html polls, and the camera's exposure settles on the projected tags
            want = calib_points(book["calib"], args.aspect)
            for attempt in range(5):
                gray = cam.capture_array("main")[: size[1], : size[0]]
                found = {d.tag_id: d.corners for d in det.detect(gray) if d.tag_id in calib_ids}
                if len(found) >= 4:
                    break
            # fit tag centres, not corners: projector glare grows every projected tag ~4% about its centre on the rig
            src = np.array([found[t].mean(0) for t in found]) if found else np.zeros((0, 2))
            dst = np.array([want[t].mean(0) for t in found]) if found else np.zeros((0, 2))
            if len(found) >= 4:
                to_proj = fit_homography(src, dst)
                err = np.linalg.norm(apply(to_proj, src) - dst, axis=1) * 1000
                write_json(HERE / "calib.json", {"H": to_proj.tolist(), "aspect": args.aspect, "tags": sorted(found),
                                                 "err_milli_height": [round(float(err.mean()), 2), round(float(err.max()), 2)]})
                print(f"calibrated from {len(found)}/{len(want)} tags: mean {err.mean():.2f}, max {err.max():.2f} "
                      f"thousandths of the projector height")
            else:
                print(f"calibration FAILED: {len(found)} of {len(want)} tags seen")
            Image.fromarray(gray).resize((size[0] // 4, size[1] // 4)).save(runs / f"calib-{time.strftime('%H%M%S')}.jpg")
            mode = "run"

        gray = cam.capture_array("main")[: size[1], : size[0]]
        t0 = time.perf_counter()
        dets = det.detect(gray)
        search = time.perf_counter() - t0
        now = time.time()
        found = {d.tag_id: d.corners for d in dets}
        unknown = sorted(t for t in found if t not in page_of and t not in calib_ids)

        for key, page in pages.items():
            corners, used = page_corners(found, page, book["marker"], book["paper"], args.fit, to_proj)
            if not used:
                continue
            s = seen.get(key)
            if s is None or now - s["last"] >= args.grace:
                s = seen[key] = {"since": now}  # arrived (again)
            shown = corners
            if to_proj is not None and s.get("avg") is not None:
                avg, shown = np.array(s["avg"]), np.array(s["corners"])
                mm = book["paper"][0] / np.linalg.norm(corners[1] - corners[0])  # mm per projector unit
                if np.linalg.norm(corners - avg, axis=1).max() * mm < args.jump:
                    corners = avg + args.smooth * (corners - avg)  # still: average into where it lies
                # what's projected only moves once the average has moved past --hold
                if np.linalg.norm(corners - shown, axis=1).max() * mm >= args.hold:
                    shown = corners
            s.update(last=now, avg=corners.tolist() if to_proj is not None else None,
                     corners=shown.tolist() if to_proj is not None else None, markers=used)

        in_view = [k for k, s in seen.items() if now - s["last"] < args.grace]
        newest = max(in_view, key=lambda k: seen[k]["since"], default=None)
        if args.rule == "inview":
            current = newest
        elif newest is not None and (current not in in_view or seen[newest]["since"] > seen[current]["since"]):
            current = newest

        publish({"search_s": round(search, 3), "unknown_ids": unknown})
        log.write(json.dumps({"t": now, "search_s": round(search, 3), "current": current,
                              "found": {int(t): c.tolist() for t, c in found.items()},
                              "pages": {k: seen[k]["corners"] for k in in_view}}) + "\n")
        log.flush()
        print(f"\r{search:.2f} s · {len(dets)} markers · in view {in_view or '-'} · current {current}"
              f"{' · unknown ' + str(unknown) if unknown else ''}      ", end="", flush=True)

        if ctrl.get("snap", 0) != ctrl_seen.get("snap", 0):
            im = Image.fromarray(gray).convert("RGB")
            draw = ImageDraw.Draw(im)
            for d in dets:
                draw.polygon([tuple(c) for c in d.corners], outline=(0, 200, 0), width=6)
                draw.text(tuple(d.corners[0]), str(d.tag_id), fill=(0, 200, 0), font_size=40)
            for key in in_view:  # the paper outline the projector cuts out, brought back into the camera image
                if seen[key]["corners"] is not None:
                    draw.polygon([tuple(c) for c in apply(np.linalg.inv(to_proj), seen[key]["corners"])], outline=(255, 60, 0), width=6)
            name = f"snap-{args.label}-{time.strftime('%H%M%S')}.jpg"
            im.resize((size[0] // 2, size[1] // 2)).save(runs / name, quality=88)
            print(f"\nsaved runs/{name}")
        ctrl_seen = ctrl


if __name__ == "__main__":
    main()
