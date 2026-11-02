"""PROTOTYPE (#105), throwaway: run the marker search on every recorded frame. Runs on the Pi.

For each clip, writes <clip>.det.jsonl (one line per frame: time, search seconds, markers with corners and margin)
for quad_decimate 2 and 1, and <clip>.small.npy (every frame at 1/8 size) for change detection off the Pi.

    ~/marker46/venv/bin/python detect_all.py CLIP_PATH_WITHOUT_EXT...
"""

import json
import sys
import time

import numpy as np
from pupil_apriltags import Detector

for base in sys.argv[1:]:
    meta = json.loads(open(base + ".json").read())
    W, H, ts = meta["w"], meta["h"], meta["t"]
    v = np.memmap(base + ".y", np.uint8, "r").reshape(-1, H, W)
    small = np.stack([np.array(v[i, ::8, ::8]) for i in range(len(ts))])
    np.save(base + ".small.npy", small)
    for dec in (2.0, 1.0):
        det = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=dec, refine_edges=1)
        with open(f"{base}.det{int(dec)}.jsonl", "w") as out:
            for i, t in enumerate(ts):
                y = np.array(v[i])
                t0 = time.perf_counter()
                found = det.detect(y)
                s = time.perf_counter() - t0
                out.write(json.dumps({"i": i, "t": t, "s": round(s, 3), "m": {
                    d.tag_id: [d.corners.round(1).tolist(), round(d.decision_margin, 1)] for d in found}}) + "\n")
        print(base, "decimate", dec, "done", flush=True)
