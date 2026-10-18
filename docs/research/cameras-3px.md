# Which cameras reach 3 px/mm, and at what height?

Research for "Which cameras reach 3 px/mm, and at what height?" (issue #42), part of the markers, camera and vision map (#26). It redoes the height ranges from "Which cameras fit the budget, and at what height?" (#29, write-up on branch `research/overhead-cameras`) at the stricter 3 px/mm that "How can short handwritten tokens on cards be recognised?" (#28) asks for: about 3 px per mm of table for mixed-case names, about 2 px/mm for digits only.

## Short answer

- **The deciding number is the sensor's pixel count, not its lens.** To reach 3 px/mm over a table with 10% slack, a camera needs at least **3.3 pixels per mm of table** along each side. The lens angle only decides *at what height* that happens.
- **Whole 120 × 80 cm table at 3 px/mm** needs about 3960 × 2640 pixels. The ~12 MP cameras (Camera Module 3, HQ, AI Camera) only just make it, at a single height. Nothing at 4K (3840 × 2160) makes it at all. **16 MP** (Arducam IMX519, 4656 × 3496) makes it with a usable ~1.0–1.2 m range. **64 MP** (Arducam OwlSight on a Pi, or Arducam's 64 MP USB camera) makes it easily, from about 1 m up to about 2.2 m.
- **Whole 160 × 100 cm at 3 px/mm** needs about 5280 × 3300 pixels: only the 64 MP cameras.
- **Card half (60 × 80 cm) or the small 90 × 60 cm table** at 3 px/mm: any camera here with ≥ 12 MP works over a comfortable range. 4K webcams work only in a narrow 68–74 cm band.
- **Pi or browser.** Ribbon-cable cameras (all Raspberry Pi cameras, Arducam's Pi modules) work only with a Pi + Python vision server. USB (UVC) cameras work in both. The only USB cameras that reach 3 px/mm over a whole 120 × 80 table are **Arducam's 16 MP and 64 MP USB modules**; no 4K webcam does.
- **Frame rate falls a lot at full resolution** on the high-pixel cameras: 16 MP at 8–9 fps, 64 MP at 1–2.6 fps. That fits the plan from #28: track markers on fast lower-resolution video and take an occasional full-resolution still for handwriting.

The height table is in [Height ranges](#height-ranges). Everything below explains it.

---

## Words used here

These are the same as in the earlier camera write-up.

- **px/mm**: how many image pixels land on 1 mm of the table. It falls as the camera goes higher.
- **Field of view (FOV)**: how wide the camera sees, as an angle: horizontal (H), vertical (V) or diagonal (D).
- **Fit height**: the lowest height at which the whole area fits in the image.
- **Binning**: the sensor adds 2 × 2 groups of pixels together. You get a faster, quarter-size image, at half the px/mm.
- **CSI (ribbon cable)**: how Raspberry Pi cameras plug into a Pi. Only a Pi (or similar board) can read them, through libcamera and its Python library Picamera2.
- **UVC**: the standard USB webcam protocol. A UVC camera works in a browser (`getUserMedia`) and on a Pi (OpenCV or V4L2) without drivers.

## The rule that decides it

Same geometry as before: the camera points straight down from height *h*, and a lens with horizontal angle *H* sees a strip `2 × h × tan(H/2)` wide.

```
lowest height  = 1.1 × max( W / (2·tan(H/2)),  D / (2·tan(V/2)) )     (area W × D fits, plus 10% slack)
highest height = N_h / (P × 2·tan(H/2))                                (px/mm has fallen to P)
```

`N_h` is the number of pixels across the image, and `P` is the px/mm you need (3 or 2).

Pixels are square, so px/mm is the same both ways. Put the two formulas together and the angles cancel out. **A camera reaches P px/mm over a W × D area, with 10% slack, exactly when**

```
pixels across  ≥ 1.1 × P × W      and      pixels down ≥ 1.1 × P × D
```

(with the camera turned so its long side runs along the area's long side). The lens doesn't come into it. Wider lenses just move the whole working range lower. So:

| Area (long × short) | pixels needed at 3 px/mm | at 2 px/mm |
|---|---|---|
| 90 × 60 cm | 2970 × 1980 | 1980 × 1320 |
| 120 × 80 cm | 3960 × 2640 | 2640 × 1760 |
| 160 × 100 cm | 5280 × 3300 | 3520 × 2200 |
| card half, 80 × 60 cm | 2640 × 1980 | 1760 × 1320 |

Compare with common sensors:

- 4K, 3840 × 2160: short on both sides for 120 × 80.
- Camera Module 3, 4608 × 2592: just short of 2640 down, so 3.0 px/mm exactly at the lowest height.
- HQ / AI Camera, 4056 × 3040: just over 3960 across, 3.07 px/mm.
- 16 MP, 4656 × 3496: comfortable.
- 64 MP, 9248 × 6944: about twice what's needed even for 160 × 100.

Two more things this shows:

- **A straight (rectilinear) lens looking straight down gives the same px/mm everywhere on the table**, because the table is parallel to the sensor. Only lens distortion (the barrel bulge of wide lenses) and blur near the edges lower it at the edges. So a "low distortion" wide lens is fine; a fisheye is not.
- **The card half is just a smaller area.** It assumes the camera is turned so its long side runs along the 80 cm side. Mounted the other way (long side across the 60 cm), 16:9 cameras do worse.

## The candidates

### Raspberry Pi cameras (CSI ribbon: Pi + Python only)

Sensor sizes, angles and frame rates come from the [Raspberry Pi camera hardware specification](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/camera/hardware_specification.adoc). Lens angles on the HQ camera come from the [Raspberry Pi lens page](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/camera/lens.adoc).

| Camera | Full resolution | FOV H × V | Full-res frame rate | Faster mode | Focus |
|---|---|---|---|---|---|
| Camera Module 3 (IMX708, ~$25) | 4608 × 2592 | 66° × 41° | 14.35 fps | 2304 × 1296 @ 56 fps (binned) | motorised AF, lockable |
| Camera Module 3 Wide (~$35) | 4608 × 2592 | 102° × 67° | 14.35 fps | same | motorised AF, lockable |
| AI Camera (IMX500) | 4056 × 3040 | 66° × 52.3° | 10 fps | 2028 × 1520 @ 30 fps | manual ring |
| HQ Camera (IMX477, ~$50 + lens) | 4056 × 3040 | depends on lens | 10 fps | 2028 × 1520 @ 40 fps | manual ring on lens |

The AI Camera wasn't on the list in the ticket. It's included because it turned up in the same spec table: same pixel count as the HQ, in a small fixed-lens module, with a 4:3 image that suits a 3:2 table better than Camera Module 3's 16:9.

**HQ lens choices.** The HQ sensor is 6.287 × 4.712 mm with 1.55 µm pixels. A lens must be rated for that pixel size (roughly "12 MP at 1/2.3 inch"), or the image is soft even though the pixel count is there.

| Lens | Mount | FOV on HQ (H × V) | Rated for | Source |
|---|---|---|---|---|
| Raspberry Pi 6 mm f/1.2 (CGL) | CS | 55° × 45° | **3 MP**: too soft for 3 px/mm | [RPi lens page](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/accessories/camera/lens.adoc) |
| Raspberry Pi 8 mm f/1.8 (Gaojia) | M12 | 49° × 36° | 12 MP | RPi lens page |
| Arducam LN024 6 mm | M12 | 50° H (V ≈ 38.5°, worked out) | low distortion (< 1%) | Arducam spec as reproduced by [RobotShop](https://www.robotshop.com/products/50-1-23-inch-m12-lens-w-lens-adapter-raspberry-pi-hq-camera) |
| Arducam LN069 2.7 mm f/2.8 | M12 | 100° × 83° (113° D) | low distortion (< −1.5%) | Arducam spec as reproduced by [Welectron](https://welectron.com/Arducam-LN069-100-Degree-Low-distortion-1-23-M12-Lens-with-Lens-Adapter-for-Raspberry-Pi-High-Quality-Camera) |
| RPi 16 mm, 25 mm; fisheye; Arducam LN064 120° (−39.6% distortion) | | too narrow or too distorted | | |

Arducam's own pages and docs (arducam.com, docs.arducam.com) block automated fetching, so the Arducam lens and module figures in this file come through retailers or search snippets that quote Arducam's specs. They are marked as such. Check them on the product page before buying.

Machine-vision C-mount lenses (Fujinon, Kowa, Computar) are an option for the HQ C/CS version. Many are rated in "MP" for bigger pixels than the HQ's 1.55 µm, though. For example, the [Fujinon HF6XA-5M](https://asset.fujifilm.com/www/my/files/2022-11/3b9d836f3bab9c91a290d142229195f0/hf6xa-5m.pdf) is rated for a 3.45 µm-pixel sensor. Such a lens would be the soft link, so it isn't recommended here.

**Image control** (same for every Pi camera): focus, exposure and white balance can be fixed through libcamera / Picamera2. See the earlier write-up.

### Arducam modules for the Pi (CSI ribbon: Pi + Python only)

| Camera | Full resolution | FOV H × V | Full-res frame rate | Faster modes | Software |
|---|---|---|---|---|---|
| Arducam 16 MP IMX519 autofocus (~$25) | 4656 × 3496 | 66° × 49.5° (80° D) | **9 fps** | 3840 × 2160 @ 18 fps is a *crop* (narrower view); 2328 × 1748 binned, full view | Raspberry Pi's libcamera supports it |
| Arducam 64 MP OwlSight (OmniVision OV64A40) | 9248 × 6944 | 68° × 56° (84° D) | **2.6 fps** (Pi 5 link speed), 2 fps (slower link) | 4624 × 3472 @ 10 fps (binned, full view); 3840 × 2160 @ 20 fps | Raspberry Pi's libcamera supports it |
| Arducam 64 MP Hawkeye | 9152 × 6944 | ≈ 72° × 54.6° (84° D) | **2.7 fps** | 4624 × 3472 binned | **not** in Raspberry Pi's libcamera; needs Arducam's own build |

Sources:
- **IMX519.** The [Linux driver in the Raspberry Pi kernel](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/imx519.c) gives the modes and frame rates: 4656 × 3496 at 100/900 s per frame = 9 fps, and the 3840 × 2160 mode cropped from the sensor centre. Lens figures (4.28 mm, f/1.75, 80° effective FOV) are Arducam's, via [The Pi Hut](https://thepihut.com/products/arducam-imx519-autofocus-camera-module-for-raspberry-pi). The 66° × 49.5° H × V is Arducam's figure from a search snippet. Working it out from the 4.28 mm lens and the 1.22 µm pixels gives about 67° × 53°, so the table uses the narrower, safer figure.
- **OwlSight.** [Arducam's OV64A40 product brief](https://core-electronics.com.au/attachments/uploads/Arducam-64mp-ov64a40-product-brief.pdf): resolution, FOV, the frame-rate table, and the note that the Pi 4 / CM4 may need memory (CMA) settings for full resolution. The [OV64A40 driver](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/ov64a40.c) confirms 2.6 fps / 2 fps at full resolution.
- **Hawkeye.** Driver: [`arducam_64mp.c`](https://github.com/raspberrypi/linux/blob/rpi-6.12.y/drivers/media/i2c/arducam_64mp.c), 9152 × 6944 at 100/270 s = 2.7 fps. FOV from [Arducam's Hawkeye docs](https://docs.arducam.com/Raspberry-Pi-Camera/Native-camera/64MP-Hawkeye/), via search snippet.
- **Software support.** Raspberry Pi's libcamera has tuning files for `imx519` and `ov64a40` but none for the Hawkeye's `arducam_64mp`, for either the Pi 5 ([pisp data](https://github.com/raspberrypi/libcamera/tree/main/src/ipa/rpi/pisp/data)) or older Pis ([vc4 data](https://github.com/raspberrypi/libcamera/tree/main/src/ipa/rpi/vc4/data)). **So prefer the OwlSight over the Hawkeye**: it works with the stock software.

Two things to know about 64 MP:

- **Python on the Pi gets slow.** One full frame is about 64 million pixels, roughly 190 MB as RGB. Use a Pi 5 with plenty of RAM, and plan to grab full-resolution stills only when handwriting needs reading, not as video.
- **The tiny lens may not resolve 1 µm pixels**, especially at the edges. This was not checked; test it. Even at half the real detail, the 64 MP cameras have plenty of slack (see the binned row in the height table).

### USB cameras (UVC: browser *and* Pi)

| Camera | Max resolution | FOV H × V | Frame rate at max | Focus | Notes |
|---|---|---|---|---|---|
| Logitech Brio 4K / MX Brio | 3840 × 2160 (Brio up to 4096 × 2160) | ≈ 82° × 52° (90° D, worked out) | 30 fps | autofocus, lockable in Chrome | from the earlier write-up |
| Elgato Facecam 4K ($199.99) | 3840 × 2160 | ≈ 82° × 52° (90° D, worked out) | 60 fps MJPG, 30 fps uncompressed | **fixed**, sharp 30–120 cm | [Elgato product page](https://www.elgato.com/us/en/p/facecam-4k); USB-C 3.0, UVC 1.5 |
| OBSBOT Tiny 2 | 3840 × 2160 | 72.9° H, ≈ 45° V (worked out) | 30 fps | PDAF autofocus / manual | [OBSBOT specs](https://www.obsbot.com/obsbot-tiny-2-4k-webcam/specs). The "50 MP" sensor still gives only 4K video. The gimbal tilts only 30° down, so it must be mounted at an angle or on its side to look straight down |
| Arducam 16 MP IMX519 USB 3.0 ($129.99) | 4656 × 3496 | ≈ 66° × 52° (78° D, worked out) | **8 fps** | fast autofocus | Arducam spec via search snippet ([product](https://www.arducam.com/product/arducam-16mp-imx519-motorized-focus-usb-3-0-camera-module/)) |
| Arducam 64 MP USB 3.0 (B0475) | 9248 × 6944 | ≈ 71.5° × 56.7° (84° D, worked out) | **1 fps** (4624 × 3472 and 3840 × 2160 at 5 fps; 2312 × 1736 at 30 fps) | motorised focus | YUY2 output, UVC, USB 3.2 Gen 1, Type-C. Arducam spec via search snippet ([product](https://www.arducam.com/product/arducam-64mp-motorized-focus-usb-3-0-camera-module-b0475/)) |

"Worked out" means the maker gives only the diagonal angle. H and V come from the diagonal and the image shape, assuming a normal (non-fisheye) lens, so treat them as ± a few degrees.

**In the browser.** Chrome has no resolution cap that would stop these: its media limits allow up to 32767 px per side and about 536 million pixels per frame ([`media/base/limits.h`](https://source.chromium.org/chromium/chromium/src/+/main:media/base/limits.h)). Whether Chrome actually delivers each camera's top mode, especially 64 MP YUY2 at 1 fps, depends on the camera, the OS and the USB port. Check `track.getSettings()` in the IRL experiment, as with the Brio. Arducam lists Windows and Linux. macOS should work because these are standard UVC devices, but that's not verified.

**On a Pi.** Any of these works through OpenCV / V4L2. Use a USB 3 port (the Pi 4 and Pi 5 have them).

## Height ranges

Straight down. **Lowest** = the area fits with 10% slack. **Highest** = px/mm has fallen to 3 (or 2). Each cell gives the range in cm, or **never** if even the lowest height is below the target, with the px/mm you get at the lowest height in brackets. The card half assumes the camera is turned to put its long side along the 80 cm side.

### At 3 px/mm (mixed-case handwriting)

| Camera | 90 × 60 | 120 × 80 | 160 × 100 | Card half 60 × 80 | Pi / browser |
|---|---|---|---|---|---|
| Pi Camera Module 3 | 88–118 | 118 only (3.0) | never (2.4) | 88–118 | Pi |
| Pi Camera Module 3 Wide | 50–62 | never (2.8) | never (2.2) | 50–62 | Pi |
| Pi AI Camera | 76–104 | 102–104 | never (2.3) | 68–104 | Pi |
| Pi HQ + 6 mm CS (3 MP lens) | 95–130* | 127–130* | never (2.3) | 85–130* | Pi |
| Pi HQ + 8 mm M12 | 109–148 | 145–148 | never (2.3) | 102–148 | Pi |
| Pi HQ + Arducam 6 mm M12 (50°) | 106–145 | 142–145 | never (2.3) | 94–145 | Pi |
| Pi HQ + Arducam 2.7 mm M12 (100°) | 42–57 | 55–57 | never (2.3) | 37–57 | Pi |
| Arducam 16 MP IMX519 (Pi) | 76–119 | **102–119** | never (2.6) | 72–119 | Pi |
| Arducam 16 MP IMX519 USB | 77–120 | **102–120** | never (2.6) | 68–120 | both |
| Arducam 64 MP OwlSight (Pi), full res | 73–229 | **98–229** | **130–229** | 65–229 | Pi |
| same, binned to 4624 × 3472 @ 10 fps | 73–114 | 98–114 | never (2.6) | 65–114 | Pi |
| Arducam 64 MP Hawkeye (Pi) | 68–210 | 91–210 | 121–210 | 64–210 | Pi (Arducam software) |
| Arducam 64 MP USB, full res | 69–214 | **92–214** | **122–214** | 61–214 | both |
| Brio 4K / MX Brio / Facecam 4K | 68–74 | never (2.4) | never (2.0) | 68–74 | both |
| OBSBOT Tiny 2 | 79–87 | never (2.5) | never (2.0) | 79–87 | both |

\* The 6 mm CS lens is rated for only 3 MP, so the real detail is well below the pixel figure. Don't count on it for handwriting.

### At 2 px/mm (digits only)

| Camera | 90 × 60 | 120 × 80 | 160 × 100 | Card half 60 × 80 |
|---|---|---|---|---|
| Pi Camera Module 3 | 88–177 | 118–177 | 147–177 | 88–177 |
| Pi Camera Module 3 Wide | 50–93 | 66–93 | 83–93 | 50–93 |
| Pi AI Camera | 76–156 | 102–156 | 136–156 | 68–156 |
| Pi HQ + 8 mm M12 | 109–223 | 145–223 | 193–223 | 102–223 |
| Pi HQ + Arducam 6 mm M12 | 106–217 | 142–217 | 189–217 | 94–217 |
| Pi HQ + Arducam 2.7 mm M12 | 42–85 | 55–85 | 74–85 | 37–85 |
| Arducam 16 MP IMX519 (Pi or USB) | 76–179 | 102–179 | 136–179 | 68–179 |
| Arducam 64 MP OwlSight, full res | 73–343 | 98–343 | 130–343 | 65–343 |
| Arducam 64 MP USB, full res | 69–321 | 92–321 | 122–321 | 61–321 |
| Brio 4K / MX Brio / Facecam 4K | 68–110 | 90–110 | never (2.0) | 68–110 |
| OBSBOT Tiny 2 | 79–130 | 106–130 | never (2.0) | 79–130 |

The Facecam 4K's fixed focus covers 30–120 cm, which includes all its useful heights.

### Reading the tables

- **For the preferred case, the whole 120 × 80 table at 3 px/mm, there are three real options:**
  1. 16 MP IMX519, about 1.0–1.2 m. The USB version also works in a browser.
  2. 64 MP OwlSight on a Pi, about 1.0–2.3 m.
  3. 64 MP USB, about 0.9–2.1 m, in a browser too.

  The 12 MP cameras work at only one height, with no room to share the rig with a projector.
- **The 64 MP cameras give the wide height range** that a shared projector rig wants. They also cover 160 × 100. The price is 1–2.6 fps at full resolution. Their binned 16 MP mode (10 fps on the OwlSight, 5 fps over USB) behaves like the IMX519, so they can track at the lower resolution and snap full-res stills for reading.
- **The card-half fallback** opens up the 12 MP cameras (Camera Module 3 at 0.9–1.2 m, HQ + 8 mm at 1.0–1.5 m). 4K webcams manage it only in a 6 cm band (68–74 cm). That's too low and too tight to be practical.
- **4K webcams can't reach 3 px/mm over any whole table bigger than 90 × 60.** Over 120 × 80 they suit digits only.

## Checking a substitute camera

If a model is out of stock, check these specs on the replacement's spec sheet:

1. **Real pixel count of the mode you'll use.** Compare it with the "pixels needed" table above: at least 3960 × 2640 for 120 × 80 at 3 px/mm. Watch for:
   - "MP" figures that only apply to stills, or are interpolated
   - "50 MP" sensors that output only 4K video (OBSBOT)
   - 4K modes that are crops of the sensor centre (IMX519's 3840 × 2160 on the Pi)
2. **Horizontal and vertical FOV.** These set the heights (formulas above). If only a diagonal is given, work it out: for a sensor with aspect `a : b`, `tan(H/2) = tan(D/2) · a / √(a²+b²)`, and the same for V with b. Avoid fisheyes and lenses with big distortion figures (more than a few %).
3. **Interface.**
   - CSI ribbon: Pi + Python only. Check that Raspberry Pi's libcamera supports the sensor, i.e. it appears in [its tuning-file list](https://github.com/raspberrypi/libcamera/tree/main/src/ipa/rpi/pisp/data).
   - USB UVC: browser and Pi. Prefer USB 3 for anything above 4K.
4. **Frame rate at that mode.** A few fps is fine for reading handwriting from still cards. Marker tracking can use a faster, smaller mode.
5. **Lens resolution and focus.**
   - The lens should be rated for the sensor's pixel size.
   - Focus must be lockable, or be a fixed focus whose range covers your height (like the Facecam's 30–120 cm).

## Open points

- **Real sharpness of the 64 MP and 16 MP lenses at the table edges.** Not on any spec sheet. Photograph a test sheet of handwriting at the planned height.
- **Browser delivery of > 4K.** Confirm in Chrome that `getSettings()` reports 4656 × 3496 (16 MP USB) or 9248 × 6944 (64 MP USB), and that focus and exposure can be locked.
- **Arducam figures** came via retailers and search snippets because Arducam's site blocks automated reading. Confirm FOV and frame rates on the product page before buying.
- **Camera beside the projector, tilted.** These figures assume the camera points straight down. A tilted camera loses px/mm on the far side, and the 64 MP cameras have the most room to absorb that.
