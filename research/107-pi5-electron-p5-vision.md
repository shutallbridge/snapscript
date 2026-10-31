# Can one Pi 5 run Electron, p5 and the vision service together?

Research for [#107](https://github.com/shutallbridge/snapscript/issues/107), part of the 0.1.0 map ([#100](https://github.com/shutallbridge/snapscript/issues/100)). Read on 2026-10-31.

## The answer in short

**One Pi 5 is plausible, but only if the vision service isn't allowed to use all four CPU cores all the time.**

- **The tight spot is the CPU, not the GPU or the memory.** On the rig, one marker search on a 16 MP frame takes 0.50–0.65 s with 4 threads ([#46](https://github.com/shutallbridge/snapscript/issues/46)). Run back to back, that keeps all four cores busy. The table app needs about one core to itself to draw the p5 sketch at 60 frames per second, plus a little more for Electron's GPU and browser processes. Both can't have the whole CPU at once.
- **The way to make it fit** is to give each side its own cores (for example two for the vision service and two for the table app), search only when the picture changes, and cool the Pi actively. With two threads a search probably takes around 1 s. That still meets the "at least 1 update per second" rule from #46, but it has to be measured.
- **The GPU side looks fine on paper.** The Pi 5's GPU has a conformant OpenGL ES 3.1 driver, and Chromium (which Electron is built on) doesn't block it. The known failures are setup problems that fall back to software drawing. They are easy to detect at startup.
- **Memory is no issue.** A 16 MP greyscale frame is 16 MB, and the Pi 5 doesn't reserve special camera memory.
- **The fallback, vision on a second Pi, is cheap on the network and simple in code.** The vision service sends only a small table state when something changes. The cost is a second board to power, cool, mount, update and keep running, and calibration has to work across two machines.

The real numbers come from the walking skeleton. The last section lists what to measure.

## What we already know from the rig (#46)

These are measured, not from sources:

- Pi 5 (16 GB) with the Arducam 64 MP OwlSight (`ov64a40`), 112 cm above the table.
- Sensor modes: 4624×3472 at 7.66 fps is the 16 MP mode used for markers. Others: 2312×1736 at 26.75 fps, 1920×1080 at 45.65 fps (cropped).
- Marker search: `pupil-apriltags`, `tagStandard41h12`, 4 threads, no decimation. **0.50 s** with about 250 markers, **0.53 s** with 66, **0.65 s** with 96 (each on one 16 MP frame, search only). That's about 2 updates per second.
- Markers are 13 mm across. At the far edge the table gets about 2.65–2.8 px per mm, so a marker is about 35 px wide. 11 mm passed at about 2.7 px per cell with low margin.
- Exposure is locked at 8.33 ms, gain 1. HDMI out is 1080p60.
- Handwriting is read in the cloud. The Pi only cuts out crops and sends them as JPEG, which is light work.

## What the Pi 5 has to work with

From Raspberry Pi's own pages:

- **CPU:** "Broadcom BCM2712 2.4GHz quad-core 64-bit Arm Cortex-A76 CPU, with cryptography extensions, 512KB per-core L2 caches and a 2MB shared L3 cache" ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/)). Raspberry Pi says it has "between two and three times the CPU and GPU performance" of a Pi 4 ([launch post](https://www.raspberrypi.com/news/introducing-raspberry-pi-5/)).
- **GPU:** "VideoCore VII GPU, supporting OpenGL ES 3.1, Vulkan 1.3" ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/); the launch post said Vulkan 1.2). Khronos lists the Pi 5 as a conformant OpenGL ES 3.1 product (entries 1030 and 1031, Oct–Nov 2023, [Khronos OpenGL ES adopters](https://www.khronos.org/conformance/adopters/conformant-products/opengles)). The driver is Mesa's V3D: "a conformant GLES3.1 driver called V3D and a Vulkan graphics driver called V3DV, notably used on the Raspberry Pi 4 and Raspberry Pi 5" ([Mesa docs](https://docs.mesa3d.org/drivers/v3d.html)).
- **Display:** "Dual 4Kp60 HDMI® display output" ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/)). One 1080p60 output is well inside that.
- **Memory:** "LPDDR4X-4267 SDRAM" ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/)) on a "32-bit LPDDR4X SDRAM subsystem, running at 4267MT/s" ([launch post](https://www.raspberrypi.com/news/introducing-raspberry-pi-5/)). That's about 17 GB/s at peak (my arithmetic). The camera stream (a 16 MP YUV420 frame is about 24 MB, at 7.66 fps about 185 MB/s) and the display scan-out (1920×1080×4 bytes×60 ≈ 0.5 GB/s) take a small share.
- **Network:** "Gigabit Ethernet" ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/)).

### Heat

Sustained marker search on all four cores is exactly the load that makes a Pi 5 throttle.

- "all Raspberry Pi boards begin to throttle the processor when the temperature reaches 80°C, and throttle even further when it reaches the max temp of 85°C" ([Heating and cooling Raspberry Pi 5](https://www.raspberrypi.com/news/heating-and-cooling-raspberry-pi-5/)).
- Their test was `stress --cpu 4`. With no cooling, the temperature "climbs to and then remains stable just above the 85°C thermal limit", which means sustained throttling. With the Active Cooler it stabilised "at 60°C, with a maximum temperatures of 62 to 63°C" (same article).
- "passive cooling is probably going to be insufficient thermal management for heavy loads that extend beyond 200 or 300 seconds of duration, with active cooling necessary to prevent thermal throttling from occurring" (same article).
- A Raspberry Pi staff comment on that article says throttling drops the CPU "from 2.4GHz to 1.5GHz". That's a comment, not the article itself. If it happens, the marker search slows by about a third.

**So the Pi needs active cooling** (a fan on a heatsink). With it, there is a lot of room below the throttle point.

## The table app: Electron and p5 on the Pi 5's GPU

### What Electron is on this Pi

- Electron ships its own copy of Chromium, not the one Raspberry Pi OS installs. "Linux: Electron provides `x64` (`amd64`) and `arm64` binaries for Linux. … The prebuilt binaries are built on Ubuntu." ([Electron README, v45.2.1](https://github.com/electron/electron/blob/v45.2.1/README.md)). So a Pi 5 is a supported target, though Raspberry Pi OS isn't named.
- Raspberry Pi OS's own Chromium is a patched build. Its version carries an `rpt` suffix, for example `138.0.7204.92-1~deb12u1+rpt1` ([forum thread, July 2025](https://forums.raspberrypi.com/viewtopic.php?t=390106)). A maintainer of balena's kiosk browser describes it as "patched chromium for Pi video drivers" ([balena browser #172](https://github.com/balena-io-experimental/browser/issues/172)). Electron doesn't get those patches. The patches matter mostly for video decoding, which the table app doesn't need.
- Chromium decides per machine whether to use the GPU, from a list of known-bad drivers. **Chromium's list has no entry for the Pi's GPU** (no `V3D`, `VideoCore`, `Broadcom` or `vc4`). The Linux entries cover old Intel, AMD, NVIDIA and virtual-machine drivers, plus entry 3, which turns acceleration off when the driver is a software renderer (`llvmpipe`, `softpipe`) ([`software_rendering_list.json`](https://chromium.googlesource.com/chromium/src/+/main/gpu/config/software_rendering_list.json), and the same holds for [`gpu_driver_bug_list.json`](https://chromium.googlesource.com/chromium/src/+/main/gpu/config/gpu_driver_bug_list.json), both read from `main` on 2026-10-31). So if Mesa's V3D driver loads, Electron's Chromium uses it.
- **Wayland:** Raspberry Pi OS moved every model to Wayland with the labwc compositor in October 2024 ([Raspberry Pi news](https://raspberrypi.com/news/a-new-release-of-raspberry-pi-os)). Since Electron 38, "Electron now runs as a native Wayland app by default when launched in a Wayland session on Linux" ([Electron 38 release notes](https://www.electronjs.org/blog/electron-38-0)). `--ozone-platform=x11` forces the old way (same page).
- **Checking at startup:** Electron can report whether the GPU is in use: `app.getGPUFeatureStatus()`, available after the `gpu-info-update` event ([Electron `app` docs](https://www.electronjs.org/docs/latest/api/app)), and `app.isHardwareAccelerationEnabled()` from Electron 39 ([Electron 39 release notes](https://www.electronjs.org/blog/electron-39-0)).

### Published numbers on a Pi 5

No source gives Electron or p5 numbers on a Pi 5. The closest are Chromium-based kiosks running the WebGL Aquarium test. They show two states, working and not:

| Report | Setup | Result |
|---|---|---|
| [balena browser #172](https://github.com/balena-io-experimental/browser/issues/172), Sep 2024 (maintainer) | Pi 5, Chromium in balena's kiosk, after fixing a missing `vc4-kms-v3d` overlay | "many virtual fish swimming around the screen at 60FPS" |
| same issue, Aug 2025 (user) | Pi 5, another build | about 50 fps; tearing; with `--use-gl=egl` it "drops to 6fps" |
| same issue, Jun 2024 and Sep 2024 | Pi 5, builds with an older Mesa: "V3D 7.1 not supported by this version of Mesa" | 7–9 fps, even with a blank scene |
| [forum t=390106](https://forums.raspberrypi.com/viewtopic.php?t=390106), Jul 2025 | Pi 5 8 GB, Raspberry Pi OS Bookworm, Chromium | 10 fps while `chrome://gpu` showed "Canvas: Software only" and "WebGL: Software only"; Firefox 60 fps on the same test. Reset profile and turning Vulkan off gave "webGL back and the FPS is better" |

What this says:

- **When the GPU is in use, a Pi 5 draws a full-screen WebGL scene at about 50–60 fps.**
- **Every slow report is the software fallback**: a Mesa too old for the Pi 5's GPU (V3D 7.1), a missing display overlay, or a bad browser setting. These are setup faults, and the startup check above catches them.
- **Leave Chromium's Vulkan path off.** In the forum report, turning it on broke WebGL.

### Where p5 spends its time

Drawing on the GPU isn't the whole cost. p5 runs in JavaScript on the page's main thread, and every shape it draws costs CPU time there. One p5 user measured this (on a Mac, not a Pi, so the numbers only show the shape of the cost): the same animation in p5 used 21% of one core in the page's process, against 3.6% when rewritten with the plain canvas API, while the GPU process stayed about 2.5–3.2% ([MMM-GameOfLife #20](https://github.com/raywo/MMM-GameOfLife/issues/20), Oct 2026).

So for the table app, **the p5 sketch is limited by one CPU core, not the GPU.** How heavy the sketch is depends on what people program. The table app also draws its own error lights, read-back text and virtual cards. All of that runs on the same one core unless the projection's own drawing is kept separate from the sketch. The map already runs the program apart from the projection code.

## The vision service

### The marker search can't move to OpenCV's ArUco module

- OpenCV's built-in dictionaries include AprilTag families `16h5`, `25h9`, `36h10` and `36h11`, and no others ([`aruco_dictionary.hpp`](https://github.com/opencv/opencv/blob/4.x/modules/objdetect/include/opencv2/objdetect/aruco_dictionary.hpp)). **`tagStandard41h12`, the family Snapscript prints, isn't among them.** Its data bits run outside the black border, which is a layout ArUco-style search doesn't handle. So the vision service stays on the AprilTag library (`pupil-apriltags` wraps it: "Python bindings for the Apriltags3 library", [pupil-labs/apriltags](https://github.com/pupil-labs/apriltags)).
- OpenCV is still useful around the search: for crops, perspective, and turning the camera image into greyscale.

### How the search time scales

- **With image size: about in proportion to the number of pixels.** The AprilTag 2 paper measures time per pixel: "about 0.254 microseconds per pixel" on one desktop core. "Computation time varies by processing speed and the number of quads in an input image" ([Wang & Olson 2016, §IV-C](https://april.eecs.umich.edu/papers/details.php?name=wang2016iros)). The rig's 0.50 s for 16 MP works out to about 0.03 µs per pixel with 4 threads.
- **With decimation:** "With decimation by a factor of 2, the new detector only takes 0.072 microseconds per pixel", about 3.5 times faster (same paper). The library's notes say this costs small tags: decimation makes it faster "at the cost of detection distance", and if a tag's border isn't found, "decrease quad_decimate (all the way to 1 if necessary)" ([AprilTag README](https://github.com/AprilRobotics/apriltag)). Only the search for squares is decimated: "Decoding the binary payload is still done at full resolution" ([`apriltag.h`](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.h)). Snapscript's 13 mm markers are only about 3.8 px per cell at the far edge, so **decimation by 2 likely loses them**. It's worth one test on the rig, but don't plan on it.
- **With threads:** "If you have extra cpu cores to throw at the problem then you can increase nthreads" ([AprilTag README](https://github.com/AprilRobotics/apriltag)). In the source, thresholding, the connected-region step, clustering, square fitting and decoding all split work across the thread pool (`workerpool_add_task` calls in [`apriltag_quad_thresh.c`](https://github.com/AprilRobotics/apriltag/blob/master/apriltag_quad_thresh.c) and [`apriltag.c`](https://github.com/AprilRobotics/apriltag/blob/master/apriltag.c)). Some steps between them run on one thread. So going from 4 threads to 2 should take somewhat less than twice as long. **No published source measures this on a Pi 5**, so the rig has to.
- **With the number of markers:** small in the rig's runs (0.50 s with about 250 markers, 0.65 s with 96, at different moments).

### The camera side (picamera2)

From the [Picamera2 manual](https://pip-assets.raspberrypi.com/categories/786-raspberry-pi-camera-module-3/documents/RP-008156-DS-2-picamera2-manual.pdf) (release 7, built 27/10/2026):

- **Two outputs per frame, made by the image processor (ISP), not the CPU.** "The ISP can produce up to two output images for every input frame from the camera." The second, "lores" image "must be no larger than the main image. On a Raspberry Pi 4 or earlier device, the lores image must be in a YUV format, whereas on a Raspberry Pi 5 (or later device) it can be RGB or YUV" (§4.2). So the vision service can get a full 16 MP frame for markers and a small copy for spotting change, at no CPU cost.
- **Greyscale for free:** YUV420 is "a plane of Y values followed by a quarter plane of U values and then a quarter plane of V values" (§4.2.2, "Image Formats"). The Y plane is the greyscale image the marker search wants, so taking the top rows of the array needs no conversion. The manual's own face-detection example does this on the lores stream (§9.4).
- **No special camera memory on the Pi 5:** "Raspberry Pi 5 or later devices don't use CMA memory for the camera system" (§2.2.2, also §8.3). At 16 MP, one YUV420 frame is about 24 MB, so even six buffers are small next to 16 GB.
- **Buffers:** preview configurations get four buffer sets, still configurations one, and video six (§4.2.1, §8.4). With one buffer, "we are certain to drop at least every other camera frame" (§8.4). The vision service should use a preview or video configuration, not a still one.
- **Frame rate** is set with `FrameDurationLimits` or `FrameRate` (§4.2.3–4.2.4). It can't go above the sensor mode's own limit (7.66 fps for 16 MP, from #46).
- **Processing out of the camera loop:** heavy work done inside the camera's callback blocks the camera. The manual recommends holding a request and processing it elsewhere, then allowing "one or more extra sets of buffers via the camera configuration's buffer_count parameter" (§6.4.2).

## Putting it together: does it fit on one Pi?

A rough share-out of the four cores during play, when hands are moving over the table:

| Work | Cores | Where the number comes from |
|---|---|---|
| p5 sketch, the table app's own drawing, and the program runner | about 1, and it must never wait | p5 runs on the page's main thread |
| Electron's GPU and browser processes, labwc | a fraction of 1 | small share in the p5 measurement above |
| Marker search, run back to back | all 4 if allowed | #46: 0.50–0.65 s on 4 threads |
| Change spotting on the lores stream, crops, JPEG, cloud requests | small | ISP does scaling; crops are small |

**If the search is allowed to use all four cores all the time, the sketch will drop frames.** That's the tight spot. Three things make it fit:

1. **Split the cores.** Pin the vision service to two cores and the table app to the other two (Linux CPU affinity: `taskset`, or `systemd`'s `CPUAffinity=`), and give the search 2 threads. The search slows to perhaps 1 s, which still meets #46's "at least 1 update per second". The sketch keeps a core of its own.
2. **Search only when the picture changes.** The map already says the table state is sent only when something changes. Compare each small lores frame with the last one. When the table is still, run no full search, or a slow check every few seconds. Most of a session isn't hands moving.
3. **Cool it actively.** Otherwise heavy use throttles the CPU after a few minutes.

Handwriting doesn't change the picture. The cloud call takes 1.5–2 s per card (#46), but it's waiting, not computing.

## The fallback: vision on a second Pi

**What it would look like:** the camera plugs into the second Pi, which runs the whole vision service. The first Pi runs only the table app and drives the projector. Don't send camera frames over the network to the table app (the backup in #46): a 16 MB greyscale frame twice a second is about 260 Mbit/s, and it puts the search back on the busy Pi.

**What it costs:**

- **Network: almost nothing.** A table state is a list of tracks (marker, position, turn, handwriting state). That's kilobytes, sent only on change. On a direct Gigabit Ethernet cable the delay is well under a millisecond, small next to the 0.5–1 s search. The vision service is already a separate process, so in code the change is an address, not a design.
- **Calibration has to cross machines.** Today `calibrate.py` (#46) shows dots on the projector and finds them in the camera in one program. With two Pis, the table app shows the dots and the vision service sees them, so they coordinate over the API. Calibration is still undecided on the map ("Not yet specified"), so it's best designed for this from the start either way.
- **One more machine to run:** power, a fan, storage, mounting near the camera, a network cable, updates, start order, and a second thing that can fail. Clocks only need syncing if the two sides compare timestamps. A table state that just says "this is the table now" doesn't need it.
- **The handwriting cloud key** would live on the vision Pi.

**Spec checklist for a second board**, if it comes to that (models only as examples):

- [ ] 4 Cortex-A76-class cores or better (the search time in #46 is for this CPU). A Pi 5 is the example.
- [ ] A 4-lane MIPI CSI camera connector that the camera's driver supports (the OwlSight runs as `ov64a40` on a Pi 5).
- [ ] 2 GB or more of memory: a few 24 MB frame buffers plus Python and OpenCV.
- [ ] Gigabit Ethernet.
- [ ] Active cooling for sustained four-core load.
- [ ] Same OS and camera stack as the first Pi, so picamera2 and the tuning carry over.

With vision gone, the table-app Pi needs less memory too: Electron and the sketch fit easily in a few GB.

## What the walking skeleton should measure

The real answer comes from running both together on the rig:

1. **GPU in use:** log `app.getGPUFeatureStatus()` at startup. Fail loudly if canvas or WebGL says software.
2. **Sketch frame times while the vision service searches back to back:** a heavy test sketch, at 4, 3 and 2 search threads, with and without core pinning. Pass: the sketch holds 60 fps (or a frame time the table can live with).
3. **Search time at 2, 3 and 4 threads** while the table app is running. Pass: at least 1 update per second.
4. **Heat over 30 minutes** of both at full load: `vcgencmd measure_temp` and `vcgencmd get_throttled` should show no throttling.
5. **Time from a card being put down to it lighting up**, without handwriting and with it.
6. Optionally, one run with `quad_decimate` 1.5 or 2 at the far edge, to see whether 13 mm markers survive.

## Sources that didn't help

- OpenCV's documentation pages (docs.opencv.org) refused the fetch (HTTP 403). OpenCV facts here come from its source on GitHub instead.
- No Raspberry Pi forum thread or official post gives Electron or p5 numbers on a Pi 5.
- No published source times AprilTag thread scaling on a Pi 5.
