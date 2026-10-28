# PROTOTYPE (#46): flicker and wash-out with the projector on

Throwaway. Answers check 4 of #46: does the single-chip DLP projector (Optoma ZH521ST) put flicker or banding into the camera's frames, and does projected light wash out markers or handwriting? Also sets the rig's focus.

Rig: Pi 5 + Arducam OwlSight (OV64A40) in the 16 MP mode, lens 112 cm above a 120 × 80 cm table. Projector on HDMI from the Pi, Low Latency Mode, brightness 100%. Indoor lighting plus some sunlight, about 250–400 lux on the table.

## Files

All run on the Pi, in `~/flicker46` (`venv` is a link to `~/marker46/venv`). `pi.sh` is the SSH helper from the marker prototype.

- `focus_sweep.py`: steps `LensPosition` and scores sharpness (variance of the Laplacian) around every marker, near and far halves of the frame separately. Saves crops per step.
- `show.py`: a full-screen window on the projector (`DISPLAY=:0 python3 show.py &`). It shows whatever `/tmp/flicker46-show` says: `#rrggbb`, or `image <path>`.
- `flicker_sweep.py`: for each projected field (black, white, grey, red, green, blue) and each exposure time, takes 8 frames with gain 1 and white balance fixed, and measures banding in a patch of bare table. Banding is each frame's grey row profile minus the average over the frames (which removes the wood grain; the bands move between frames), in grey levels.
- `calibrate.py`: projects 9 dots one at a time and fits a homography from projector pixels to camera pixels (`calib.json`; fit error about 3 px, about 1.5 mm).
- `washout_markers.py`: finds the marker sheets (from `prototype/46-marker-size`), projects highlights aimed at them with `calib.json`, and for each pattern and exposure takes 30 frames and finds the smallest size that passes on each sheet (every copy read in at least 29 of 30 frames).
- `halves.py` + `washout_hw.sh`: projects black, white, near half lit, far half lit, and red over the near half; for each one, cuts the handwriting crops with `~/hw46/read_hw.py` and reads them with Gemma through `~/hw46/cloud_read.py` (raw crops, kind prompt, JPEG). See `prototype/46-handwriting`.
- HDMI rate: `wlr-randr --output HDMI-A-1 --mode 1920x1080@120Hz` (with `XDG_RUNTIME_DIR=/run/user/1000 WAYLAND_DISPLAY=wayland-0`). Use the `Hz` suffix; `@120.000000` is silently ignored.

## Results (2026-10-28)

- **Focus:** `LensPosition` 3.75. The near edge is sharpest at 3.75–3.9 and the far edge at 3.65–3.7; 3.75 keeps both at about 95% of their best (`runs/focus-*`, `runs/focus-grid.png`).
- **Banding:** the projector's colour cycle is 8.33 ms, at 60 Hz and at 120 Hz input. Every whole multiple of 8.33 ms has under 1 grey level of banding in every colour; other exposures have 2–17 (`runs/flicker-*`, `runs/white-strip.png`). With the projector black, room light alone bands at a 10 ms cycle (100 Hz lights), at most about 1 grey level.
- **Exposure:** 8.33 ms, gain 1. At 16.67 ms or gain 2, paper under projected white clips.
- **Markers** at 8.33 ms: 12 mm passes on every sheet under every pattern (lit, dark, red, mixed). With the projector off it was 11 mm (`runs/washout-markers-*`). No misreads.
- **Handwriting** at 8.33 ms: Gemma reads 77–81/96 exact and 49–54/60 real card text under every pattern, about the same as with the projector off (79–80/96, 50–52/60). The misses are the same cards every time (`runs/hw/`, `runs/hw-patterns.png`).
