# Prototype: a textbook page on the rig

Throwaway, for [Prototype a textbook page on A4 with a page marker, on the rig](https://github.com/shutallbridge/snapscript/issues/128).

Two Session B beats ("0. Get a canvas", "1. Put something on it") as A4 pages, each with a real 13 mm `tagStandard41h12` page marker. On the rig, the projector splits the table into a **coding space** (left) and a **canvas space** (right, a stand-in for the running sketch), projects the current page's **virtual cards** in the coding space, and cuts every page in view out of the light, so nothing lands on the paper.

| File | What |
|---|---|
| `pages.json` | the pages: marker IDs and where they sit on the paper, text, program. Read by everything below |
| `pages.html` | the A4 pages to print. No program pictures: a callout points at the virtual cards on the table. Cards named in the text (card notation in `pages.json`) are drawn as mini cards |
| `minis.js` | mini cards: the sibling of `sheets.js`'s card faces for running text. Same look and colours, its own sizes, only as long as its text; handwriting in black Kalam |
| `table.html` | what the projector shows (fullscreen Chromium on the Pi); virtual cards drawn with `sheets.js` (copied from #101) |
| `vision.py` | on the Pi: camera → markers → where each page lies → `state.json` |
| `geometry.py` | placing a page from its marker(s); `test_geometry.py` checks it on the rendered pages |
| `gen_tags.py` | writes `tags.js`, the real marker bits (pages 2000–2009, line-up tags 2100–2111) |
| `pi.sh` | run commands on the Pi / copy files, over password SSH (`PI_PASS=… ./pi.sh 'cmd'`) |

Pages: `0` (marker 2000), `1` (marker 2001), each with one marker at the bottom-right. Page `1b` (markers 2002 top-left and 2003 bottom-right) was used for the one-or-two-markers check on the rig and has since been dropped.

## Print

```sh
python3 -m http.server 8128   # then open http://localhost:8128/pages.html
```

Print at 100%, margins **none**, background graphics on. Check the 50 mm ruler at the bottom of each page.
`results/pages.pdf` is the same thing, printed by headless Chrome.

## Offline check (Mac)

```sh
uv run test_geometry.py            # 4 px/mm, about the rig's 16 MP detail
uv run test_geometry.py --px-per-mm 3
```

Before the rig (2026-11-01): fitting one marker's 4 corners with a full homography puts the paper's far corners 4–17 cm off, because 13 mm of marker can't pin down perspective across 297 mm. Fitting a rigid page (rotation, scale, shift) **on the table plane** puts them within ~1 mm (worst 3 mm) with one marker, and 0.1 mm with two. So `vision.py` maps detections through the camera-to-projector line-up first, then fits the page.

## On the Pi

`pi.sh put` copies one path at a time. The `start-*.sh` helpers run on the Pi and detach, so they outlive the SSH call.

```sh
./pi.sh 'mkdir -p snap-128'
for f in pages.json table.html sheets.js minis.js tags.js p5.min.js vision.py geometry.py start-*.sh; do ./pi.sh put $f snap-128/; done
./pi.sh 'bash ~/snap-128/start-http.sh'      # web server on :8128
./pi.sh 'bash ~/snap-128/start-chrome.sh'    # Chromium kiosk on the projector (no keyring prompt)
./pi.sh 'bash ~/snap-128/start-vision.sh rig --aspect 1.5 --table-mm 792 --rule inview'
```

`vision.py` flags: `--res full|half`, `--rule sticky|inview` (which page is current), `--fit similarity|homography`, `--grace` (s a page stays in view after its last read), `--aspect` (the work area's width / height; the projector's 16:9 spills past the table, so `table.html` keeps to the left `aspect` of the image), `--table-mm` (the work area's depth in mm: fixes a page's size, so its marker only sets where it lies; 0 = from the marker), `--smooth` / `--jump` / `--hold` (average readings into a still page; jump when a corner moves past `--jump` mm; only move what's projected once the average moves past `--hold` mm).

Calibration fits the projected tags' **centres** (glare grows every projected tag ~4%), spreads them to 8 cm from the work area's edges (`calib.inset`), and fits one radial lens term `k1` with the camera-to-projector homography; detections are undistorted with it.

`control.json` steers both without a keyboard (bump `rev` to reload `table.html`):

```json
{ "rev": 1, "calibrate": 1, "snap": 0,
  "view": { "margin": 10, "outline": false, "lit": false, "cards": true, "hud": true } }
```

- `calibrate`: bump it, and the projector shows 12 tags for a moment while `vision.py` lines up camera and projector (`calib.json`).
- `snap`: bump it to save the frame with the markers and page outlines drawn on it, in `runs/`.
- `view.margin`: mm the cut-out reaches past the paper. `outline` draws the predicted paper edge in red. `lit` lights the whole table white except the cut-outs, to see how well a cut-out sits on its paper.

## On the rig (2026-11-01)

Rig: Pi 5, 64 MP camera at 4624x3472, Optoma 1080p, work area 120 x 80 cm (measured 79.2 cm deep from page `1b`). Marker search ~0.75 s a frame with a page in view.

- **Line-up:** 0.8 mm mean, 1.3 mm worst across the whole work area, after fitting tag centres, spreading the tags to the edges and the lens term (it started at 1.8 / 4.4 mm).
- **Size from one marker is unreliable:** pages read 3–4% too small or too large (8–10 mm at the far edge). Fixing the page's size from the known table depth (`--table-mm`) leaves only position and angle to fit.
- **Placement** (page `0`, measured by eye and ruler against the projected red outline): flat middle 2–3 mm, table corner ~3 mm, skewed 2–3 mm, at the table edge 2–3 mm, lifted 2–5 cm ~8 mm, held 10–20 cm up 10–15 mm (lifted pages are off the calibrated plane). The marker read in every frame even when held; the longest gap was 2 frames, inside the 1 s grace.
- **Jitter:** one marker's angle wobbles ~1°; averaging with a 2 mm hold moves the cut-out about once every 7–8 s on a still page.
- **One marker or two:** page `1` 2–3 mm, page `1b` ~2 mm. One marker, bottom-right (the top-left is stapled), is enough.
- **Turning pages:** the next page's bottom-right marker is the first thing uncovered, so the switch takes ~0.5 s. A hand covering a page past the grace makes it "arrive" again, so with two pages in view the newest-arrival rule can tie. `inview` chosen: no page, no virtual cards.
- **Reading:** virtual cards beside the page read fine. In `lit` mode the paper looks dark against the bright table; keep the area around a page dim.
- **Unknown IDs:** 4 single-frame false reads in 5,423 frames; never two frames running.

Photos (camera frames; the orange outline is `vision.py`'s estimate drawn on the frame, not the projected line): `results/rig-1-normal-page0.jpg` … `results/rig-7-calibration.jpg`.

