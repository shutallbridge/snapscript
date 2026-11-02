"""PROTOTYPE (#147, from #115), throwaway: the walking skeleton's vision service, with the steady table's rules.

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
import socket
import threading
import time
from pathlib import Path

import numpy as np
from libcamera import controls
from picamera2 import Picamera2
from pupil_apriltags import Detector

from geometry import apply
import track
from track import CARDS, diff, ink, layout, similarity
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


def undistort(pts, k1, size):
    pts = np.asarray(pts, float)
    ctr = np.array(size, float) / 2
    q = (pts - ctr) / np.hypot(*ctr)
    return ctr + (pts - ctr) * (1 + k1 * (q ** 2).sum(-1, keepdims=True))


class Hub:
    """TCP server on localhost: every client gets each message as one JSON line, and the last state on connect."""

    def __init__(self, port):
        self.clients, self.last, self.lock = [], None, threading.Lock()
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


def wrap(d):
    return (d + 180) % 360 - 180


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--lens", type=float, help="dioptres; default: autofocus once at start")
    ap.add_argument("--port", type=int, default=8115)
    ap.add_argument("--threads", type=int, default=2)
    ap.add_argument("--decimate", type=float, default=2.0)
    ap.add_argument("--table-mm", type=float, default=790, help="the table's depth (projector height) in mm")
    ap.add_argument("--calib", default=str(Path.home() / "snap-129/calib.json"))
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
    ap.add_argument("--flush", action="store_true", help="wait for a frame exposed after the loop asks (fresher, waits up to a frame)")
    a = ap.parse_args()

    cal = json.loads(Path(a.calib).read_text())
    to_proj, k1 = np.array(cal["H"]), cal.get("k1", 0.0)
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
    if a.exposure_ms:
        cam.set_controls({"AeEnable": False, "ExposureTime": int(a.exposure_ms * 1000), "AnalogueGain": 1.0})
    det = Detector(families="tagStandard41h12", nthreads=a.threads, quad_decimate=a.decimate, refine_edges=1)
    print(f"vision: lens {lens:.2f}, {a.threads} threads, decimate {a.decimate}, port {a.port}", flush=True)

    tracks, next_id, last_sent, seq, prev_t = [], 0, None, 0, None
    while True:
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

        seen = {}
        for d in dets:
            if d.tag_id not in CARDS:
                continue
            q = apply(to_proj, undistort(d.corners, k1, SIZE)) * a.table_mm  # table mm
            seen[d.tag_id] = (q.mean(0), float(np.degrees(np.arctan2(q[1][1] - q[0][1], q[1][0] - q[0][0]))), d.corners)

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

        def gone(tr):
            if not tr["live"]:
                return tr["last"] != now
            if tr["last"] == now:
                return False
            out = now - tr["last"]
            if out > a.hold:
                return True
            c = tr["pose"][0]
            others = [o for o in tracks if o is not tr]
            if any(o["mid"] != tr["mid"] and o["last"] == now and np.linalg.norm(o["c"] - c) < a.replace_mm for o in others):
                return True
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
               "seen": sorted(int(m) for m in seen),
               "raw": {int(m): [round(float(c[0]), 2), round(float(c[1]), 2), round(ang, 2)] for m, (c, ang, _) in seen.items()},
               "paper": {int(tr["mid"]): round(tr["paper"], 3) for tr in tracks if tr.get("paper") is not None}}
        log.write(json.dumps(rec) + "\n")
        log.flush()
        hub.send({"type": "frame", **rec})
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
