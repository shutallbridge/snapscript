"""PROTOTYPE (#132), throwaway: the camera-to-projector line-up, and the calibration steps the table app runs.

Projector space ("ph"): x across in units of the projector's height (0 .. aspect), y down (0 .. 1), as before.
Table mm = ph * scale (mm per ph).

The line-up (calib.json):
- k1: one radial lens term, undone before anything else (from step 1)
- table: camera px -> ph for things lying on the table (pages, the ruler page), from 12 tags projected on the bare table
- card: camera px -> ph for the tops of raised cards (about 11 mm up), from tags projected onto calibration cards' faces
- scale: mm per ph, from the ruler page's two markers (step 2), or the typed depth
- exposure: the fixed exposure for the room, set from the calibration cards' paper (step 2)
- drift_ref: where the corner tags read (ph, through the table line-up) just after saving

Steps (commands from the table app; each answers with a "calib" message):
- {"cmd": "table"}: the app shows the 12-tag grid on a bare table. Fits k1 and the table line-up.
- {"cmd": "prep"}: the calibration cards (raised) and the ruler page are down, the app shows them dark. Sets the
  exposure from the cards' paper, the scale from the ruler page, and answers where to draw a tag on each card's face.
- {"cmd": "card", "tags": {id: [x, y]}}: the app shows those tags. Fits the card-height line-up.
- {"cmd": "try"}: use the new line-up live (the check view). {"cmd": "save"} / {"cmd": "cancel"}.
- {"cmd": "set", ...}: drift "off" | "warn" | "fix", planes "two" | "table", scale "ruler" | "typed".
"""

import json
import time
from pathlib import Path

import numpy as np

from geometry import CORNER_ORDER, QUAD, apply, fit_homography, fit_similarity

HERE = Path(__file__).parent
RIG = json.loads((HERE / "rig.json").read_text())
SIZE = (4624, 3472)
GRID, DRIFT, FACE, RULER = RIG["grid"], RIG["drift"], RIG["face"], RIG["ruler"]
CAL_CARDS = set(RIG["cal_cards"])
TYPED = RIG["typed_depth_mm"]  # mm per ph if the projector's height spans the typed depth


def undistort(pts, k1, size=SIZE):
    pts = np.asarray(pts, float)
    ctr = np.array(size, float) / 2
    q = (pts - ctr) / np.hypot(*ctr)
    return ctr + (pts - ctr) * (1 + k1 * (q ** 2).sum(-1, keepdims=True))


def grid_centres():
    """The 12 step-1 tags' centres in ph, as table.html draws them."""
    a, e = RIG["aspect"], GRID["inset"]
    out = {}
    for i, tid in enumerate(GRID["ids"]):
        col, row = i % GRID["cols"], i // GRID["cols"]
        out[tid] = np.array([e + col / (GRID["cols"] - 1) * (a - 2 * e), e + row / (GRID["rows"] - 1) * (1 - 2 * e)])
    return out


def drift_centres():
    """The 4 corner tags' centres in ph: TL, TR, BL, BR of the work area."""
    a, e = RIG["aspect"], DRIFT["inset"]
    return dict(zip(DRIFT["ids"], map(np.array, [[e, e], [a - e, e], [e, 1 - e], [a - e, 1 - e]])))


def fit_lens(src, dst):
    def err(k):
        h = fit_homography(undistort(src, k), dst)
        return np.linalg.norm(apply(h, undistort(src, k)) - dst, axis=1)
    ks = np.linspace(-0.3, 0.3, 601) if len(src) >= 6 else [0.0]
    k1 = float(min(ks, key=lambda k: err(k).mean()))
    return k1, fit_homography(undistort(src, k1), dst), err(k1)


def stats(e_mm):
    e = np.asarray(e_mm, float)
    return [round(float(e.mean()), 2), round(float(e.max()), 2)] if len(e) else None


class Lineup:
    def __init__(self, path, fallback=None):
        self.path = Path(path)
        self.saved = self.load(fallback)
        self.live = self.saved
        self.pending = None
        self.drift_mode, self.planes, self.scale_from = "warn", "two", self.saved.get("scale_from", "typed")
        self.drift = np.eye(3)  # ph -> ph, folded in when drift_mode == "fix"
        self.drift_mm, self.drift_n, self.drift_hist = None, 0, []
        self.ref_frames = None if self.saved.get("drift_ref") else []  # corner tag readings being collected for drift_ref
        self.prep = None

    def load(self, fallback):
        for p in [self.path, fallback]:
            if p and Path(p).exists():
                d = json.loads(Path(p).read_text())
                if "table" not in d:  # the card feedback prototype's calib.json
                    d = {"k1": d.get("k1", 0.0), "table": {"H": d["H"]}, "scale": TYPED, "scale_from": "typed", "from": str(p)}
                return d
        return {"k1": 0.0, "table": None, "scale": TYPED, "scale_from": "typed"}

    @property
    def scale(self):
        return self.live.get("scale_ruler") if self.scale_from == "ruler" and self.live.get("scale_ruler") else TYPED

    def ph(self, corners_px, plane="table", drift=True):
        """Camera px (raw) -> ph, through the line-up's plane ('card' or 'table')."""
        L = self.live
        card, table = L.get("card") or {}, L.get("table") or {}
        H = card.get("H") if plane == "card" and self.planes == "two" and card.get("H") else table.get("H")
        if H is None:
            return None
        q = apply(np.array(H), undistort(corners_px, L.get("k1", 0.0)))
        return apply(self.drift, q) if drift and self.drift_mode == "fix" else q

    def mm(self, corners_px, plane="table"):
        q = self.ph(corners_px, plane)
        return None if q is None else q * self.scale

    # ---- drift ---------------------------------------------------------------------------------------------
    def see_drift(self, dets):
        """Each frame: the corner tags, through the table line-up (no drift fold), against drift_ref."""
        if not self.live.get("table"):
            return
        got = {d.tag_id: self.ph(d.corners, "table", drift=False).mean(0) for d in dets if d.tag_id in DRIFT["ids"]}
        if self.ref_frames is not None and len(self.ref_frames) < 8 and got:
            self.ref_frames.append(got)
            if len(self.ref_frames) == 8:
                ids = set.intersection(*[set(f) for f in self.ref_frames])
                ref = {int(t): np.mean([f[t] for f in self.ref_frames], 0).tolist() for t in ids}
                self.live["drift_ref"] = ref
                if self.saved is not None and self.saved.get("t") == self.live.get("t"):
                    self.saved["drift_ref"] = ref
                    self.write(self.saved)
                self.ref_frames = None
                print(f"lineup: drift reference from {len(ids)} corner tags", flush=True)
        ref = self.live.get("drift_ref") or {}
        ids = [t for t in got if str(t) in ref or t in ref]
        self.drift_n = len(ids)
        if not ids:
            return
        src = np.array([got[t] for t in ids])
        dst = np.array([ref.get(str(t), ref.get(t)) for t in ids])
        self.drift_hist = (self.drift_hist + [(src, dst)])[-10:]
        S = np.concatenate([a for a, _ in self.drift_hist]); D = np.concatenate([b for _, b in self.drift_hist])
        self.drift_mm = round(float(np.linalg.norm(S - D, axis=1).mean() * self.scale), 2)
        if len(ids) >= 2:
            m = fit_similarity(S, D)
        else:
            m = np.eye(3); m[:2, 2] = (D - S).mean(0)
        # only move the fold when it changes by more than 0.5 mm somewhere in the work area, so positions don't creep
        pts = np.array([[0, 0], [RIG["aspect"], 0], [0, 1], [RIG["aspect"], 1]])
        if np.abs(apply(m, pts) - apply(self.drift, pts)).max() * self.scale > 0.5:
            self.drift = m

    def info(self):
        L = self.live
        return {"scale": round(self.scale, 2), "scale_from": self.scale_from, "scale_ruler": L.get("scale_ruler"),
                "planes": self.planes, "card": bool((L.get("card") or {}).get("H")), "table": bool(L.get("table")),
                "drift": self.drift_mode, "drift_mm": self.drift_mm, "drift_n": self.drift_n,
                "drift_ref": bool(L.get("drift_ref")), "pending": self.pending is not None, "trying": self.pending is not None and L is self.pending}

    def command(self, c):
        """try / save / cancel / set. Returns the answer."""
        if c["cmd"] == "try" and self.pending:
            self.live, self.drift, self.drift_hist = self.pending, np.eye(3), []
            self.drift_mm, self.drift_n = None, 0
        elif c["cmd"] == "save" and self.pending:
            self.pending["t"] = time.strftime("%Y-%m-%d %H:%M:%S")
            self.pending["scale_from"] = self.scale_from
            if self.path.exists():
                self.path.rename(self.path.with_name(f"calib-before-{time.strftime('%H%M%S')}.json"))
            self.saved = self.live = self.pending
            self.pending, self.drift, self.drift_hist, self.ref_frames = None, np.eye(3), [], []
            self.write(self.saved)
        elif c["cmd"] == "cancel":
            self.live, self.pending, self.drift, self.drift_hist = self.saved, None, np.eye(3), []
            self.drift_mm, self.drift_n = None, 0
        elif c["cmd"] == "set":
            self.drift_mode = c.get("drift", self.drift_mode)
            self.planes = c.get("planes", self.planes)
            self.scale_from = c.get("scale", self.scale_from)
            if c.get("drift_ref") == "now":
                self.ref_frames = []
        return {"ok": True, **self.info()}

    def write(self, d):
        self.path.write_text(json.dumps(d, indent=1))


# ---- steps -----------------------------------------------------------------------------------------------------
class Camera:
    """The few camera calls the steps need."""

    def __init__(self, cam, det):
        self.cam, self.det = cam, det
        self.fixed = None  # (ms, gain) for the room

    def grab(self, n=1):
        for _ in range(n - 1):
            self.cam.capture_request().release()
        req = self.cam.capture_request()
        gray = req.make_array("main")[: SIZE[1], : SIZE[0]].copy()
        meta = req.get_metadata()
        req.release()
        return gray, meta

    def expose(self, ms=None, gain=1.0, auto=False):
        if auto:
            self.cam.set_controls({"AeEnable": True})
        else:
            self.cam.set_controls({"AeEnable": False, "ExposureTime": int(ms * 1000), "AnalogueGain": float(gain)})

    def room(self):
        if self.fixed:
            self.expose(*self.fixed)
        else:
            self.expose(auto=True)


def find(cam, ids, want, tries=5, settle=2):
    """Grab until at least `want` of `ids` are found (or tries run out). Returns ({id: corners}, gray, meta)."""
    best = ({}, None, None)
    for i in range(tries):
        gray, meta = cam.grab(settle if i == 0 else 1)
        found = {d.tag_id: d.corners for d in cam.det.detect(gray) if d.tag_id in ids}
        if len(found) > len(best[0]):
            best = (found, gray, meta)
        if len(found) >= want:
            break
    return best


def step_table(lu, cam):
    """Step 1: the 12-tag grid on a bare table. Fit tag centres (projector glare grows every tag about its centre)."""
    cam.expose(auto=True)
    time.sleep(1.5)
    want = grid_centres()
    found, gray, meta = find(cam, set(want), len(want), settle=4)
    cam.room()
    if len(found) < 6:
        return {"ok": False, "why": f"saw {len(found)} of {len(want)} tags"}, gray
    src = np.array([found[t].mean(0) for t in found])
    dst = np.array([want[t] for t in found])
    k1, H, err = fit_lens(src, dst)
    lu.pending = {**{k: v for k, v in lu.saved.items() if k not in ("drift_ref",)}, "k1": k1, "table": {"H": H.tolist(), "n": len(found)}, "card": None}
    lu.pending["table"]["err_mm"] = stats(err * TYPED)
    return {"ok": True, "n": len(found), "of": len(want), "k1": round(k1, 3), "err_mm": lu.pending["table"]["err_mm"],
            "exp_ms": round(meta.get("ExposureTime", 0) / 1000, 2)}, gray


def face_brightness(gray, corners):
    """Median grey of a calibration card's blank face (card mm x 25..110, y 5..25)."""
    from track import similarity, warp
    to_img = similarity(corners)
    pts = apply(to_img, [[25, 5], [110, 5], [110, 25], [25, 25]])
    x0, y0 = np.maximum(pts.min(0).astype(int) - 5, 0)
    x1, y1 = pts.max(0).astype(int) + 5
    win = np.ascontiguousarray(gray[y0:y1, x0:x1])
    sh = np.array([[1, 0, -x0], [0, 1, -y0], [0, 0, 1]]) @ to_img
    return float(np.median(np.asarray(warp(win, sh, (25, 5, 110, 25)))))


def step_prep(lu, cam, target=150, max_ms=50.0):
    """Step 2a: the cards and ruler page are down and dark. Exposure from the cards' paper, scale from the ruler page,
    and where to draw a tag on each card's face (ph, through the new table line-up, so off by the height parallax)."""
    P = lu.pending
    if not P or not P.get("table"):
        return {"ok": False, "why": "do step 1 first"}, None
    ms, gain = cam.fixed or (20.0, 1.0)
    cam.expose(ms, gain)
    log = []
    for _ in range(4):
        found, gray, meta = find(cam, CAL_CARDS, len(CAL_CARDS), tries=2, settle=3)
        if not found:
            return {"ok": False, "why": "no calibration cards seen"}, gray
        med = float(np.median([face_brightness(gray, c) for c in found.values()]))
        log.append([round(ms * gain, 1), round(med)])
        if abs(med - target) < 12 or med >= 250 and ms * gain < 1:
            break
        want = ms * gain * target / max(med, 1)
        ms, gain = (want, 1.0) if want <= max_ms else (max_ms, min(4.0, want / max_ms))
        ms = max(ms, 1.0)
        cam.expose(ms, gain)
    cam.fixed = (round(ms, 2), round(gain, 2))
    P["exposure"] = {"ms": cam.fixed[0], "gain": cam.fixed[1], "paper": round(med), "steps": log}

    H, k1 = np.array(P["table"]["H"]), P["k1"]
    to_ph = lambda px: apply(H, undistort(px, k1))
    out = {"ok": True, "exposure": P["exposure"], "cards": len(found)}
    allm = {d.tag_id: d.corners for d in cam.det.detect(gray)}
    r = [allm.get(t) for t in RULER["ids"]]
    if all(x is not None for x in r):
        d_ph = float(np.linalg.norm(to_ph(r[0]).mean(0) - to_ph(r[1]).mean(0)))
        P["scale_ruler"] = round(RULER["mm"] / d_ph, 2)
        out["scale_ruler"], out["scale_typed"] = P["scale_ruler"], TYPED
    else:
        out["ruler"] = "not seen"
    scale = P.get("scale_ruler") if lu.scale_from == "ruler" and P.get("scale_ruler") else TYPED

    from track import similarity
    tags, ids = [], list(FACE["ids"])
    for cid, corners in sorted(found.items()):
        to_img = similarity(corners)
        face = to_ph(apply(to_img, [[18.5, 1], [119, 1], [119, 29], [18.5, 29]]))
        u = to_ph(apply(to_img, [[0, 15], [1, 15]]))
        ang = float(np.degrees(np.arctan2(*(u[1] - u[0])[::-1])))
        for at in FACE["at_mm"]:
            if not ids:
                break
            c = to_ph(apply(to_img, [at]))[0]
            tags.append({"id": ids.pop(0), "card": int(cid), "c": c.round(5).tolist(), "angle": round(ang, 2),
                         "size": FACE["size_mm"] / scale, "face": face.round(5).tolist()})
    out["tags"] = tags
    lu.prep = tags
    return out, gray


def step_card(lu, cam, drawn):
    """Step 2b: the app shows a tag on each card's face. Fit the card-height line-up from their centres, and say how
    far off card tops would be with the table's line-up only, and with a 4-number fix of it (one plane plus a height)."""
    P = lu.pending
    want = {int(k): np.array(v) for k, v in drawn.items()}
    res = None
    for f in [1 / 3, 1 / 6, 1 / 2, 1.0]:  # the room exposure clips projected white on paper: go shorter
        ms, gain = cam.fixed or (20.0, 1.0)
        cam.expose(max(ms * gain * f, 0.5), 1.0)
        found, gray, meta = find(cam, set(want), len(want), tries=3, settle=3)
        if res is None or len(found) > len(res[0]):
            res = (found, gray, f)
        if len(found) >= max(4, 0.75 * len(want)):
            break
    cam.room()
    found, gray, f = res
    if len(found) < 4:
        return {"ok": False, "why": f"saw {len(found)} of {len(want)} face tags"}, gray
    ids = sorted(found)
    k1, Ht = P["k1"], np.array(P["table"]["H"])
    src = undistort(np.array([found[t].mean(0) for t in ids]), k1)
    dst = np.array([want[t] for t in ids])
    scale = P.get("scale_ruler") if lu.scale_from == "ruler" and P.get("scale_ruler") else TYPED
    on_table = apply(Ht, src)
    e_table = np.linalg.norm(on_table - dst, axis=1) * scale
    shift = ((dst - on_table) * scale).round(1).tolist()
    sim = fit_similarity(on_table, dst)  # one plane plus a height: the table line-up, scaled and shifted
    e_sim = np.linalg.norm(apply(sim, on_table) - dst, axis=1) * scale
    loo_sim, loo_h = [], []
    for i in range(len(ids)):  # leave one out: how well each fit predicts a card it didn't see
        k = [j for j in range(len(ids)) if j != i]
        loo_sim.append(np.linalg.norm(apply(fit_similarity(on_table[k], dst[k]), on_table[i:i + 1]) - dst[i]) * scale)
        if len(k) >= 6:
            loo_h.append(np.linalg.norm(apply(fit_homography(src[k], dst[k]), src[i:i + 1]) - dst[i]) * scale)
    out = {"ok": True, "n": len(found), "of": len(want), "exp_factor": round(f, 3),
           "table_only_mm": stats(e_table), "shift_mm": dict(zip(map(str, ids), shift)),
           "plane_plus_height_mm": stats(e_sim), "plane_plus_height_loo_mm": stats(loo_sim),
           "sim": {"scale": round(float(np.sqrt(abs(np.linalg.det(sim[:2, :2])))), 5),
                   "rot_deg": round(float(np.degrees(np.arctan2(sim[1, 0], sim[0, 0]))), 3)}}
    if len(ids) >= 8:
        Hc = fit_homography(src, dst)
        out["two_planes_mm"] = stats(np.linalg.norm(apply(Hc, src) - dst, axis=1) * scale)
        out["two_planes_loo_mm"] = stats(loo_h)
    # what the card line-up uses: its own homography with 8+ tags, else the table's with the 4-number fix
    Hc = fit_homography(src, dst) if len(ids) >= 8 and lu_fit == "homography" else sim @ Ht
    P["card"] = {"H": Hc.tolist(), "n": len(ids), "fit": "homography" if len(ids) >= 8 and lu_fit == "homography" else "plane+height",
                 "err_mm": out.get("two_planes_mm") if len(ids) >= 8 and lu_fit == "homography" else out["plane_plus_height_mm"]}
    out["used"] = P["card"]["fit"]
    return out, gray


lu_fit = "homography"  # vision.py --card-fit
