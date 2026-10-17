# Which marker families fit Snapscript's cards?

Research for #27 (part of the map #26). Date: 2026-10-17.

**Question.** Which marker families or styles could carry a card side's ID, position and rotation on Snapscript's cards? Shortlist 2–3 for the mock-card prototype (#30).

**Short answer.** Make mock cards in three styles:

1. **AprilTag `tagStandard41h12`**: the safe, off-the-shelf choice. 2115 IDs. It needs **no white quiet zone**, because the edge the detector looks for sits *inside* the marker. Libraries exist for Python and the browser.
2. **The card frame as the marker**: a dark printed frame around each card side, with ID bits drawn as dots in the frame. It looks the friendliest and gives the camera each card's exact outline, but we would write the detector ourselves (small, OpenCV-based).
3. **A Dynamicland-style dot strip**: a short row of coloured dots on each card. It is the most playful look, but it needs colour calibration, the largest dots, and a custom detector. Paper Programs is a working open-source reference.

Drop ArUco, CCTag, RUNE-Tag, STag and TopoTag for this project; the reasons are in the table below. With square markers, **4K or a 12 MP camera** keeps the marker to roughly 10–14 mm on a 25–35 mm card. At 1080p a `tagStandard41h12` marker needs about 20–27 mm, nearly the full card height.

---

## 1. A few words first

- **Module**: one square "pixel" of a printed marker, i.e. one black or white cell. A `tagStandard41h12` marker is 9 × 9 modules.
- **Quiet zone**: a blank (usually white) margin a marker needs around it so the detector can find its outline. ArUco needs one; this is what made the Figma mocks hard.
- **Detector**: the code that finds markers in a camera image and reads their IDs.
- **Hamming distance**: how many modules must flip before one ID is misread as another. Higher means fewer mix-ups. A family "41h12" has 41 data bits and a minimum distance of 12.
- **px/mm**: camera pixels per millimetre on the table. It decides how large anything printed must be.

## 2. What our setup makes easier

General-purpose markers must work at any angle and distance, in clutter, and give a 3D pose. Snapscript needs much less, and that lets us loosen several things:

- **Top-down, flat, fixed camera.** We only need 2D position and rotation on the table plane. One calibration of the table (a homography, i.e. a fixed mapping from image to table coordinates) replaces per-marker 3D pose estimation. Markers are seen almost face-on, so perspective distortion is small.
- **Known scale.** Every marker appears at almost the same size in pixels. The detector can ignore anything much bigger or smaller, which cuts false detections and lets us tune its speed settings (e.g. AprilTag's `quad_decimate`) once.
- **Known card shapes.** Cards are 1U tall and a whole number of U long. A detector can check that a found rectangle has a legal size, and the "card frame" style (option 2) is built on this.
- **Only our own IDs exist.** Any decoded ID that was never printed is an error by definition. So we can use weaker error correction than robotics users need.
- **No projected light on markers** (map #26), so marker contrast is just print on paper under room light.

## 3. Camera pixels on a 120 × 80 cm table

The table is 3:2 but common sensors are 16:9 or 4:3, so one axis limits the resolution. The numbers below assume the table exactly fills the frame. Real setups add some margin, and lens blur, Bayer filters and video compression lower the effective resolution, so treat them as upper bounds. The IRL experiment in #26 must confirm them.

| Camera | Pixels | px/mm across 1200 mm | px/mm across 800 mm | **Usable px/mm** |
| --- | --- | --- | --- | --- |
| 1080p webcam | 1920 × 1080 | 1.60 | 1.35 | **1.35** |
| 4K webcam | 3840 × 2160 | 3.20 | 2.70 | **2.70** |
| Pi Camera Module 3 (11.9 MP) | 4608 × 2592 | 3.84 | 3.24 | **3.24** |
| Pi HQ Camera (12.3 MP) | 4056 × 3040 | 3.38 | 3.80 | **3.38** |

The tables below use **3.24 px/mm for "12 MP"**.

**How many pixels per module?** No source states one hard minimum, so these are planning figures, not measurements:

- Two pixels per module is the theoretical floor: you cannot resolve a black/white alternation with fewer.
- The AprilTag 3 detector reads each module by sampling its centre with bilinear interpolation, then sharpens the result specifically to help "very small images of tags" [Krogius 2019, §III-D]. This points to about **3 px/module as a realistic minimum**.
- OpenCV's ArUco detector resamples each module to 4 × 4 px by default (`perspectiveRemovePixelPerCell = 4`). With default settings it also ignores markers whose perimeter is below 3 % of the image's longer side, i.e. under about 14 px a side at 1080p (`minMarkerPerimeterRate = 0.03`) [OpenCV aruco_detector.hpp]. We use **4 px/module as the comfortable figure**.
- Dots: Paper Programs ignores blobs under 25 px of area, i.e. dots under about 5.6 px across [paperprograms detectPrograms.js]. RUNE-Tag reached almost 100 % detection once its smallest dots were about 6 × 6 px [Bergamasco 2016, §3.6]. We use **6 px per dot for black dots, and about 8 px for coloured dots**. The colour figure is our margin, not a sourced one: webcams usually store colour at a lower resolution than brightness.

Module size on paper that this implies:

| | 1080p (1.35 px/mm) | 4K (2.70) | 12 MP (3.24) |
| --- | --- | --- | --- |
| 1 module at 3 px | 2.2 mm | 1.1 mm | 0.93 mm |
| 1 module at 4 px | 3.0 mm | 1.5 mm | 1.2 mm |
| black dot, 6 px | 4.4 mm | 2.2 mm | 1.9 mm |
| coloured dot, 8 px | 5.9 mm | 3.0 mm | 2.5 mm |

## 4. The candidates

### 4.1 ArUco (OpenCV dictionaries)

- **IDs.** OpenCV ships `DICT_4X4_50…1000`, `5X5_…`, `6X6_…` and `7X7_…`. The usable choices for 150–500 IDs are `DICT_4X4_250` (minimum Hamming distance only 3), `DICT_5X5_250` (distance 6) or `DICT_5X5_1000` (distance 5) [OpenCV aruco_dictionary.hpp].
- **Touching neighbours.** This is ArUco's weak point. The detector finds the marker's *outer* black square against what surrounds it. If a neighbouring card's dark print touches that black square, the two merge into one shape and the outline is no longer a square. OpenCV's own FAQ warns: "avoid narrow borders around the ArUco marker" [OpenCV aruco_faq]. So every ArUco marker needs about 1 module of white around it, on its own card. Example: `[call:p5.fill]` directly above `[repeat]`, with both markers at the left end. If either marker runs to the card edge, the two black borders touch and neither marker is read.
- **Size.** A 5×5 marker is 7 modules with its black border, plus 1 module of quiet zone each side, so 9 modules. That is 20–27 mm at 1080p, 10–13 mm at 4K and 8–11 mm at 12 MP. This is the same footprint as `tagStandard41h12`, which has more IDs and needs no quiet zone.
- **Software.** Python: `cv2.aruco` (OpenCV). Browser: OpenCV.js includes `aruco_Dictionary`, `aruco_DetectorParameters` and `ArucoDetector` [OpenCV opencv_js.config.py]. This is the best-supported option.
- **Looks.** A boxy QR-like square inside a forced white box.
- **Verdict.** Works, but strictly worse than `tagStandard41h12` for us.

### 4.2 AprilTag, classic families (`tag36h11` etc.)

- **IDs.** `tag36h11` has 587; `tag36h10` has 2320. The small families are far too few: `tag16h5` has 30 and `tag25h9` has 35 [apriltag/*.c].
- **Touching neighbours.** Same layout as ArUco: a black border with white around it. The family files count a 1-module white border into the marker's full width (10 modules for `tag36h11`) [apriltag tag36h11.c: `width_at_border = 8`, `total_width = 10`]. That white ring is the quiet zone, so a dark neighbour must not intrude on it.
- **Size.** 10 modules: 22–30 mm at 1080p, 11–15 mm at 4K, 9–12 mm at 12 MP.
- **Software.** Same as 4.3. OpenCV's `cv2.aruco` can also read the classic families (`DICT_APRILTAG_36h11` and others).
- **Verdict.** Superseded by 4.3.

### 4.3 AprilTag 3 `tagStandard41h12` and `tagStandard52h13` (shortlisted)

AprilTag 3 [Krogius 2019] lets the data modules go *outside* the detection border. The "standard" layout, which the paper calls *uramaki*, works like this:

- the outermost ring is data modules;
- inside that is a black ring;
- inside that is a white ring;
- in the centre are more data modules.

The detector looks for the edge between the black ring and the **white ring inside it**.

- **IDs.** `tagStandard41h12`: **2115 IDs**, Hamming distance 12, 9 × 9 modules. `tagStandard52h13`: 48 714 IDs, 10 × 10 modules [apriltag tagStandard41h12.c, tagStandard52h13.c; Krogius 2019 §IV-A]. The README says "for the vast majority of applications, the tagStandard41h12 family will be the correct choice" [apriltag README]. Folk Computer, an open Dynamicland-like system, uses `tagStandard52h13` for its pages [FolkComputer/folk apriltags.folk].
- **Touching neighbours: no quiet zone needed.** The detector splits the thresholded image into connected black and white regions. It then fits squares to the boundary between *one particular* black region and *one particular* white region [Wang & Olson 2016, §III-C]. In `tagStandard41h12`, the white region is the marker's own inner white ring, and its own black ring closes it in completely. A neighbouring card's print can merge with the black ring, but it cannot reach the white ring inside. So the square the detector needs is unchanged. (This is our reading of the algorithm, and the mock-card test should confirm it.) The paper also says layouts "may have either black or white on the outside" [Krogius 2019, §III-A], and the code handles these "reversed border" families explicitly [apriltag.c].
  - **Layout rule.** The marker can sit right at a card edge. We still suggest keeping ½–1 module of plain card between the outer data ring and the edge, so that blur from a dark neighbour cannot flip an outer data module. In the `[call:p5.fill]` above `[repeat]` example, both markers then read even if they are only a few millimetres apart.
  - **Caveat.** The paper notes that `41h12` lost some recall against `36h11` at high speed settings. The authors suggest this "may be an artifact" of their white test background giving `36h11` an effectively larger border [Krogius 2019, §IV-C]. Keep the speed setting low (`quad_decimate` 1–2) for small markers.
- **Size** (9 modules):

  | | 1080p | 4K | 12 MP |
  | --- | --- | --- | --- |
  | at 3 px/module | 20 mm | 10 mm | 8.3 mm |
  | at 4 px/module | 27 mm | 13 mm | 11 mm |

  At 1080p the marker would take nearly the whole height of a 25–35 mm card. At 4K or 12 MP it is a comfortable 10–14 mm square.
- **Software.**
  - Python: the official AprilRobotics C library, BSD-2 licence, ships a Python wrapper. `pupil-apriltags` on PyPI (last release April 2025) supports all families [apriltag README; pupil-labs/apriltags].
  - OpenCV's `cv2.aruco` does **not** read the AprilTag 3 families. Its AprilTag dictionaries are only 16h5, 25h9, 36h10, 36h11 and 36h12 [OpenCV aruco_dictionary.hpp].
  - Browser: `apriltag-js-standalone` compiles the official C library to WASM [conix-center/apriltag-js-standalone]. It is hard-wired to `tag36h11` today, so switching it to `tagStandard41h12` means rebuilding with that family: small work, not a new detector.
- **Looks.** Still a black-and-white pixel pattern, so it reads as "a QR code". It is a square that can sit flush in a corner or at the end of a card. The detector thresholds a grey image, so a dark brand colour on a light card should work as long as the brightness contrast is high (our inference; test it). Two related options:
  - `tagCircle49h12`: 65 535 IDs, 11 modules wide, with a roughly round outline whose corner cells are free for decoration [apriltag tagCircle49h12.c; Krogius 2019 Fig. 2e]. It costs 11 instead of 9 modules (24–33 mm at 1080p, 12–16 mm at 4K, 10–14 mm at 12 MP).
  - The AprilTag-Generation tool can make custom layouts, for example a smaller uramaki with fewer IDs [apriltag README]. We have not checked how many IDs a 7 × 7 layout would give.

### 4.4 The card outline as the frame (shortlisted, custom)

The idea: find each card side's rectangle first, then read a few ID bits at known places on it.

- **The catch, and the fix.** Plain white cards touching edge to edge look like one big white region to the camera, so the bare paper edge is not a usable frame. Instead, print a **dark frame band** around each side, inset slightly from the paper edge, with a light interior. The detector looks for each **light interior enclosed by a dark band**. This uses the same trick as `tagStandard41h12`, but at the scale of the whole card: touching neighbours merge their dark bands, yet each card's light interior stays a separate, closed rectangle.
- **IDs.** As many as we print. For example, a 2U card at U = 30 mm is 60 mm long. At 4K, a row of 3.5 mm bit cells along one long edge of the band gives about 16 positions: 10 ID bits (1024 IDs) plus 6 check bits. Putting the bits on one edge only also tells the detector which way round the card is: a rectangle alone is ambiguous under a 180° turn. This is our sketch, not a published scheme; we would design the bit layout and check bits ourselves.
- **Size.** The frame band and the bit cells each need about 4 px: 3 mm at 1080p, 1.5 mm at 4K, 1.25 mm at 12 MP. So the band is thin, and the rest of the card is free for the label and whiteboard.
- **Extra benefit.** It gives the exact card outline and length, which the projector needs anyway to light up cards for errors (OVERVIEW_SPEC § Feedback).
- **Risks.**
  - A hand or sleeve over any part of the frame hides the whole card. A square marker only needs its own small patch visible.
  - Handwriting that touches the band from inside dents the rectangle. A robust line fit tolerates small dents.
  - We must write and test the detector. With OpenCV it is roughly: threshold → find contours with holes (`cv2.findContours` with `RETR_CCOMP`) → fit rectangles → check the size against legal U lengths → sample bits. The same calls exist in OpenCV.js, so it ports to the browser.
- **Looks.** The best of all options: a coloured border is a normal card-design element, and the ID dots can be part of it.

### 4.5 Dot markers, Dynamicland style (shortlisted, custom)

- **Dynamicland's "dotframes".** Each corner of a page has "a wedge of five dots", and "the color pattern encodes the page number in a way that is robust to changing lighting conditions" [Dynamicland, Dotframes 2017]. In 2022 they moved from 0.25″-radius dots to 0.1″-radius dots (about 5 mm across) for "playing cards and game pieces", made possible by 4K cameras [Dynamicland, Tiny dotframes 2022; 4K cameras 2021]. Dynamicland publishes no ID counts, detector or table size.
- **Paper Programs**, an open-source, MIT-licensed system inspired by Dynamicland, which runs in the browser on OpenCV.js:
  - Each corner is an L-shaped chain of 7 dots in 4 colours. Strings that use all 4 colours give 8400 corner patterns, i.e. 2100 page IDs (each page has 4 distinct corners) [paperprograms dotCodes.js, detectPrograms.js]. (Its website still says "5 dots of 5 possible colours… about 600 unique papers", which is older than the code.)
  - The detector finds round blobs, links dots whose centres are closer than 0.9 × the sum of their sizes, looks for chains of 7, and reads the colours.
  - Colours are matched against calibrated reference colours and normalised to nearby white paper [detectPrograms.js].
- **IDs.** Easily 300–500+. Even 6 dots in 4 colours give 4096 raw patterns, before removing ones that read the same backwards and adding a check.
- **Touching neighbours.** Dots near the edges of two touching cards could link into one chain. With Paper Programs' linking rule, keep each dot at least about ½ a dot diameter from the card edge (our arithmetic from that rule). Example: `[call:p5.fill]` above `[repeat]`. Strips near their shared edge must not chain together, so run the strip *along* the card's length, inside the edge.
- **Size.** Coloured dots at about 8 px: 5.9 mm at 1080p, 3.0 mm at 4K, 2.5 mm at 12 MP. Four 7-dot corners do **not** fit on a 30 mm-tall card at 1080p or 4K; each arm would be about 30 mm or 16 mm long. So for Snapscript, use **one short strip of 6–8 dots per side** (about 25–30 mm long at 4K). The strip's line gives position and rotation, and an asymmetric colour pattern removes the 180° ambiguity. This is our adaptation and would need a custom detector; Paper Programs' code is a good template.
- **Software.** No maintained library. Custom work in Python or JS on OpenCV's `SimpleBlobDetector`.
- **Risks.** Colour depends on lighting and on the camera's white balance, so it needs a calibration step (Paper Programs has one). This is the largest marker at 1080p.
- **Looks.** Very friendly and playful; this is the style the user is curious about. Black-only dots avoid the colour risks but need more dots for the same number of IDs.

### 4.6 Ring and circle markers: CCTag, RUNE-Tag, STag, TopoTag (not shortlisted)

| Family | IDs | Why not |
| --- | --- | --- |
| **CCTag** (concentric rings) [Calvet 2016; alicevision/CCTag] | 32 printable markers in the repo's three-ring set | Far too few IDs. The README says to "respect the provided margins". C++; its README lists CUDA as a requirement. Made for accuracy under blur, not for many IDs. |
| **RUNE-Tag** (rings of dots) [Bergamasco 2016] | RUNE-43: 762; RUNE-129: 19 152 | Needs about 130 px across for reliable reading (about 96 mm at 1080p, 40 mm at 12 MP). C++ only. The dots look nice, but it is far too large for a 25–35 mm card. |
| **STag** (square border + circle) [Benligiray 2019; ManfredStoiber/stag] | HD11: 22 309, HD13: 2884, HD15: 766 | Detection uses the *outer* square border [Benligiray 2019], so touching neighbours cause the same problem as ArUco. Python package `stag-python` (2025), no browser version. Its strength, pose stability under jitter, is not what we need. |
| **TopoTag** [Yu 2021, TVCG] | "tens of thousands" | Code only from the authors' site, with no maintained Python or JS package found. We did not verify how it behaves when neighbours touch. |

reacTIVision's "amoeba" markers (topological, from table-top music interfaces) are a similar idea: blob-shaped, recognised by nesting rather than outline. They are worth knowing about but were not evaluated here.

## 5. Comparison

| Style | IDs (≥150 needed) | Quiet zone? | Marker size 1080p / 4K / 12 MP | Python | Browser | Custom work | Looks |
| --- | --- | --- | --- | --- | --- | --- | --- |
| ArUco 5×5 | 250–1000 | **yes** | 20–27 / 10–13 / 8–11 mm (incl. zone) | OpenCV | OpenCV.js | none | boxy, white box |
| AprilTag `tag36h11` | 587 | **yes** (built in) | 22–30 / 11–15 / 9–12 mm | yes | WASM | none | boxy |
| **AprilTag `tagStandard41h12`** | **2115** | **no** | **20–27 / 10–13 / 8–11 mm** | yes | WASM (rebuild for family) | little | boxy, can sit flush |
| AprilTag `tagCircle49h12` | 65 535 | no | 24–33 / 12–16 / 10–14 mm | yes | WASM (rebuild) | little | roundish |
| **Card frame + ID bits** | as designed (~1000) | no (band is the frame) | band 3 / 1.5 / 1.25 mm | OpenCV primitives | OpenCV.js primitives | **detector + bit design** | best |
| **Colour dot strip** | as designed (hundreds+) | ½-dot gap from edge | dots 5.9 / 3.0 / 2.5 mm; 7-dot strip ~60 / 30 / 25 mm | OpenCV primitives | OpenCV.js (Paper Programs) | **detector + calibration** | playful |
| CCTag / RUNE-Tag / STag / TopoTag | see 4.6 | — | — | partly | no | — | — |

## 6. Recommendation: three styles for mock cards (#30)

1. **AprilTag `tagStandard41h12`**, the baseline.
   - Put it as a square at one end of each side: about 13 mm (4K) or 11 mm (12 MP), or 27 mm if we must support 1080p.
   - Leave ½–1 module of plain card between it and the edges.
   - It is the only option that needs no detector work, has ample IDs (2115), runs in both Python and the browser, and by design does not need a quiet zone.
   - Trade-off: it looks like a QR code.
2. **Card frame + ID dots**, the design favourite.
   - A dark inset frame band of about 1.5–3 mm around each side, with a row of ID dots in one long edge.
   - Best looks, and it also gives the card outline and length for free.
   - Trade-offs: a custom detector and bit scheme, and the whole frame must be visible (hands covering cards).
3. **Colour dot strip**, the Dynamicland look.
   - 6–8 coloured dots of about 3 mm (4K) in a strip along the card, inside the edge. A 7-dot strip is about 30 mm long at 4K.
   - Most playful.
   - Trade-offs: colour calibration and lighting sensitivity, a custom detector, and the largest footprint at 1080p.

Also print the same mock cards **with ArUco 5×5** next to them, as a control for the "touching neighbours" test. It is the known-bad case and shows the improvement.

**Camera implication (feeds #29).** Every option is easier at 4K or 12 MP. At 1080p, the square markers fill most of a 25–35 mm card and the colour dots get large. If 1080p must stay possible, the card-frame style degrades most gracefully, because its features are thin bands and small bit cells rather than one large square.

**Mock-card test (for #30 and the IRL experiment).**
- Print each style at the 3 px and 4 px module sizes for the target camera.
- Lay `[call:p5.fill]` directly above `[repeat]`, and a full line such as `[call:p5.fill][get(c)]`, edge to edge.
- Check detection with a dark-printed neighbour on every edge, at the minimum and maximum camera heights.

## 7. Open points (not settled here)

- The actual pixels-per-module the chosen camera needs. These are planning figures until the IRL experiment.
- The final U size and marker placement, which depends on #25 (cards ≥ 2U) and the camera choice (#29).
- Whether vision runs in the browser or on a Pi (#31). All three shortlisted styles have a path in both. For the dot and frame styles that path is OpenCV primitives; for AprilTag it is a WASM build. Detection time on a Pi at 12 MP was not measured here.

## Sources

- [Krogius 2019] M. Krogius, A. Haggenmiller, E. Olson, "Flexible Layouts for Fiducial Tags", IROS 2019. https://april.eecs.umich.edu/media/pdfs/krogius2019iros.pdf
- [Wang & Olson 2016] J. Wang, E. Olson, "AprilTag 2: Efficient and robust fiducial detection", IROS 2016. https://april.eecs.umich.edu/media/pdfs/wang2016iros.pdf
- [apriltag README] AprilRobotics/apriltag README and LICENSE (BSD-2). https://github.com/AprilRobotics/apriltag
- [apriltag/*.c] Family definitions (`ncodes`, `width_at_border`, `total_width`, `reversed_border`): `tagStandard41h12.c`, `tagStandard52h13.c`, `tagCircle21h7.c`, `tagCircle49h12.c`, `tagCustom48h12.c`, `tag36h11.c`, `tag25h9.c`, `tag16h5.c`, and `apriltag.c` (reversed-border handling). https://github.com/AprilRobotics/apriltag
- [pupil-labs/apriltags] Python bindings, `pip install pupil-apriltags`. https://github.com/pupil-labs/apriltags
- [conix-center/apriltag-js-standalone] AprilTag compiled to WASM (BSD-3). https://github.com/conix-center/apriltag-js-standalone
- [OpenCV aruco_dictionary.hpp] Predefined dictionaries and their Hamming distances. https://github.com/opencv/opencv/blob/4.x/modules/objdetect/include/opencv2/objdetect/aruco_dictionary.hpp
- [OpenCV aruco_detector.hpp] Detector parameter defaults. https://github.com/opencv/opencv/blob/4.x/modules/objdetect/include/opencv2/objdetect/aruco_detector.hpp
- [OpenCV aruco tutorial / FAQ] https://github.com/opencv/opencv/blob/4.x/doc/tutorials/objdetect/aruco_detection/aruco_detection.markdown and https://github.com/opencv/opencv/blob/4.x/doc/tutorials/objdetect/aruco_faq/aruco_faq.markdown
- [OpenCV opencv_js.config.py] Which ArUco classes OpenCV.js exports. https://github.com/opencv/opencv/blob/4.x/platforms/js/opencv_js.config.py
- [Dynamicland, Dotframes 2017] https://dynamicland.org/archive/2017/Dotframes
- [Dynamicland, Tiny dotframes 2022] https://dynamicland.org/archive/2022/Tiny_dotframes
- [Dynamicland, 4K cameras 2021] https://dynamicland.org/archive/2021/4K_cameras
- [paperprograms] J. P. Posma, Paper Programs (MIT): `client/dotCodes.js`, `client/camera/detectPrograms.js`, and https://paperprograms.org. https://github.com/janpaul123/paperprograms
- [FolkComputer/folk apriltags.folk] Folk uses `tagStandard52h13`. https://github.com/FolkComputer/folk
- [Bergamasco 2016] F. Bergamasco, A. Albarelli, L. Cosmo, E. Rodolà, A. Torsello, "An Accurate and Robust Artificial Marker Based on Cyclic Codes", IEEE TPAMI 2016. https://cvg.cit.tum.de/_media/spezial/bib/bergamasco-pami16.pdf ; code: https://www.dsi.unive.it/~bergamasco/runetag
- [Calvet 2016] L. Calvet et al., "Detection and Accurate Localization of Circular Fiducials under Highly Challenging Conditions", CVPR 2016; code (MPL-2.0): https://github.com/alicevision/CCTag
- [Benligiray 2019] B. Benligiray, C. Topal, C. Akinlar, "STag: A Stable Fiducial Marker System", Image and Vision Computing 2019. https://arxiv.org/abs/1707.06292 ; code (MIT): https://github.com/ManfredStoiber/stag
- [Yu 2021] G. Yu, Y. Hu, J. Dai, "TopoTag: A Robust and Scalable Topological Fiducial Marker System", IEEE TVCG. https://arxiv.org/abs/1908.01450
- [Raspberry Pi camera docs] Camera Module 3 (IMX708, 11.9 MP) and HQ Camera (IMX477, 12.3 MP). https://www.raspberrypi.com/documentation/accessories/camera.html
