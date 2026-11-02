"""PROTOTYPE (#147), throwaway: where a join's measured gap comes from, frame by frame, from a vision log's raw poses.

For every pair of cards lying end to end (the second card's marker within 25 mm of where it would sit flush), per
frame: along (the gap along the line: + apart, - overlapping), across (sideways offset), with the line taken from
the first card's own angle ("own") and from the two cards' angles averaged ("mean"), and each card's angle noise.
Cards butted by hand at a true zero gap should read along ~ 0; the spread is the noise, the mean the bias.

    python3 gaps.py [runs/vision-....jsonl] [--last S]
"""
import glob, json, os, statistics as S, sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from cardlen import LEN, length_u  # noqa: E402
from track import CARDS  # noqa: E402

argv = sys.argv[1:]
last = float(argv.pop(argv.index("--last") + 1)) if "--last" in argv else None
args = [a for a in argv if not a.startswith("--")]
f = args[0] if args else max(glob.glob(os.path.expanduser("~/snap-147/runs/vision-*.jsonl")), key=os.path.getmtime)
rows = [json.loads(l) for l in open(f) if '"raw"' in l]
if last:
    rows = [r for r in rows if r["t_cap"] > rows[-1]["t_cap"] - last]


pairs, angles = {}, {}
for r in rows:
    raw = {int(k): v for k, v in r["raw"].items()}
    for m, (x, y, a) in raw.items():
        angles.setdefault(m, []).append(a)
    for m1, (x1, y1, a1) in raw.items():
        L = (LEN.get(m1) or length_u(CARDS[m1])) * 30
        for m2, (x2, y2, a2) in raw.items():
            if m1 == m2:
                continue
            d = np.array([x2 - x1, y2 - y1])
            out = {}
            for how, ang in (("own", a1), ("mean", a1 + ((a2 - a1 + 540) % 360 - 180) / 2)):
                u = np.array([np.cos(np.radians(ang)), np.sin(np.radians(ang))])
                v = np.array([-u[1], u[0]])
                out[how] = (float(d @ u - L), float(d @ v))
            if -15 < out["own"][0] < 25 and abs(out["own"][1]) < 15:
                pairs.setdefault((m1, m2), []).append(out)


def stat(xs):
    return f"{S.mean(xs):6.1f} ±{S.pstdev(xs):4.1f} [{min(xs):6.1f} {max(xs):6.1f}]"


print(f"{os.path.basename(f)}: {len(rows)} frames")
print(f"{'pair':52s} {'n':>4s}  {'along own':26s} {'along mean':26s} {'across own':26s} {'across mean':26s}")
for (m1, m2), xs in sorted(pairs.items()):
    if len(xs) < 5:
        continue
    name = f"{CARDS[m1]}({m1}) > {CARDS[m2]}({m2})"
    print(f"{name:52s} {len(xs):4d}  " + " ".join(stat([x[h][i] for x in xs]) for i, h in ((0, "own"), (0, "mean"), (1, "own"), (1, "mean"))))
print("\nangle noise per card (sd, deg):", ", ".join(f"{m}:{S.pstdev(a):.2f}" for m, a in sorted(angles.items()) if len(a) > 5))
