"""PROTOTYPE (#115): share of frames each marker was missed in, over the last N s of the newest vision log."""
import glob, json, os, sys, time
f = max(glob.glob(os.path.expanduser("~/snap-115/runs/vision-*.jsonl")), key=os.path.getmtime)
rows = [json.loads(l) for l in open(f)]
rows = [r for r in rows if r["t_cap"] > time.time() - float(sys.argv[1])]
allm = set().union(*[r["seen"] for r in rows])
miss = {m: sum(m not in r["seen"] for r in rows) for m in sorted(allm)}
print(f"{sys.argv[2] if len(sys.argv) > 2 else ''}: {len(rows)} frames, {len(allm)} markers, misses {sum(miss.values())} "
      f"({100 * sum(miss.values()) / max(1, len(rows) * len(allm)):.1f}%) {dict((k, v) for k, v in miss.items() if v)}")
