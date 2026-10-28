"""PROTOTYPE (#46), throwaway: which exposure times remove DLP banding?

Runs on the Pi with show.py running on the projector. For each projected field
and each exposure time, takes N frames in the 16 MP mode (focus and gain locked)
and measures, in a patch of bare table:

  banding  the camera reads rows one after another, so a DLP colour cycle that
           doesn't fit the exposure shows up as row-to-row bands. Each frame's
           grey row profile minus the average profile over all N frames (which
           cancels the wood grain; the bands move between frames), spread over
           rows, in grey levels (0-255; what the marker search sees).
           Also as % of the brightest colour channel.
  flicker  spread of whole-patch grey level between frames, in grey levels.
  clip     share of patch pixels at 250+ in any channel.

    venv/bin/python flicker_sweep.py --label 60hz
"""

import argparse
import json
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from PIL import Image

W, H = 4624, 3472
HERE = Path(__file__).parent
SHOW = Path("/tmp/flicker46-show")
FIELDS = {"black": "#000000", "white": "#ffffff", "grey": "#808080",
          "red": "#ff0000", "green": "#00ff00", "blue": "#0000ff"}
EXPOSURES_MS = [4.167, 6.25, 8.333, 10, 12.5, 16.667, 20, 25, 30, 33.333, 40, 41.667, 50]
# bare table, clear of the sheets (fractions of the frame)
ROI = (0.12, 0.22, 0.45, 0.78)  # x0, y0, x1, y1

ap = argparse.ArgumentParser()
ap.add_argument("--label", required=True)
ap.add_argument("--frames", type=int, default=8)
ap.add_argument("--lens", type=float, default=3.75)
ap.add_argument("--gain", type=float, default=1.0)
ap.add_argument("--fields", default=",".join(FIELDS))
ap.add_argument("--exposures", default=",".join(map(str, EXPOSURES_MS)))
args = ap.parse_args()

cam = Picamera2()
cam.configure(cam.create_still_configuration(main={"size": (W, H), "format": "RGB888"}, buffer_count=2))
cam.start()
cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": args.lens, "AeEnable": False,
                  "AwbEnable": False, "ColourGains": (1.8, 1.6), "AnalogueGain": args.gain})
time.sleep(1.0)

x0, y0, x1, y1 = int(ROI[0] * W), int(ROI[1] * H), int(ROI[2] * W), int(ROI[3] * H)
out = HERE / "runs" / f"flicker-{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"
out.mkdir(parents=True, exist_ok=True)


def grab(exposure_us):
    """One frame taken with the asked-for exposure (frames from before the change are dropped)."""
    for _ in range(8):
        req = cam.capture_request()
        md = req.get_metadata()
        if abs(md["ExposureTime"] - exposure_us) < 0.03 * exposure_us:
            a = req.make_array("main")
            req.release()
            return a, md
        req.release()
    raise RuntimeError(f"exposure {exposure_us} us never applied (got {md['ExposureTime']})")


rows = []
for field in args.fields.split(","):
    SHOW.write_text(FIELDS[field])
    time.sleep(0.5)
    for e_ms in map(float, args.exposures.split(",")):
        e_us = int(round(e_ms * 1000))
        cam.set_controls({"ExposureTime": e_us})
        profiles, means, clips = [], [], []
        for i in range(args.frames):
            a, md = grab(e_us)
            patch = a[y0:y1, x0:x1, ::-1].astype(np.float32)  # BGR -> RGB
            profiles.append(patch.mean(axis=1))  # rows x 3
            means.append(patch.mean(axis=(0, 1)))
            clips.append(float((patch >= 250).any(axis=2).mean()))
            if i == 0 and field in ("white", "grey"):
                Image.fromarray(a[::4, ::4, ::-1]).save(out / f"{field}-{e_ms:.2f}ms.jpg", quality=85)
        P = np.array(profiles)  # frames x rows x 3
        M = np.array(means)
        top = int(M.mean(axis=0).argmax())  # brightest channel
        G = P @ np.array([0.299, 0.587, 0.114])  # frames x rows, grey
        dev = G - G.mean(axis=0, keepdims=True)
        dev -= dev.mean(axis=1, keepdims=True)  # take out whole-frame changes
        band_grey = float(dev.std(axis=1).mean())
        C = P[:, :, top]
        band_pct = float(((C - C.mean(axis=0)) / C.mean(axis=0)).std(axis=1).mean() * 100)
        gm = M @ np.array([0.299, 0.587, 0.114])
        row = {"field": field, "exposure_ms": round(md["ExposureTime"] / 1000, 3),
               "level": [round(float(v), 1) for v in M.mean(axis=0)], "grey": round(float(gm.mean()), 1),
               "banding_grey": round(band_grey, 2), "banding_pct_top": round(band_pct, 2),
               "flicker_grey": round(float(gm.std()), 2), "clip": round(float(np.mean(clips)), 3)}
        rows.append(row)
        print(f"{field:6s} {row['exposure_ms']:7.3f} ms  grey {row['grey']:5.1f}  banding {band_grey:5.2f} lv "
              f"({band_pct:5.2f}% ch{top})  flicker {row['flicker_grey']:4.2f} lv  clip {row['clip']:.3f}", flush=True)
        np.save(out / f"profile-{field}-{e_ms:.2f}ms.npy", P[0])

SHOW.write_text("#000000")
cam.stop()
(out / "sweep.json").write_text(json.dumps({"label": args.label, "lens": args.lens, "gain": args.gain,
                                            "roi": ROI, "rows": rows}, indent=1))
print(out)
