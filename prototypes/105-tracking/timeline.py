"""PROTOTYPE (#105), throwaway: per-marker seen/unseen timeline for a clip, from detect_all.py's output.

    python3 timeline.py data/c2-hands 2
"""

import json
import sys

base, dec = sys.argv[1], sys.argv[2]
rows = [json.loads(l) for l in open(f"{base}.det{dec}.jsonl")]
t0 = rows[0]["t"]
ids = sorted({int(k) for r in rows for k in r["m"]})
print(f"{len(rows)} frames, search {sum(r['s'] for r in rows) / len(rows):.3f} s avg, max {max(r['s'] for r in rows):.3f}")
step = max(1, len(rows) // 150)
print("      " + "".join(str(int((r["t"] - t0) // 10)) if i % 76 == 0 else " " for i, r in enumerate(rows[::step])))
for tid in ids:
    line = "".join("#" if str(tid) in r["m"] else "." for r in rows[::step])
    gaps, run = [], 0
    for r in rows:
        if str(tid) in r["m"]:
            if run:
                gaps.append(run)
            run = 0
        else:
            run += 1
    gaps.append(run) if run else None
    print(f"{tid:5d} {line}  gaps(frames) {gaps}")
