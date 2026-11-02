"""PROTOTYPE (#115): once a second, CPU busy per core, the vision and app processes' CPU, temperature, throttling
and GPU busy (v3d gpu_stats), to runs/sysmon-*.jsonl. Prints a one-line summary.

    python3 sysmon.py LABEL SECONDS
"""
import glob, json, os, subprocess, sys, time
label, secs = sys.argv[1], float(sys.argv[2])
HZ = os.sysconf("SC_CLK_TCK")
def cores():
    out = {}
    for l in open("/proc/stat"):
        if l.startswith("cpu") and l[3].isdigit():
            f = list(map(int, l.split()[1:])); out[l.split()[0]] = (sum(f), f[3] + f[4])
    return out
def procs():
    tot = {"vision": 0, "app": 0}
    for p in glob.glob("/proc/[0-9]*"):
        try:
            cmd = open(p + "/cmdline", "rb").read().replace(b"\0", b" ").decode()
            st = open(p + "/stat").read().rsplit(")", 1)[1].split()
        except OSError:
            continue
        k = "vision" if "vision.py --port" in cmd else "app" if "snap-147" in cmd and "electron" in cmd else None
        if k:
            tot[k] += int(st[11]) + int(st[12])
    return tot
def gpu():
    for l in open(glob.glob("/sys/devices/platform/axi/*v3d*/gpu_stats")[0]):
        if l.startswith("render"):
            _, ts, _, rt = l.split(); return int(ts), int(rt)
def vc(*a):
    return subprocess.run(["vcgencmd", *a], capture_output=True, text=True).stdout.strip()
os.makedirs(os.path.expanduser("~/snap-147/runs"), exist_ok=True)
log = open(os.path.expanduser(f"~/snap-147/runs/sysmon-{label}-{time.strftime('%Y%m%d-%H%M%S')}.jsonl"), "a")
c0, p0, g0, t0 = cores(), procs(), gpu(), time.time()
end, rows = t0 + secs, []
while time.time() < end:
    time.sleep(1)
    c1, p1, g1, t1 = cores(), procs(), gpu(), time.time()
    busy = {k: round(100 * (1 - (c1[k][1] - c0[k][1]) / max(1, c1[k][0] - c0[k][0])), 1) for k in c1}
    pc = {k: round(100 * (p1[k] - p0[k]) / HZ / (t1 - t0), 1) for k in p1}
    gb = round(100 * (g1[1] - g0[1]) / max(1, g1[0] - g0[0]), 1)
    row = {"t": round(t1, 2), "core_busy": busy, "proc_pct": pc, "gpu_render_pct": gb,
           "temp": vc("measure_temp").split("=")[-1], "throttled": vc("get_throttled").split("=")[-1], "arm_hz": vc("measure_clock", "arm").split("=")[-1]}
    rows.append(row); log.write(json.dumps(row) + "\n"); log.flush()
    c0, p0, g0, t0 = c1, p1, g1, t1
avg = lambda f: round(sum(f(r) for r in rows) / len(rows), 1)
print(json.dumps({"label": label, "s": len(rows), "core_busy": {k: avg(lambda r: r["core_busy"][k]) for k in rows[0]["core_busy"]},
                  "proc_pct": {k: avg(lambda r: r["proc_pct"][k]) for k in rows[0]["proc_pct"]}, "gpu_render_pct": avg(lambda r: r["gpu_render_pct"]),
                  "temp_last": rows[-1]["temp"], "throttled": sorted({r["throttled"] for r in rows}), "arm_hz_min": min(int(r["arm_hz"]) for r in rows)}))
