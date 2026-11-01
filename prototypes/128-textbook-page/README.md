# Prototype: a textbook page on the rig

Throwaway, for [Prototype a textbook page on A4 with a page marker, on the rig](https://github.com/shutallbridge/snapscript/issues/128).

Two Session B beats ("0. Get a canvas", "1. Put something on it") as A4 pages, each with a real 13 mm `tagStandard41h12` page marker. On the rig, the projector splits the table into a **coding space** (left) and a **canvas space** (right, a stand-in for the running sketch), projects the current page's **virtual cards** in the coding space, and cuts every page in view out of the light, so nothing lands on the paper.

| File | What |
|---|---|
| `pages.json` | the pages: marker IDs and where they sit on the paper, text, program. Read by everything below |
| `pages.html` | the A4 pages to print. No card pictures: a callout points at the virtual cards on the table |
| `table.html` | what the projector shows (fullscreen Chromium on the Pi); virtual cards drawn with `sheets.js` (copied from #101) |
| `vision.py` | on the Pi: camera → markers → where each page lies → `state.json` |
| `geometry.py` | placing a page from its marker(s); `test_geometry.py` checks it on the rendered pages |
| `gen_tags.py` | writes `tags.js`, the real marker bits (pages 2000–2009, line-up tags 2100–2111) |
| `pi.sh` | run commands on the Pi / copy files, over password SSH (`PI_PASS=… ./pi.sh 'cmd'`) |

Pages: `0` (marker 2000), `1` (marker 2001), `1b` (same as `1`, markers 2002 top-left and 2003 bottom-right, for the one-or-two-markers check).

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

```sh
./pi.sh 'mkdir -p snap-128' && ./pi.sh put 'pages.json table.html sheets.js tags.js p5.min.js vision.py geometry.py' snap-128/
./pi.sh 'cd snap-128 && nohup python3 -m http.server 8128 --bind 127.0.0.1 >/dev/null 2>&1 &'
# Chromium fullscreen on http://localhost:8128/table.html, then:
./pi.sh 'cd snap-128 && ~/marker46/venv/bin/python vision.py --label rig-1'
```

`vision.py` flags: `--res full|half`, `--rule sticky|inview` (which page is current), `--fit similarity|homography`, `--grace` (s a page stays in view after its last read), `--aspect` (projector width / height).

`control.json` steers both without a keyboard (bump `rev` to reload `table.html`):

```json
{ "rev": 1, "calibrate": 1, "snap": 0,
  "view": { "margin": 10, "outline": false, "lit": false, "cards": true, "hud": true } }
```

- `calibrate`: bump it, and the projector shows 12 tags for a moment while `vision.py` lines up camera and projector (`calib.json`).
- `snap`: bump it to save the frame with the markers and page outlines drawn on it, in `runs/`.
- `view.margin`: mm the cut-out reaches past the paper. `outline` draws the predicted paper edge in red. `lit` lights the whole table white except the cut-outs, to see how well a cut-out sits on its paper.
