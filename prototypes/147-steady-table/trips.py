"""PROTOTYPE (#115): the chain's timing, from every vision and latency log in runs/.

Per table state: frame exposed -> sent (vision), -> checked, -> lighting drawn, -> sketch's first frame (restarts).
Per card that came onto the table: its first sighting -> the state that counted it -> lit/drawn. The wait between
the card landing and the first frame that saw it (0 to one cycle) is not in the logs; half a cycle is its mean."""
import glob, json, os, statistics as S
R = os.path.expanduser("~/snap-147/runs/")
lat = {}
for f in glob.glob(R + "latency-*.jsonl"):
    for l in open(f):
        r = json.loads(l)
        lat[round(r["t_cap"], 3)] = r
def q(xs):
    xs = sorted(xs)
    return f"n {len(xs):3d}  median {S.median(xs)*1000:5.0f} ms  p90 {xs[int(.9*(len(xs)-1))]*1000:5.0f} ms  max {xs[-1]*1000:5.0f} ms" if xs else "n 0"
rs = list(lat.values())
print("frame exposed -> sent      ", q([r["t_sent"] - r["t_cap"] for r in rs]))
print("sent -> checked            ", q([r["t_check"] - r["t_sent"] for r in rs]))
print("checked -> lighting drawn  ", q([r["t_lit"] - r["t_check"] for r in rs if r.get("t_lit")]))
print("checked -> sketch 1st frame", q([r["t_drawn"] - r["t_check"] for r in rs if r.get("t_drawn")]))
enter, cycles = [], []
for f in glob.glob(R + "vision-*.jsonl"):
    rows = [json.loads(l) for l in open(f)]
    cycles += [b["t_cap"] - a["t_cap"] for a, b in zip(rows, rows[1:]) if b["t_cap"] - a["t_cap"] < 2]
    known = set()
    for r in rows:
        if not r.get("state"):
            continue
        for c in r["state"]:
            if c["track"] not in known and r is not rows[0]:
                L = lat.get(round(r["t_cap"], 3))
                if L and L.get("t_lit") and "first_cap" in c:
                    enter.append((r["t_cap"] - c["first_cap"], L["t_lit"] - c["first_cap"], (L.get("t_drawn") or L["t_lit"]) - c["first_cap"]))
        known |= {c["track"] for c in r["state"]}
print("vision cycle               ", q(cycles))
print("card first seen -> counted ", q([e[0] for e in enter]))
print("card first seen -> lit     ", q([e[1] for e in enter]))
print("card first seen -> on screen (lit, or sketch restarted)", q([e[2] for e in enter]))
