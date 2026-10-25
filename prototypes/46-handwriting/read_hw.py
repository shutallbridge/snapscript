"""PROTOTYPE (#46), throwaway: can TrOCR read handwritten cards at U = 25, 30, 35 mm?

Runs on the Pi (or on the Mac with --image). Takes one frame with focus and
exposure locked, finds the markers, cuts out each card's writing space
(cards.json says where it is, relative to the markers on the same page), and
reads it with every model given. Prints a table per U size.

    venv/bin/python read_hw.py --af --label near-16           # capture in the 16 MP mode, then read
    venv/bin/python read_hw.py --af --mode 64 --label near-64 # the 64 MP mode
    venv/bin/python read_hw.py --image runs/x.jpg --label x   # read a saved frame again

Writes runs/<label>-<time>.jpg (the frame), .json (every read) and -crops.png
(each crop with what it should say and what was read).
"""

import argparse
import json
import time
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from pupil_apriltags import Detector

from trocr import TrOCR

HERE = Path(__file__).parent
MODES = {"16": (4624, 3472), "64": (9248, 6944)}
CORNERS = np.array([[-1, 1], [1, 1], [1, -1], [-1, -1]]) * 5 / 9 / 2  # detector corners, × tag size, y down
CROP_PX_PER_MM = 6  # resample crops to this; TrOCR squashes them to 384×384 anyway


def capture(args) -> Image.Image:
    from libcamera import controls
    from picamera2 import Picamera2

    w, h = MODES[args.mode]
    cam = Picamera2()
    cam.configure(cam.create_still_configuration(main={"size": (w, h), "format": "RGB888"}, raw={"size": (w, h)}, buffer_count=1))
    cam.start()
    time.sleep(1.0)
    if args.af:
        cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
        ok = cam.autofocus_cycle()
        lens = cam.capture_metadata()["LensPosition"]
        print(f"autofocus {'ok' if ok else 'FAILED'}: LensPosition {lens:.2f}")
    else:
        lens = args.lens
    cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": lens})
    md = cam.capture_metadata()
    exposure, gain = args.exposure or md["ExposureTime"], args.gain or md["AnalogueGain"]
    cam.set_controls({"AeEnable": False, "ExposureTime": int(exposure), "AnalogueGain": float(gain)})
    time.sleep(0.5)
    for _ in range(3):
        cam.capture_metadata()
    arr = cam.capture_array("main")
    md = cam.capture_metadata()
    cam.stop()
    cam.close()
    print(f"locked: LensPosition {md.get('LensPosition', lens):.2f}, ExposureTime {md['ExposureTime']} us, "
          f"AnalogueGain {md['AnalogueGain']:.2f}, Lux {md.get('Lux', 0):.0f}")
    return Image.fromarray(arr[:, :, ::-1])  # Picamera2's RGB888 is BGR in memory


def homography(src: np.ndarray, dst: np.ndarray) -> np.ndarray:
    """Least-squares H with dst ~ H @ src (points as rows)."""
    rows = []
    for (x, y), (u, v) in zip(src, dst):
        rows.append([x, y, 1, 0, 0, 0, -u * x, -u * y, -u])
        rows.append([0, 0, 0, x, y, 1, -v * x, -v * y, -v])
    h = np.linalg.svd(np.array(rows))[2][-1].reshape(3, 3)
    return h / h[2, 2]


def crop(img: Image.Image, H: np.ndarray, rect) -> Image.Image:
    x, y, w, h = rect
    k = CROP_PX_PER_MM
    M = H @ np.array([[1 / k, 0, x], [0, 1 / k, y], [0, 0, 1]])  # crop px -> page mm -> frame px
    M /= M[2, 2]
    return img.transform((round(w * k), round(h * k)), Image.PERSPECTIVE, M.flatten()[:8].tolist(), Image.BICUBIC)


def px_per_mm(H: np.ndarray, x: float, y: float) -> float:
    p = [H @ [x + dx, y + dy, 1] for dx, dy in ((0, 0), (1, 0), (0, 1))]
    p = [q[:2] / q[2] for q in p]
    (ax, ay), (bx, by) = p[1] - p[0], p[2] - p[0]
    return float(np.sqrt(abs(ax * by - ay * bx)))


def levenshtein(a: str, b: str) -> int:
    row = list(range(len(b) + 1))
    for i, ca in enumerate(a, 1):
        prev, row[0] = row[0], i
        for j, cb in enumerate(b, 1):
            prev, row[j] = row[j], min(row[j] + 1, row[j - 1] + 1, prev + (ca != cb))
    return row[-1]


def norm(s: str) -> str:
    return "".join(s.split())  # gaps in handwriting are ignored


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--label", required=True)
    ap.add_argument("--image", help="read this saved frame instead of capturing")
    ap.add_argument("--mode", choices=MODES, default="16")
    ap.add_argument("--af", action="store_true", help="autofocus once, then lock")
    ap.add_argument("--lens", type=float, default=3.6)
    ap.add_argument("--exposure", type=int, help="µs; default: what auto exposure picked")
    ap.add_argument("--gain", type=float)
    ap.add_argument("--models", default="trocr-small-handwritten/int8,trocr-small-handwritten/fp32",
                    help="comma-separated folders under models/")
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    cards = {c["id"]: c for c in json.loads((HERE / "cards.json").read_text())}
    runs = HERE / "runs"
    runs.mkdir(exist_ok=True)
    stem = runs / f"{args.label}-{time.strftime('%Y%m%d-%H%M%S')}"

    if args.image:
        img = Image.open(args.image).convert("RGB")
    else:
        img = capture(args)
        img.save(f"{stem}.jpg", quality=95)
    gray = np.asarray(img.convert("L"))
    print(f"frame {img.width}×{img.height}")

    t0 = time.perf_counter()
    dets = Detector(families="tagStandard41h12", nthreads=4, quad_decimate=1.0 if img.width < 6000 else 2.0).detect(gray)
    print(f"markers: {len(dets)} in {time.perf_counter() - t0:.2f} s")

    # One homography per printed page, from every marker read on it: page mm -> frame px.
    by_page = defaultdict(list)
    for d in dets:
        if d.tag_id in cards:
            by_page[cards[d.tag_id]["page"]].append(d)
    H = {}
    for page, ds in by_page.items():
        src = np.concatenate([np.array(cards[d.tag_id]["tag_center"]) + CORNERS * cards[d.tag_id]["tag_mm"] for d in ds])
        H[page] = homography(src, np.concatenate([d.corners for d in ds]))

    in_view = [c for c in cards.values() if c["page"] in H]
    print(f"pages in view: {sorted(p + 1 for p in H)}; cards: {len(in_view)}")
    crops_dir = Path(f"{stem}-crops")
    models = {m: TrOCR(HERE / "models" / m, args.threads) for m in args.models.split(",")}

    results = []
    for c in sorted(in_view, key=lambda c: c["id"]):
        im = crop(img, H[c["page"]], c["write"])
        r = {"id": c["id"], "u_mm": c["u_mm"], "length_u": c["length_u"], "want": c["text"], "page": c["page"] + 1,
             "px_per_mm": round(px_per_mm(H[c["page"]], *c["tag_center"]), 2), "reads": {}}
        for name, model in models.items():
            out = model.read(im)
            got, want = norm(out["text"]), norm(c["text"])
            out.update(exact=got == want, nocase=got.lower() == want.lower(), edits=levenshtein(got, want))
            r["reads"][name] = out
        results.append((r, im))
        crops_dir.mkdir(exist_ok=True)
        im.save(crops_dir / f"{c['id']}.png")

    # Tables: one row per card, grouped by U.
    for u in sorted({r["u_mm"] for r, _ in results}):
        rows = [r for r, _ in results if r["u_mm"] == u]
        print(f"\n== U = {u} mm  ({len(rows)} cards, ~{np.mean([r['px_per_mm'] for r in rows]):.2f} px/mm)")
        print(f"{'want':<14}{'len':>4}  " + "  ".join(f"{m.split('/')[-1] + ' read':<16}{'p':>5}" for m in models))
        for r in rows:
            cells = []
            for m in models:
                o = r["reads"][m]
                mark = "✓" if o["exact"] else ("~" if o["nocase"] else "✗")
                cells.append(f"{mark} {o['text'][:14]:<14}{o['min_p']:>5.2f}")
            print(f"{r['want']:<14}{r['length_u']:>3}U  " + "  ".join(cells))
        for m in models:
            os_ = [r["reads"][m] for r in rows]
            chars = sum(len(norm(r["want"])) for r in rows)
            print(f"  {m}: exact {sum(o['exact'] for o in os_)}/{len(os_)}, ignoring case {sum(o['nocase'] for o in os_)}/{len(os_)}, "
                  f"char errors {sum(o['edits'] for o in os_)}/{chars}, "
                  f"time per card {np.mean([o['encode_s'] + o['decode_s'] for o in os_]):.2f} s "
                  f"(encode {np.mean([o['encode_s'] for o in os_]):.2f})")
    if len(models) == 2:
        a, b = models
        same = sum(r["reads"][a]["text"] == r["reads"][b]["text"] for r, _ in results)
        print(f"\n{a} vs {b}: same text on {same}/{len(results)} cards")

    Path(f"{stem}.json").write_text(json.dumps({"args": vars(args), "results": [r for r, _ in results]}, indent=1))
    contact_sheet([x for x in results], list(models), Path(f"{stem}-crops.png"))
    print(f"\nwrote {stem}.json, {stem}-crops.png")


def contact_sheet(results, models, path: Path) -> None:
    """Each crop, at the size the camera saw it, with what it should say and what each model read."""
    font = ImageFont.load_default(size=16)
    w = 900
    tiles = []
    for r, im in results:
        im = im.copy()
        im.thumbnail((560, 160))
        lines = [f"{r['want']!r}  U={r['u_mm']} {r['length_u']}U  {r['px_per_mm']} px/mm"] + [
            f"{'ok' if o['exact'] else 'case' if o['nocase'] else 'XX'} {m.split('/')[-1]}: {o['text']!r} p={o['min_p']:.2f}"
            for m in models for o in [r["reads"][m]]]
        tile = Image.new("RGB", (w, max(im.height, 22 * len(lines)) + 8), "white")
        tile.paste(im, (4, 4))
        dr = ImageDraw.Draw(tile)
        for i, line in enumerate(lines):
            bad = i > 0 and line.startswith("XX")
            dr.text((im.width + 14, 4 + 22 * i), line, fill="red" if bad else "black", font=font)
        tiles.append(tile)
    sheet = Image.new("RGB", (w, sum(t.height for t in tiles) or 1), "#ccc")
    y = 0
    for t in tiles:
        sheet.paste(t, (0, y))
        y += t.height
    sheet.save(path)


if __name__ == "__main__":
    main()
