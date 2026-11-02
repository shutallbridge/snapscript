"""PROTOTYPE (#105), throwaway: replay a recorded clip through a card tracker and print every table state it
would send. Runs on the Pi (needs the clip's frames for the handwriting crops).

Rules being tried (all flags):
- the service sees one frame every --every frames (1 = 0.13 s at 7.6 fps)
- a marker is matched to a track of the same marker ID within --gate mm; else it starts a new track
- a new track counts (enters the table state) after --confirm sightings in a row (one-frame false reads, #128)
- a track not seen stays (covered) for --hold s; it counts as removed sooner (--gone) when its neighbours are all
  seen again but it isn't, or at once when another marker lies on its spot; seen elsewhere, it moved
- a still card's corners are averaged; a pose change enters the table state only past a dead band (--band-mm, --band-deg)
- handwriting: the whiteboard crop (from marker pose + #101 sheet layout) must hold steady (--steady cycles) before
  it is judged; blank is decided on the Pi; a written crop is "read" --read-s later (mocked cloud call); a read crop
  that later differs (held steady) is read again

    ~/marker46/venv/bin/python track.py CLIP [--every 1] [--hold 2] ...
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

from geometry import CORNER_ORDER, fit_homography

PX_MM = 2.85            # camera px per mm at the table (marker quad 7.22 mm ~ 20.5 px)
HALF = 13 * 5 / 9 / 2   # half the detected quad, mm
MK_MM = np.array([8.5, 15]) + CORNER_ORDER * HALF
CARDS = {int(k): v for k, v in json.loads(Path(__file__).with_name("cards.json").read_text())["cards"].items()}
RES = 3                 # crop px per mm


def layout(note):
    """(length U, whiteboard box in card mm) for a handwritten card, None for a printed one."""
    if "{" not in note:
        return None
    word = note[1:note.index("{")]
    close = note[note.index("}") + 1:-1]
    L = 5 if word in ("define", "global", "getProp", "setProp") else 4
    x0 = 17 + 1.5 + 3 + len(word) * 5.5 + 3
    x1 = L * 30 - 3 - (len(close) * 5.5 + 3 if close else 0)
    return L, (x0, 3, x1, 27)


def similarity(corners):
    """Least-squares position, angle and scale taking the marker's card-mm corners to its image corners
    (a camera looking straight down: no perspective). Returns a 3x3 card mm -> image px."""
    w = MK_MM[:, 0] + 1j * MK_MM[:, 1]
    c = np.asarray(corners, float)
    z = c[:, 0] + 1j * c[:, 1]
    wm, zm = w.mean(), z.mean()
    k = ((z - zm) * np.conj(w - wm)).sum() / (abs(w - wm) ** 2).sum()
    b = zm - k * wm
    return np.array([[k.real, -k.imag, b.real], [k.imag, k.real, b.imag], [0, 0, 1]])


def pose(corners):
    c = np.asarray(corners)
    centre = c.mean(0) / PX_MM
    S = similarity(c)
    return centre, float(np.degrees(np.arctan2(S[1, 0], S[0, 0])))


def warp(frame, to_img, box):
    x0, y0, x1, y1 = box
    S = np.array([[1 / RES, 0, x0], [0, 1 / RES, y0], [0, 0, 1]])
    M = to_img @ S
    M = M / M[2, 2]
    return Image.fromarray(frame).transform((max(1, int((x1 - x0) * RES)), int((y1 - y0) * RES)), Image.PERSPECTIVE,
                                            M.flatten()[:8].tolist(), Image.BILINEAR)


def crop(frame, corners, box):
    """The whiteboard's ink mask, and how bright its paper is next to the white beside the marker (1 = same)."""
    to_img = similarity(corners)
    im = warp(frame, to_img, box)
    a = np.asarray(im, float)
    bg = np.asarray(im.filter(ImageFilter.GaussianBlur(5 * RES)), float)  # the paper (and any shadow) around
    mask = (a - bg) < -0.2 * bg - 4  # ink: strokes clearly darker than the paper around them
    white = np.concatenate([np.asarray(warp(frame, to_img, b), float).ravel() for b in ((0.6, 4, 1.6, 26), (15.4, 4, 16.4, 26))])
    paper = float(np.median(a[~mask])) / max(1.0, float(np.median(white))) if (~mask).any() else 0.0
    return mask, paper


def ink(c):
    return float(c.sum()) / RES ** 2  # mm2 of ink


def grow(c):
    return np.asarray(Image.fromarray(c.astype(np.uint8) * 255).filter(ImageFilter.MaxFilter(2 * RES + 1))) > 0


def diff(a, b):
    """mm2 of ink in one crop with no ink within ~1 mm of it in the other, both ways."""
    if a.shape != b.shape:
        return 999.0
    return float((a & ~grow(b)).sum() + (b & ~grow(a)).sum()) / RES ** 2


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("clip")
    ap.add_argument("--every", type=int, default=1)
    ap.add_argument("--gate", type=float, default=40)
    ap.add_argument("--confirm", type=int, default=2)
    ap.add_argument("--hold", type=float, default=10.0, help="s a covered card stays")
    ap.add_argument("--gone", type=float, default=2.5, help="s unseen, with every neighbour seen that long, before a card counts as lifted")
    ap.add_argument("--near-mm", type=float, default=60.0, help="neighbours for --gone: tracks this close (centres)")
    ap.add_argument("--replace-mm", type=float, default=15.0, help="another marker this close to a covered card replaces it")
    ap.add_argument("--still", type=float, default=1.5, help="mm: closer than this to the average counts as still")
    ap.add_argument("--smooth", type=float, default=0.25, help="share of a still reading averaged in")
    ap.add_argument("--band-mm", type=float, default=2.0)
    ap.add_argument("--band-deg", type=float, default=3.0)
    ap.add_argument("--steady", type=int, default=3)
    ap.add_argument("--steady-thr", type=float, default=4, help="mm2 of ink change between cycles still counted steady")
    ap.add_argument("--change-thr", type=float, default=10, help="mm2 of ink change from the read crop that means rewritten")
    ap.add_argument("--ink-thr", type=float, default=6, help="mm2 of ink below which a whiteboard is blank")
    ap.add_argument("--read-s", type=float, default=2.0)
    ap.add_argument("--paper-lo", type=float, default=0.85)
    ap.add_argument("--paper-hi", type=float, default=1.5)
    ap.add_argument("--quiet", action="store_true")
    ap.add_argument("--diag", type=int, help="print crop numbers for this marker ID every cycle")
    a = ap.parse_args()

    meta = json.loads(open(a.clip + ".json").read())
    W, H = meta["w"], meta["h"]
    v = np.memmap(a.clip + ".y", np.uint8, "r").reshape(-1, H, W)
    rows = [json.loads(l) for l in open(a.clip + ".det2.jsonl")][:: a.every]
    t0 = rows[0]["t"]
    cycle = a.every / 7.6

    tracks, next_id, states, last_sent = [], 0, [], None
    for r in rows:
        now = r["t"] - t0
        frame = None
        seen = {int(k): m[0] for k, m in r["m"].items() if int(k) in CARDS}
        # match detections to tracks of the same marker, nearest first, within the gate
        pairs = []
        for mid, corners in seen.items():
            c, _ = pose(corners)
            for tr in tracks:
                if tr["mid"] == mid:
                    d = float(np.linalg.norm(c - tr["raw"][0]))
                    if d <= a.gate:
                        pairs.append((d, mid, id(tr)))
        used_m, used_t = set(), set()
        for d, mid, tid in sorted(pairs):
            if mid in used_m or tid in used_t:
                continue
            used_m.add(mid), used_t.add(tid)
            tr = next(t for t in tracks if id(t) == tid)
            new = np.asarray(seen[mid], float)
            avg = np.asarray(tr["corners"], float)
            # still (within --still mm of the average): average the corners in; else jump to the new reading
            if np.linalg.norm(new.mean(0) - avg.mean(0)) / PX_MM < a.still:
                new = avg + a.smooth * (new - avg)
            tr["corners"], tr["raw"], tr["last"] = new, pose(new), now
            tr["streak"] += 1
        # a marker with no track nearby, while a covered track of the same marker exists: that card was moved
        for mid in seen:
            if mid in used_m:
                continue
            c, _ = pose(seen[mid])
            hidden = [t for t in tracks if t["mid"] == mid and t["live"] and id(t) not in used_t and t["last"] != now]
            if hidden:
                tr = min(hidden, key=lambda t: np.linalg.norm(c - t["raw"][0]))
                used_m.add(mid), used_t.add(id(tr))
                tr["corners"], tr["raw"], tr["last"], tr["streak"] = np.asarray(seen[mid], float), pose(seen[mid]), now, 1
        for mid in seen:
            if mid not in used_m:
                tracks.append({"track": next_id, "mid": mid, "corners": seen[mid], "raw": pose(seen[mid]),
                               "pose": pose(seen[mid]), "first": now, "last": now, "streak": 1, "live": False,
                               "hw": None if layout(CARDS[mid]) is None else {"state": "not read yet"},
                               "prev": None, "calm": 0, "read_crop": None, "due": None})
                next_id += 1
        for tr in tracks:
            if tr["last"] != now:
                tr["streak"] = 0
                tr["calm"] = 0
        # confirm, remove, dead band
        for tr in tracks:
            if not tr["live"] and tr["streak"] >= a.confirm:
                tr["live"] = True
                tr["pose"] = tr["raw"]
                tr["confirmed_at"] = now
            if tr["live"] and tr["last"] == now:
                (c0, a0), (c1, a1) = tr["pose"], tr["raw"]
                if np.linalg.norm(c1 - c0) > a.band_mm or abs((a1 - a0 + 180) % 360 - 180) > a.band_deg:
                    tr["pose"] = tr["raw"]
        def gone(tr):
            if not tr["live"]:
                return tr["last"] != now  # unconfirmed and missed once: a false read
            if tr["last"] == now:
                return False
            out = now - tr["last"]
            if out > a.hold:
                return True  # covered too long
            c = tr["pose"][0]
            others = [o for o in tracks if o is not tr and o["live"] or o["last"] == now and o is not tr]
            if any(o["mid"] != tr["mid"] and o["last"] == now and np.linalg.norm(o["raw"][0] - c) < a.replace_mm for o in others):
                return True  # another card lies on its spot
            near = [o for o in others if o["live"] and np.linalg.norm(o["pose"][0] - c) < a.near_mm]
            return out >= a.gone and bool(near) and all(o["last"] == now and o["streak"] * cycle >= a.gone for o in near)

        removed = [tr for tr in tracks if gone(tr)]
        tracks = [tr for tr in tracks if tr not in removed]
        # handwriting
        for tr in tracks:
            hw = tr["hw"]
            if hw is None or not tr["live"]:
                continue
            if hw["state"] == "reading" and now >= tr["due"]:
                hw.update(state="read", text=f"<text@{tr['due_from']:.1f}s>")
            if tr["last"] != now:
                continue
            if frame is None:
                frame = np.array(v[r["i"]])
            c, paper = crop(frame, tr["corners"], layout(CARDS[tr["mid"]])[1])
            moved = diff(c, tr["prev"]) if tr["prev"] is not None else 9
            ok = a.paper_lo <= paper <= a.paper_hi  # looks like the card's own paper, not a hand over it
            tr["calm"] = tr["calm"] + 1 if moved < a.steady_thr and ok else 0
            tr["prev"] = c
            if a.diag == tr["mid"]:
                rc = diff(c, tr["read_crop"]) if tr["read_crop"] is not None else -1
                print(f"   diag {now:5.1f} t{tr['track']} moved {moved:.1f} calm {tr['calm']} vs-read {rc:.1f} ink {ink(c):.1f} paper {paper:.2f} {hw['state']}")
            if tr["calm"] < a.steady:
                continue
            if tr["read_crop"] is None or diff(c, tr["read_crop"]) > a.change_thr:
                tr["read_crop"] = c
                if ink(c) < a.ink_thr:
                    hw.clear(), hw.update(state="blank")
                else:
                    hw.clear(), hw.update(state="reading")
                    tr["due"], tr["due_from"] = now + a.read_s, now
        # the table state the service would send: only when it differs from the last one sent
        state = sorted((tr["track"], tr["mid"], tuple(np.round(tr["pose"][0], 0)), round(float(tr["pose"][1]), 1),
                        (tr["hw"] or {}).get("state", "-"), (tr["hw"] or {}).get("text", ""))
                       for tr in tracks if tr["live"])
        if state != last_sent:
            old = {s[0]: s for s in last_sent or []}
            new = {s[0]: s for s in state}
            what = [f"+{CARDS[s[1]]}#{s[0]}" for k, s in new.items() if k not in old] + \
                   [f"-{CARDS[s[1]]}#{s[0]}" for k, s in old.items() if k not in new]
            for k in new.keys() & old.keys():
                o, n = old[k], new[k]
                if o[2:4] != n[2:4]:
                    what.append(f"~{CARDS[n[1]]}#{k} moved")
                if o[4:] != n[4:]:
                    what.append(f"{CARDS[n[1]]}#{k} {o[4]}->{n[4]}")
            states.append((now, what))
            if not a.quiet:
                print(f"{now:5.1f}s  state {len(states):3d}: {len(state)} cards  " + ", ".join(what[:8]) + (" ..." if len(what) > 8 else ""))
            last_sent = state
    dur = rows[-1]["t"] - t0
    print(f"{len(states)} table states in {dur:.1f} s; cycle {a.every / 7.6:.2f} s")


if __name__ == "__main__":
    main()
