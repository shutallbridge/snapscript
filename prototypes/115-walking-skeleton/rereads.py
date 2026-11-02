"""PROTOTYPE (#115): over the last N s of the newest vision log, how many handwritten cards went read -> reading
(a re-read; with nothing moving, all false), plus marker misses and the image brightness settings."""
import glob, json, os, sys, time
f = max(glob.glob(os.path.expanduser("~/snap-115/runs/vision-*.jsonl")), key=os.path.getmtime)
rows = [json.loads(l) for l in open(f)]
rows = [r for r in rows if r["t_cap"] > time.time() - float(sys.argv[1])]
prev, rereads, who = {}, 0, {}
for r in rows:
    for c in r.get("state") or []:
        s = (c.get("hw") or {}).get("state")
        if prev.get(c["marker"]) == "read" and s == "reading":
            rereads += 1; who[c["marker"]] = who.get(c["marker"], 0) + 1
        prev[c["marker"]] = s
allm = set().union(*[r["seen"] for r in rows])
miss = sum(m not in r["seen"] for r in rows for m in allm)
dur = rows[-1]["t_cap"] - rows[0]["t_cap"]
print(f"{sys.argv[2]}: {dur:.0f} s, exp {rows[-1]['exp_ms']} ms gain {rows[-1]['gain']}, cycle {dur / len(rows):.2f} s, "
      f"misses {100 * miss / (len(rows) * len(allm)):.1f}%, false re-reads {rereads} ({60 * rereads / dur:.1f}/min) {who}")
