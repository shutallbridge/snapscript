# Overhead cameras: which ones fit the budget, and at what height?

Research for #29, part of the map #26 (markers, camera and vision system).

**Question.** Which cameras in budget suit an overhead rig over a Snapscript table, and what height and pixels per mm does each give over a 90 × 60, 120 × 80 and 160 × 100 cm work area?

**Short answer.** Buy **two cameras** for the IRL experiment:

1. **Raspberry Pi Camera Module 3 (standard lens, not Wide)**, about $25, for the vision-server path (Pi + Python). Over the typical 120 × 80 cm table it hangs at about **1.2–1.8 m** and gives about **3 px/mm** at the lowest height.
2. **Logitech Brio 4K** (or the newer MX Brio), about $170, for the browser path (`getUserMedia`). Over 120 × 80 cm it hangs at about **0.9–1.1 m** and gives about **2.5 px/mm** at the lowest height.

Both read a 30 mm U card with roughly 80–100 pixels across its height at 120 × 80 cm. The 1080p class (C920) gives only about 40 pixels per U, so it makes a cheap baseline but is probably too coarse for handwriting. The Global Shutter camera has too few pixels. The full height table is in [Recommendation](#recommendation).

Everything below the recommendation explains how these numbers come out, with sources.

---

## Words used here

- **Field of view (FOV)**: how wide the camera sees, as an angle. Datasheets give it horizontally (H), vertically (V) or across the diagonal (D). A wider angle sees the same table from a lower height.
- **Pixels per mm (px/mm)**: how many image pixels land on 1 mm of the table. It is the one number that says whether a marker or a handwritten letter is big enough to read. It falls as the camera goes higher. **Pixels per U** is px/mm × 30, the number of pixels across the height of one card at U = 30 mm.
- **Fit height**: the lowest height at which the whole table fits in the image. The camera must hang at least this high.
- **Depth of field**: how far in front of and behind the focus point things stay sharp. The table is flat, so this only needs to cover the table itself plus a little slack.
- **Lens distortion**: wide lenses bend straight lines outward near the edges ("barrel distortion"). Software can undo it after a one-off calibration with a printed checkerboard ([OpenCV camera calibration tutorial](https://docs.opencv.org/4.x/dc/dbb/tutorial_py_calibration.html)). It also means edge pixels cover more table, so px/mm at the edges is lower than the average figures below.
- **Binning**: the sensor adds up 2 × 2 groups of pixels to give a faster, quarter-size image. Faster frames, but half the px/mm.
- **UVC**: the standard USB webcam protocol. Any UVC camera works in a browser and on any OS without drivers.
- **libcamera / Picamera2**: the Raspberry Pi camera software stack, and its Python library.

## How the geometry works

The camera points straight down at height *h* above the table. A lens with horizontal angle *H* sees a strip of table this wide:

```
seen width = 2 × h × tan(H / 2)
```

and the same for depth with the vertical angle *V*. So:

```
fit height = max( table width / (2 × tan(H/2)),  table depth / (2 × tan(V/2)) )
px/mm      = horizontal pixels / seen width
```

px/mm is the same in both directions (pixels are square), so it depends only on the camera and the height, not on the table. The table only sets the *lowest* height. The *highest* height is set by the px/mm that the markers and handwriting need, which #27, #28 and the IRL experiment decide.

Worked example, Camera Module 3 over 120 × 80 cm (H = 66°, V = 41°, 4608 px wide):

- width needs 1200 / (2 × tan 33°) = 924 mm
- depth needs 800 / (2 × tan 20.5°) = 1070 mm, the larger, so **fit height ≈ 107 cm**
- seen width at 107 cm = 2 × 1070 × tan 33° = 1390 mm, so px/mm = 4608 / 1390 ≈ **3.3 px/mm**, about **99 px per 30 mm U**

Depth wins here because the sensor is 16:9 and the table is 3:2, so the image is "too wide" for the table and the camera must go up until the depth fits. Some width is wasted. A 4:3 sensor (HQ camera) wastes less.

These are straight-down, exact-fit numbers from datasheet angles. A real rig needs some slack (about 10% higher) for misalignment, and if the camera sits off to one side of the projector and tilts, the far side of the table gets fewer px/mm.

## The candidates

### Raspberry Pi cameras (connect by ribbon cable to a Pi; need a Pi vision server)

All figures from the [Raspberry Pi camera hardware specification](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/camera/hardware_specification.adoc) unless noted.

| | Camera Module 3 | Camera Module 3 Wide | HQ Camera | Global Shutter |
|---|---|---|---|---|
| Sensor | Sony IMX708 | Sony IMX708 | Sony IMX477 | Sony IMX296 |
| Full resolution | 4608 × 2592 (11.9 MP) | 4608 × 2592 | 4056 × 3040 (12.3 MP) | 1456 × 1088 (1.58 MP) |
| Lens | fixed, 4.74 mm f/1.8 | fixed, 2.75 mm f/2.2 | interchangeable (C/CS or M12 mount) | interchangeable (C/CS) |
| FOV H × V | 66° × 41° | 102° × 67° | depends on lens | depends on lens |
| Focus | motorised autofocus, 10 cm–∞ | motorised autofocus, 5 cm–∞ | manual ring on lens | manual ring on lens |
| Full-res frame rate | 14.35 fps | 14.35 fps | 10 fps | 60 fps |
| Faster modes | 2304 × 1296 @ 56 fps (binned) | same | 2028 × 1520 @ 40 fps (binned) | — |
| Price | from $25 ([product page](https://www.raspberrypi.com/products/camera-module-3/)) | ~$35 | ~$50 + lens | ~$50 + lens |

Full-resolution frame rates come from the sensor mode lists in the Raspberry Pi docs: IMX708 `4608x2592 [14.35 fps]` in the [CM camera page](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/computers/compute-module/cmio-camera.adoc), and IMX477 `4056x3040 [10.00 fps]` in [`rpicam` options](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/computers/camera/rpicam_options_common.adoc). Cards sit still, so 10–14 fps is plenty for reading the table; hands moving will blur slightly either way.

**HQ lenses** recommended by Raspberry Pi ([lens page](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/accessories/camera/lens.adoc)):

| Lens | Mount | FOV on HQ (H × V) | Rated resolution |
|---|---|---|---|
| 6 mm f/1.2 wide (CGL) | CS | 55° × 45° | **3 MP** |
| 8 mm f/1.8 (Gaojia) | M12 (HQ M12 version) | 49° × 36° | 12 MP |
| 16 mm, 25 mm, fisheye | | too narrow or too distorted for this rig | |

The 6 mm lens is the cheap obvious choice but is rated for only 3 MP, so on a 12 MP sensor it will look soft: the pixels are there but the lens can't fill them with detail. The M12 8 mm lens is rated for 12 MP but is narrower, so the camera must hang higher (about 1.3 m for 120 × 80 cm).

**Global Shutter**: "global shutter" means the whole image is captured at one instant, so fast motion does not skew. We don't need that (cards are still), and 1.58 MP gives only ~1.2 px/mm at 120 × 80 cm. Not a good fit.

**Image control on the Pi.** libcamera gives full manual control ([`rpicam` options](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/computers/camera/rpicam_options_common.adoc); the same controls exist in [Picamera2](https://github.com/raspberrypi/documentation/blob/develop/documentation/asciidoc/computers/camera/libcamera_python.adoc)):

- `--autofocus-mode manual` with `--lens-position` locks Camera Module 3's focus at a set distance, given in dioptres (1 / metres; `0.9` ≈ 1.1 m). Locking matters: in the default continuous mode the lens may refocus on a hand reaching in.
- `--shutter` (exposure time in microseconds), `--gain` and `--awbgains` fix exposure and colour, so a projector or a hand in frame doesn't make the image brighten and darken.

**Software path.** A Pi camera is not a USB webcam. The documented route is Python with Picamera2 on the Pi itself, which is the "vision server" option in #31. Getting a Pi camera into a browser's `getUserMedia` is not a documented path; plan on Python if you choose a Pi camera.

### USB webcams (UVC; work in a browser or on a Pi)

| | Logitech C920 / C920s | Logitech Brio 4K | Logitech MX Brio |
|---|---|---|---|
| Max resolution | 1920 × 1080 @ 30 fps | 4K @ 30 fps (up to 4096 × 2160); 1080p @ 60 | 3840 × 2160 @ 30 fps; 1080p @ 60 |
| Sensor | not stated | 13 MP | 8.5 MP Sony STARVIS |
| Diagonal FOV | 78° | 90° / 78° / 65° presets | 90° / 78° / 65° presets |
| H × V (derived, 16:9) | ≈ 70° × 43° | ≈ 82° × 52° at 90° | ≈ 82° × 52° at 90° |
| Focus | autofocus | autofocus | autofocus |
| Price (Logitech US) | ~$60–70 | ~$170 | ~$170–200 |

Sources: [C920s product page](https://www.logitech.com/en-us/products/webcams/c920s-pro-hd-webcam.960-001257.html), [Brio product page](https://www.logitech.com/en-us/products/webcams/brio-4k-hdr-webcam.960-001105.html), [MX Brio product page](https://www.logitech.com/en-us/products/webcams/mx-brio-4k-webcam.html). Logitech gives only the diagonal angle; the H × V values above are worked out from it assuming a 16:9 image and a normal (non-fisheye) lens, so treat them as ±a few degrees. The pixel width used for the 4K cameras below is 3840, the common UHD mode.

The Brio's narrower 78° and 65° presets are for framing a face. Use 90°, the widest, so the camera can hang lowest. Logitech does not say whether the presets crop the sensor, so check in the experiment that 90° at 4K gives the full pixel count.

**Worth knowing: a USB camera with interchangeable lenses.** Arducam sells UVC boards for the same IMX477 sensor as the HQ camera, e.g. a 12 MP USB 2.0 camera with a CS-mount lens delivering MJPEG at 4032 × 3040 @ 10 fps and 3840 × 2160 @ 20 fps ([retailer listing of Arducam's spec](https://www.robotshop.com/products/arducam-12mp-imx477-usb-camera-module-w-6mm-cs-mount-lens); Arducam's own page was not reachable). That would give HQ-camera pixels in a browser. It is a fallback if a Logitech can't be made to hold focus and exposure; it's a less common product, so check stock and price before relying on it.

**Image control in the browser.** The [W3C Image Capture spec](https://w3c.github.io/mediacapture-image/) (still an Editor's Draft) adds camera controls to `getUserMedia` constraints: `focusMode` (`manual`, `single-shot`, `continuous`), `focusDistance`, `exposureMode`, `exposureTime`, `whiteBalanceMode`, `colorTemperature`, `zoom` and others ([MDN `MediaTrackConstraints`](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)). Chromium implements these for UVC webcams on all three desktop OSes; its source reads and writes the UVC focus and exposure controls on macOS ([`uvc_control_mac.mm`](https://source.chromium.org/chromium/chromium/src/+/main:media/capture/video/mac/uvc_control_mac.mm)), Linux ([`v4l2_capture_delegate.cc`](https://source.chromium.org/chromium/chromium/src/+/main:media/capture/video/linux/v4l2_capture_delegate.cc), `V4L2_CID_FOCUS_AUTO`, `V4L2_CID_EXPOSURE_ABSOLUTE`) and Windows. Plan on **Chrome** (or Edge) for the browser path; whether Firefox and Safari expose these controls was not verified.

**Getting full resolution in the browser.** Ask for it with constraints such as `{ video: { width: { ideal: 3840 }, height: { ideal: 2160 } } }`. With `ideal`, the browser picks the closest mode the camera offers; with `exact`, it fails if it can't ([MDN `MediaTrackConstraints`](https://developer.mozilla.org/en-US/docs/Web/API/MediaTrackConstraints)). So the app must read back `track.getSettings()` to see what it actually got. No hard browser cap on resolution was found in the sources, but the delivered size depends on the browser, OS and USB port, so the IRL experiment should confirm that Chrome delivers 3840 × 2160 from the Brio on the actual laptop. 4K over USB generally needs a USB 3 port (not verified for each model; the MX Brio ships with a USB-C 3.x cable).

## Height and pixels per mm, every candidate

Exact fit, straight down, from the datasheet angles. Format: **fit height · px/mm · px per 30 mm U**. The camera can go higher than the fit height; px/mm then drops in proportion.

| Camera | 90 × 60 cm | 120 × 80 cm | 160 × 100 cm |
|---|---|---|---|
| Pi Camera Module 3 (66° × 41°, 4608 px) | 80 cm · 4.4 · 133 | 107 cm · 3.3 · 99 | 134 cm · 2.7 · 80 |
| Pi Camera Module 3 Wide (102° × 67°) | 45 cm · 4.1 · 123 | 60 cm · 3.1 · 93 | 76 cm · 2.5 · 74 |
| Pi HQ + 6 mm (55° × 45°, 4056 px) | 86 cm · 4.5 · 135 | 115 cm · 3.4 · 101 | 154 cm · 2.5 · 76 |
| Pi HQ + 8 mm M12 (49° × 36°) | 99 cm · 4.5 · 135 | 132 cm · 3.4 · 101 | 176 cm · 2.5 · 76 |
| Pi Global Shutter + 6 mm (45° × 34°, 1456 px) | 109 cm · 1.6 · 49 | 145 cm · 1.2 · 36 | 193 cm · 0.9 · 27 |
| Logitech C920 (≈70° × 43°, 1920 px) | 76 cm · 1.8 · 54 | 101 cm · 1.4 · 40 | 126 cm · 1.1 · 32 |
| Logitech Brio 4K / MX Brio at 90° (≈82° × 52°, 3840 px) | 61 cm · 3.6 · 108 | 82 cm · 2.7 · 81 | 102 cm · 2.2 · 65 |

Notes on reading this:

- The Wide Camera Module 3 fits very low, but at 102° the corners are heavily distorted and the edges get far fewer px/mm than the average shown. A low camera also sits in the way of hands and the projector. It's useful only if the rig can't go higher than ~0.8 m.
- The HQ + 6 mm figures look as good as Camera Module 3, but the 6 mm lens is rated for only 3 MP, so the real detail is lower than the pixel count suggests.

**The highest height** depends only on the camera and the px/mm the vision needs, which is not decided yet. For reference:

| Camera | height at 3 px/mm | at 2 px/mm | at 1.5 px/mm |
|---|---|---|---|
| Pi Camera Module 3 | 118 cm | 177 cm | 237 cm |
| Pi HQ + 8 mm M12 | 148 cm | 223 cm | 297 cm |
| Logitech Brio 4K / MX Brio | 73 cm | 110 cm | 147 cm |
| Logitech C920 | 45 cm | 68 cm | 91 cm |

What px/mm is "enough" is for #27 (markers), #28 (handwriting) and the IRL experiment to say. As a sense of scale: at 2 px/mm a 30 mm U is 60 px tall and a 5 mm handwritten letter is about 10 px tall; at 3 px/mm they are 90 px and 15 px.

## Focus and depth of field

Depth of field is not a problem for a flat table. For Camera Module 3 (4.74 mm, f/1.8), taking "sharp" as a blur no bigger than 2 pixels (2.8 µm), the hyperfocal distance is 4.74² / (1.8 × 0.0028) ≈ 4.5 m. Focused at 1.07 m, everything from about **0.86 m to 1.41 m** is sharp: a 55 cm band around a table that is flat to within a few mm. Webcams have similar short focal lengths, so the same holds.

What *is* a problem is **autofocus hunting**: a hand or a card held up near the lens can pull focus away from the table. Both recommended cameras let you lock focus (`--lens-position` on the Pi; `focusMode: "manual"` and `focusDistance` in Chrome). The HQ lenses are manual-only, which is fine once set, though at f/1.2 wide open the 6 mm lens has a much thinner sharp band; close the aperture down a little.

## Exposure and light

Lock exposure and white balance once the rig is set up, on either path (see above). Automatic exposure reacts to the projector, hands and sleeves, and changes how markers and ink look from frame to frame. Not researched here and worth testing in the IRL experiment: flicker or banding when a rolling-shutter camera films a projector-lit table, and whether room lighting is enough at a short exposure.

## Recommendation

Buy these for the IRL experiment:

1. **Raspberry Pi Camera Module 3, standard lens** (~$25, plus a Pi 4 or 5 and a longer ribbon cable if needed). The most pixels per dollar, with autofocus that can be locked, and full manual exposure through Picamera2. It is the camera for the "vision server" answer to #31.
2. **Logitech Brio 4K** (~$170), or the MX Brio at about the same price. The best in-budget camera that a browser can open directly, with focus and exposure controllable from Chrome. It is the camera for the "everything in the browser" answer to #31.

Optionally add a **Logitech C920** (~$60) as a low-cost baseline: if markers and handwriting still read at 1.4 px/mm, the budget can go down. Skip the Global Shutter and the Camera Module 3 Wide. Keep the HQ camera with the M12 8 mm lens in reserve in case Camera Module 3's small fixed lens turns out to be too soft at the edges.

Implied height range above the table, from the fit height plus 10% slack (lowest) to the height where px/mm falls to 2 (highest, a **provisional** floor until #27 and #28 set the real one):

| Table | Camera Module 3 | Brio 4K / MX Brio |
|---|---|---|
| 90 × 60 cm | 88–177 cm (4.0 → 2 px/mm) | 67–110 cm (3.3 → 2 px/mm) |
| 120 × 80 cm | 118–177 cm (3.0 → 2 px/mm) | 90–110 cm (2.5 → 2 px/mm) |
| 160 × 100 cm | 147–177 cm (2.4 → 2 px/mm) | about 102–110 cm with no slack; at 112 cm it drops just below 2 px/mm |

In words: Camera Module 3 hangs about 1.2–1.8 m over a typical table, and a Brio about 0.9–1.1 m. The Brio's range is narrow and closes up for a 160 × 100 cm table, so if the px/mm floor ends up above 2, or tables are large, Camera Module 3 (or the HQ with the 8 mm lens) is the safer choice. The projector choice should take these heights as its input: it must cover the same table from roughly the same height.

## Open points

- **The px/mm floor.** Set by #27, #28 and the IRL experiment. It sets the highest height and may rule out the Brio for large tables.
- **Browser delivery of 4K.** Confirm in Chrome on the real laptop that `getSettings()` reports 3840 × 2160 and that focus and exposure lock.
- **Brio FOV presets.** Check that the 90° preset gives the full 4K image and isn't cropped.
- **Camera placement next to the projector.** An offset, tilted camera loses px/mm on the far side; the figures here assume straight down.
- **Projector flicker** on rolling-shutter cameras: test.
