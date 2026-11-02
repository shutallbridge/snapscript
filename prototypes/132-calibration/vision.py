"""PROTOTYPE (#132, from #147 and #115), throwaway: the steady table's vision service, with calibration run from the
table app's settings menu.

#132: the vision service owns the line-up (calib.json here). The table app asks for each calibration step over the same
TCP socket (one JSON command per line, see Calib below) and draws what the step needs; this side takes the pictures,
fits, and answers with a "calib" message. Every frame message carries "lineup" (scale, drift, which planes are used)
and "cal" (calibration cards and ruler page markers seen, table mm), so the app can draw its boxes and check view.
- planes: a card's marker goes through the card-height line-up (step 2), a page's (and the ruler page's) through the
  table's (step 1). --planes table uses the table's for both, for comparison.
- scale: table mm per projector height, from the ruler page (step 2) or the typed depth (rig.json).
- drift: the projector keeps 4 small tags in the work area's corners; their drift from where they were at save time
  is reported (warn) or folded into every position (fix).


#147 flags (defaults keep #105/#115's rules):
- lifted: --near outline finds neighbours by card outline (--near-gap-mm apart) instead of marker centre (--near-mm);
  --miss-ok N lets a neighbour miss N frames in a row and still count as seen all along; --alone-s: how long a card
  with no neighbour waits (default --hold)
- re-read: --change-hold N: a crop must differ from the read one for N calm cycles in a row before it is read again;
  --light-tol: skip judging a rewrite while the paper's brightness is this far (share) off what it was at the read
  (the table app lighting the card); --keep-text: a card read again keeps its last text while the read runs
- every frame's raw poses go into the log ("raw"), for gaps.py
 Runs on the Pi, pinned to 2 cores.

Loops: grab a 16 MP frame, find markers (2 threads, quad_decimate 2, as the card tracking prototype decided), follow
each card as a track (track.py's rules, live), and send a **table state** over TCP (one JSON line) only when a card
counts, goes, moves past the dead band, or changes its handwriting state. Positions are table mm from the
projector's top-left, through the camera-to-projector line-up (calib.json from the card feedback prototype) and the
table's depth (--table-mm).

Handwriting: the crop, ink and steadiness work runs here for real (it is the Pi's share); the cloud read is mocked:
"reading" turns "read" --read-s later, with the text from cards.json.

Every message carries t_cap (wall-clock s when the frame was exposed) so the table app can time the whole chain.

    taskset -c 0,1 ~/marker46/venv/bin/python -u vision.py [--lens 3.75] [--read-s 1.5]
"""

import argparse
import json
import queue
import socket
import threading
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from pupil_apriltags import Detector

from geometry import apply, fit_homography, fit_similarity
import lineup
import track
from lineup import CAL_CARDS, RULER, Camera, Lineup
from track import CARDS, diff, ink, layout, similarity, warp
from cardlen import LEN, length_u

def outline(c, ang, mid):
    """A card's 4 corners in table mm, from its marker centre and angle (marker centre 8.5, 15 mm from top-left)."""
    a = np.radians(ang)
    u, v = np.array([np.cos(a), np.sin(a)]), np.array([-np.sin(a), np.cos(a)])
    L = (LEN.get(mid) or length_u(CARDS[mid])) * 30
    tl = np.asarray(c) - 8.5 * u - 15 * v
    return np.array([tl, tl + L * u, tl + L * u + 30 * v, tl + 30 * v])


def seg_dist(p, a, b):
    ab = b - a
    t = np.clip(np.dot(p - a, ab) / max(np.dot(ab, ab), 1e-9), 0, 1)
    return float(np.linalg.norm(p - (a + t * ab)))


def inside(p, q):
    s = [np.cross(q[(i + 1) % 4] - q[i], p - q[i]) for i in range(4)]
    return all(x >= 0 for x in s) or all(x <= 0 for x in s)


def outline_gap(q1, q2):
    """mm between two card outlines (0 if they overlap)."""
    if any(inside(p, q2) for p in q1) or any(inside(p, q1) for p in q2):
        return 0.0
    return min(seg_dist(p, b[i], b[(i + 1) % 4]) for a, b in ((q1, q2), (q2, q1)) for p in a for i in range(4))

HERE = Path(__file__).parent
SIZE = (4624, 3472)


class Hub:
    """TCP server on localhost: every client gets each message as one JSON line, and the last state on connect."""

    def __init__(self, port):
        self.clients, self.last, self.lock, self.cmds = [], None, threading.Lock(), queue.Queue()
        srv = socket.create_server(("127.0.0.1", port), reuse_port=True)
        threading.Thread(target=self.accept, args=(srv,), daemon=True).start()

    def accept(self, srv):
        while True:
            c, _ = srv.accept()
            c.setsockopt(socket.IPPROTO_TCP, socket.TCP_NODELAY, 1)
            with self.lock:
                self.clients.append(c)
                if self.last:
                    self.send_to(c, self.last)
            threading.Thread(target=self.listen, args=(c,), daemon=True).start()

    def listen(self, c):
        """#132: the table app's commands, one JSON line each."""
        buf = b""
        while True:
            try:
                d = c.recv(65536)
            except OSError:
                return
            if not d:
                return
            buf += d
            while b"\n" in buf:
                line, buf = buf.split(b"\n", 1)
                try:
                    self.cmds.put(json.loads(line))
                except ValueError:
                    pass

    def send_to(self, c, line):
        try:
            c.sendall(line)
        except OSError:
            self.clients.remove(c)

    def send(self, msg, keep=False):
        line = (json.dumps(msg) + "\n").encode()
        with self.lock:
            if keep:
                self.last = line
            for c in list(self.clients):
                self.send_to(c, line)


def crop(frame, corners, box):
    """track.crop on a small window around the card: same result, without copying the 16 MP frame each time."""
    L = box[2] + 30
    pts = apply(similarity(corners), [[0, 0], [L, 0], [L, 30], [0, 30]])
    x0, y0 = np.maximum(pts.min(0).astype(int) - 20, 0)
    x1, y1 = pts.max(0).astype(int) + 20
    return track.crop(np.ascontiguousarray(frame[y0:y1, x0:x1]), np.asarray(corners) - [x0, y0], box)


def face(frame, corners, mid):
    """#147: the whole card's look at 1 px/mm (grey, mean 0, unit norm), from its marker corners, for --face-check."""
    L = (LEN.get(mid) or length_u(CARDS[mid])) * 30
    pts = apply(similarity(corners), [[0, 0], [L, 0], [L, 30], [0, 30]])
    x0, y0 = np.maximum(pts.min(0).astype(int) - 20, 0)
    x1, y1 = pts.max(0).astype(int) + 20
    win = np.ascontiguousarray(frame[y0:y1, x0:x1])
    im = track.warp(win, similarity(np.asarray(corners) - [x0, y0]), (0, 0, L, 30)).resize((int(L), 30))
    a = np.asarray(im, float)
    a -= a.mean()
    sd = float(a.std())
    return a / max(np.linalg.norm(a), 1e-6), sd


def wrap(d):
    return (d + 180) % 360 - 180


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lens", type=float, help="dioptres; default: autofocus once at start")
    ap.add_argument("--port", type=int, default=8115)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--decimate", type=float, default=2.0)
    ap.add_argument("--calib", default=str(HERE / "calib.json"), help="#132: the line-up this service owns")
    ap.add_argument("--calib-fallback", default=str(Path.home() / "snap-129/calib.json"), help="used until the first save")
    ap.add_argument("--card-fit", choices=["homography", "plane+height"], default="homography",
                    help="#132: the card-height line-up's own homography (8+ face tags), or the table's with a 4-number fix")
    ap.add_argument("--drift", choices=["off", "warn", "fix"], default="warn")
    ap.add_argument("--drift-fit", choices=["homography", "similarity"], default="homography")
    ap.add_argument("--planes", choices=["two", "table"], default="two")
    # track.py's rules, as decided
    ap.add_argument("--gate", type=float, default=40)
    ap.add_argument("--confirm", type=int, default=2)
    ap.add_argument("--hold", type=float, default=10.0)
    ap.add_argument("--gone", type=float, default=2.5)
    ap.add_argument("--near-mm", type=float, default=60.0)
    ap.add_argument("--replace-mm", type=float, default=15.0)
    ap.add_argument("--still", type=float, default=1.5)
    ap.add_argument("--smooth", type=float, default=0.25)
    ap.add_argument("--band-mm", type=float, default=2.0)
    ap.add_argument("--band-deg", type=float, default=3.0)
    ap.add_argument("--steady", type=int, default=3)
    ap.add_argument("--steady-thr", type=float, default=4)
    ap.add_argument("--change-thr", type=float, default=10)
    ap.add_argument("--ink-thr", type=float, default=6)
    ap.add_argument("--paper-lo", type=float, default=0.85)
    ap.add_argument("--paper-hi", type=float, default=1.5)
    ap.add_argument("--read-s", type=float, default=1.5, help="mocked cloud read time")
    ap.add_argument("--exposure-ms", type=float, help="fixed exposure (with gain 1); default: auto")
    ap.add_argument("--near", choices=["centre", "outline"], default="centre")
    ap.add_argument("--near-gap-mm", type=float, default=15.0, help="--near outline: outlines this close are neighbours")
    ap.add_argument("--miss-ok", type=int, default=0, help="frames in a row a neighbour may miss and still count as seen")
    ap.add_argument("--alone-s", type=float, help="s a card with no neighbour waits before it goes (default --hold)")
    ap.add_argument("--change-hold", type=int, default=1, help="calm cycles in a row a crop must differ from the read one")
    ap.add_argument("--light-tol", type=float, help="share the paper may differ from its brightness at the read before a rewrite isn't judged")
    ap.add_argument("--keep-text", action="store_true", help="a card read again keeps its last text while the read runs")
    ap.add_argument("--face-check", type=float, help="#147: a missed card whose spot still looks like it (correlation >= this) counts as seen")
    ap.add_argument("--empty-ratio", type=float, help="#147: a missed card whose spot is this plain (its contrast / the card's) counts as lifted")
    ap.add_argument("--gone-empty", type=float, default=0.5, help="#147: s before a card whose spot looks empty goes")
    ap.add_argument("--flush", action="store_true", help="wait for a frame exposed after the loop asks (fresher, waits up to a frame)")
    a = ap.parse_args()

    lu = Lineup(a.calib, a.calib_fallback)
    lu.drift_mode, lu.planes, lineup.lu_fit, lineup.drift_fit = a.drift, a.planes, a.card_fit, a.drift_fit
    hub = Hub(a.port)
    runs = HERE / "runs"
    runs.mkdir(exist_ok=True)
    log = open(runs / f"vision-{time.strftime('%Y%m%d-%H%M%S')}.jsonl", "a")

    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": SIZE, "format": "YUV420"}, buffer_count=2))
    cam.start()
    time.sleep(1.0)
    lens = a.lens
    if lens is None:
        cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
        cam.autofocus_cycle()
        lens = cam.capture_metadata()["LensPosition"]
    cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": lens})
    det = Detector(families="tagStandard41h12", nthreads=a.threads, quad_decimate=a.decimate, refine_edges=1)
    camx = Camera(cam, det)
    ex = lu.saved.get("exposure")
    camx.fixed = (a.exposure_ms, 1.0) if a.exposure_ms else (ex["ms"], ex["gain"]) if ex else None
    camx.room()
    print(f"vision: lens {lens:.2f}, {a.threads} threads, decimate {a.decimate}, port {a.port}, exposure {camx.fixed or 'auto'}, "
          f"line-up {lu.saved.get('t') or lu.saved.get('from') or 'NONE'}: {lu.info()}", flush=True)

    def calib_cmd(c):
        """#132: one calibration command from the table app. Tracking pauses while a step takes its pictures."""
        t0 = time.time()
        gray = None
        try:
            if c["cmd"] == "table":
                out, gray = lineup.step_table(lu, camx)
            elif c["cmd"] == "prep":
                out, gray = lineup.step_prep(lu, camx)
            elif c["cmd"] == "card":
                out, gray = lineup.step_card(lu, camx, c["tags"])
            else:
                out = lu.command(c)
                if c["cmd"] == "save":
                    out["saved"] = lu.saved.get("t")
        except Exception as e:  # a prototype: say what broke, keep running
            import traceback
            traceback.print_exc()
            out = {"ok": False, "why": repr(e)}
        out.update(type="calib", step=c["cmd"], s=round(time.time() - t0, 2), lineup=lu.info())
        print("calib", json.dumps(out)[:600], flush=True)
        log.write(json.dumps({"calib": c, "out": out}) + "\n")
        hub.send(out)
        if gray is not None:
            from PIL import Image
            Image.fromarray(gray).resize((SIZE[0] // 4, SIZE[1] // 4)).save(runs / f"calib-{c['cmd']}-{time.strftime('%H%M%S')}.jpg")

    tracks, next_id, last_sent, seq, prev_t = [], 0, None, 0, None
    cal_hist = {}  # #132: calibration card / ruler marker -> its last 8 readings
    while True:
        while not hub.cmds.empty():
            calib_cmd(hub.cmds.get())
        req = cam.capture_request(flush=True) if a.flush else cam.capture_request()
        gray = req.make_array("main")[: SIZE[1], : SIZE[0]]
        meta = req.get_metadata()
        req.release()
        # SensorTimestamp: ns on CLOCK_MONOTONIC (V4L2) at the start of the frame's readout
        age = (time.clock_gettime_ns(time.CLOCK_MONOTONIC) - meta["SensorTimestamp"]) / 1e9
        now = time.time()
        t_cap = now - age
        t0 = time.perf_counter()
        dets = det.detect(gray)
        search = time.perf_counter() - t0

        lu.see_drift(dets)
        seen, margins, raw_cal = {}, {}, {}
        for d in dets:
            if d.tag_id in CAL_CARDS or d.tag_id in RULER["ids"]:  # #132: for the app's boxes and check view
                q = lu.mm(d.corners, "card" if d.tag_id in CAL_CARDS else "table")
                if q is not None:
                    # two angles: one edge of the marker (what the tracker uses), and all 4 corners fitted at once
                    edge = float(np.degrees(np.arctan2(q[1][1] - q[0][1], q[1][0] - q[0][0])))
                    m = fit_similarity(track.MK_MM, q)
                    fit = float(np.degrees(np.arctan2(m[1, 0], m[0, 0])))
                    raw_cal[int(d.tag_id)] = [float(q.mean(0)[0]), float(q.mean(0)[1]), edge, fit]
            if d.tag_id not in CARDS:
                continue
            q = lu.mm(d.corners, "card")  # #132: table mm, at the cards' height
            if q is None:
                continue
            seen[d.tag_id] = (q.mean(0), float(np.degrees(np.arctan2(q[1][1] - q[0][1], q[1][0] - q[0][0]))), d.corners)
            margins[d.tag_id] = round(float(d.decision_margin), 1)

        cal = {}
        for tid, r in raw_cal.items():  # #132: [x, y, edge angle this frame, x, y, fitted angle averaged over 8 frames]
            h = cal_hist.setdefault(tid, [])
            h.append(r); del h[:-8]
            hh = np.array(h)
            fit = float(np.degrees(np.angle(np.exp(1j * np.radians(hh[:, 3])).mean())))
            cal[tid] = [round(r[0], 1), round(r[1], 1), round(r[2], 2), round(float(hh[:, 0].mean()), 1), round(float(hh[:, 1].mean()), 1), round(fit, 2)]
        for tid in list(cal_hist):
            if tid not in raw_cal:
                cal_hist.pop(tid)
        # match to tracks of the same marker, nearest first, within the gate
        pairs = sorted((float(np.linalg.norm(c - tr["c"])), mid, i) for mid, (c, _, _) in seen.items()
                       for i, tr in enumerate(tracks) if tr["mid"] == mid and np.linalg.norm(c - tr["c"]) <= a.gate)
        used_m, used_t = set(), set()
        for _, mid, i in pairs:
            if mid in used_m or i in used_t:
                continue
            used_m.add(mid), used_t.add(i)
            tr = tracks[i]
            c, ang, corners = seen[mid]
            if np.linalg.norm(c - tr["c"]) < a.still:  # still: average in
                c = tr["c"] + a.smooth * (c - tr["c"])
                ang = tr["a"] + a.smooth * wrap(ang - tr["a"])
            tr.update(c=c, a=ang, corners=corners, last=now, streak=tr["streak"] + 1, missed=0)
        for mid, (c, ang, corners) in seen.items():
            if mid in used_m:
                continue
            hidden = [i for i, t in enumerate(tracks) if t["mid"] == mid and t["live"] and i not in used_t]
            if hidden:  # seen elsewhere while its track is covered: moved
                i = min(hidden, key=lambda i: np.linalg.norm(c - tracks[i]["c"]))
                used_t.add(i)
                tracks[i].update(c=c, a=ang, corners=corners, last=now, streak=1, missed=0, run=now)
            else:
                tracks.append({"track": next_id, "mid": mid, "c": c, "a": ang, "corners": corners, "pose": (c, ang),
                               "first": now, "first_cap": t_cap, "last": now, "streak": 1, "live": False, "since": now,
                               "missed": 0, "run": now, "changed": 0,
                               "hw": None if layout(CARDS[mid]) is None else {"state": "not read yet"},
                               "prev": None, "calm": 0, "read_crop": None, "due": None})
                next_id += 1
        for tr in tracks:
            if tr["last"] == now and tr.get("run") is None:
                tr["run"] = now
        cycle = (t_cap - prev_t) if prev_t else 0.13
        prev_t = t_cap
        for tr in tracks:
            if tr["last"] != now:
                tr["streak"], tr["calm"] = 0, 0
                tr["missed"] = tr.get("missed", 0) + 1
                if tr["missed"] > a.miss_ok:
                    tr["run"] = None  # its seen run is broken
            if not tr["live"] and tr["streak"] >= a.confirm:
                tr["live"], tr["pose"] = True, (tr["c"], tr["a"])
            if tr["live"] and tr["last"] == now:
                (c0, a0) = tr["pose"]
                if np.linalg.norm(tr["c"] - c0) > a.band_mm or abs(wrap(tr["a"] - a0)) > a.band_deg:
                    tr["pose"] = (tr["c"], tr["a"])

        faced, empties = [], []
        if a.face_check is not None:  # #147: a missed marker on a card that's still there isn't a lifted card
            for tr in tracks:
                if not tr["live"]:
                    continue
                if tr["last"] == now:
                    if now - tr.get("face_t", -1e9) > 1.0:
                        (tr["face"], tr["face_sd"]), tr["face_t"] = face(gray, tr["corners"], tr["mid"]), now
                    tr["empty_since"] = None
                elif tr.get("face") is not None:
                    f, sd = face(gray, tr["corners"], tr["mid"])
                    r = float((f * tr["face"]).sum()) if f.shape == tr["face"].shape else 0.0
                    plain = sd / max(tr["face_sd"], 1e-6)
                    empties.append((int(tr["mid"]), round(r, 2), round(plain, 2)))
                    if a.empty_ratio is not None and r < a.face_check and plain <= a.empty_ratio:
                        tr["empty_since"] = tr.get("empty_since") or now
                    else:
                        tr["empty_since"] = None
                    if r >= a.face_check:
                        tr.update(last=now, missed=0)
                        if tr.get("run") is None:
                            tr["run"] = now
                        faced.append((int(tr["mid"]), round(r, 2)))
                    else:
                        tr.setdefault("face_miss", []).append(round(r, 2))

        def gone(tr):
            if not tr["live"]:
                return tr["last"] != now
            if tr["last"] == now:
                return False
            out = now - tr["last"]
            if out > a.hold:
                return True
            if tr.get("empty_since") is not None and now - tr["empty_since"] >= a.gone_empty - 1e-6:
                return True  # #147: its spot looks like bare table: lifted
            c = tr["pose"][0]
            others = [o for o in tracks if o is not tr]
            if any(o["mid"] != tr["mid"] and o["last"] == now and np.linalg.norm(o["c"] - c) < a.replace_mm for o in others):
                return True
            if a.empty_ratio is not None and tr.get("face") is not None:
                return False  # #147: with the look check, only a bare spot means lifted; anything else over it is a cover
            if a.near == "outline":
                q = outline(c, tr["pose"][1], tr["mid"])
                near = [o for o in others if o["live"] and outline_gap(q, outline(o["pose"][0], o["pose"][1], o["mid"])) < a.near_gap_mm]
            else:
                near = [o for o in others if o["live"] and np.linalg.norm(o["pose"][0] - c) < a.near_mm]
            if not near:
                return out >= (a.alone_s if a.alone_s is not None else a.hold)
            # each neighbour seen (allowing --miss-ok missed frames) for --gone, and seen this frame or within the allowance
            return out >= a.gone and all(o["missed"] <= a.miss_ok and o.get("run") is not None and now - o["run"] >= a.gone for o in near)

        tracks = [tr for tr in tracks if not gone(tr)]

        t1 = time.perf_counter()
        for tr in tracks:  # handwriting: real crops, mocked cloud read
            hw = tr["hw"]
            if hw is None or not tr["live"]:
                continue
            if hw["state"] == "reading" and now >= tr["due"]:
                note = CARDS[tr["mid"]]
                hw.update(state="read", text=note[note.index("{") + 1: note.index("}")])
            if tr["last"] != now:
                continue
            c, paper = crop(gray, tr["corners"], layout(CARDS[tr["mid"]])[1])
            tr["paper"] = paper
            moved = diff(c, tr["prev"]) if tr["prev"] is not None else 9
            tr["calm"] = tr["calm"] + 1 if moved < a.steady_thr and a.paper_lo <= paper <= a.paper_hi else 0
            tr["prev"] = c
            if tr["calm"] < a.steady:
                continue
            if tr["read_crop"] is not None:
                lit = a.light_tol is not None and abs(paper / max(tr["read_paper"], 1e-6) - 1) > a.light_tol
                tr["changed"] = tr["changed"] + 1 if diff(c, tr["read_crop"]) > a.change_thr and not lit else 0
            if tr["read_crop"] is None or tr["changed"] >= a.change_hold:
                tr["read_crop"], tr["read_paper"], tr["changed"] = c, paper, 0
                text = hw.get("text")
                if ink(c) < a.ink_thr:
                    hw.clear(), hw.update(state="blank")
                else:
                    hw.clear(), hw.update(state="reading")
                    if a.keep_text and text is not None:
                        hw["text"] = text
                    tr["due"] = now + a.read_s
                tr["rereads"] = tr.get("rereads", 0) + 1
        hw_s = time.perf_counter() - t1

        cards = [{"track": tr["track"], "marker": int(tr["mid"]), "x": round(float(tr["pose"][0][0]), 1),
                  "y": round(float(tr["pose"][0][1]), 1), "angle": round(float(tr["pose"][1]), 1),
                  "first_cap": round(tr["first_cap"], 3), **({"hw": dict(tr["hw"])} if tr["hw"] else {})}
                 for tr in tracks if tr["live"]]
        key = [(c["track"], c["x"], c["y"], c["angle"], json.dumps(c.get("hw"))) for c in cards]
        changed = key != last_sent
        if changed:
            seq += 1
            last_sent = key
            hub.send({"type": "state", "seq": seq, "t_cap": t_cap, "t_sent": time.time(), "cards": cards}, keep=True)
        rec = {"t_cap": round(t_cap, 3), "exp_ms": round(meta.get("ExposureTime", 0) / 1000, 2), "gain": round(meta.get("AnalogueGain", 0), 2), "age_s": round(age, 3), "search_s": round(search, 3), "hw_s": round(hw_s, 3),
               "loop_s": round(time.time() - now + age, 3), "markers": len(dets), "cards": len(cards),
               "sent": seq if changed else None, **({"state": cards} if changed else {}),
               "seen": sorted(int(m) for m in seen), "cal": cal,
               "raw": {int(m): [round(float(c[0]), 2), round(float(c[1]), 2), round(ang, 2)] for m, (c, ang, _) in seen.items()},
               "dm": margins, "faced": faced, "missed_look": empties,
               "paper": {int(tr["mid"]): round(tr["paper"], 3) for tr in tracks if tr.get("paper") is not None}}
        log.write(json.dumps(rec) + "\n")
        log.flush()
        hub.send({"type": "frame", **rec, "lineup": lu.info(), "cal": cal})
        grab = runs / "grab"
        if grab.exists():  # #147 debug: touch runs/grab to save the next 30 full-res frames around the cards (npz)
            xs = np.concatenate([d.corners for d in dets]) if dets else np.zeros((1, 2))
            x0, y0 = np.maximum(xs.min(0).astype(int) - 300, 0)
            x1, y1 = xs.max(0).astype(int) + 300
            n = int(grab.read_text() or 0)
            np.savez_compressed(runs / f"grab-{n:02d}.npz", img=gray[y0:y1, x0:x1], off=np.array([x0, y0]), seen=np.array(sorted(seen)))
            grab.write_text(str(n + 1)) if n < 29 else grab.unlink()
        snap = runs / "snap"
        if snap.exists():  # debug: touch runs/snap to save this frame (quarter size) with the markers found
            snap.unlink()
            from PIL import Image, ImageDraw
            im = Image.fromarray(gray).convert("RGB")
            dr = ImageDraw.Draw(im)
            for d in dets:
                dr.polygon([tuple(c) for c in d.corners], outline=(0, 220, 0), width=8)
                dr.text(tuple(d.corners[0]), str(d.tag_id), fill=(0, 220, 0), font_size=48)
            im.resize((SIZE[0] // 3, SIZE[1] // 3)).save(runs / f"snap-{time.strftime('%H%M%S')}.jpg", quality=85)
            im.crop((600, 850, 2150, 1850)).save(runs / f"crop-{time.strftime('%H%M%S')}.jpg", quality=90)


if __name__ == "__main__":
    main()
