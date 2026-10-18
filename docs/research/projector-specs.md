# Projector specs: what to require, and what heights they give

Research for "What specs must the projector meet, and what heights do they give?" (#41), part of the map "Wayfinder: markers, camera and vision system" (#26).

**Question.** What specs must a projector meet to hang above a Snapscript table pointing straight down, and what mounting heights does each set of specs give?

**This is a shopping checklist, not a product pick.** Stock, delivery and region decide the model. Models named below are only examples that show what a spec sheet looks like. They are not recommendations, and some may be discontinued.

**Short answer.**

1. **It must be allowed to point straight down.** Look for "360° installation", "360° free" or "portrait mode". In practice that means a **laser** (or LED) projector. Lamp projectors usually forbid it.
2. **Throw ratio sets the height.** Height (lens to table) = throw ratio × image width. Over a 120 × 80 cm table, a 16:9 image is 142 cm wide, so the height is 1.42 × the throw ratio. For the projector to hang at about the camera's height (about 0.9–1.8 m, from the camera research), you want a **zoom lens that covers roughly 0.8–1.2**. In shop terms that is a "short-throw zoom", or the short end of a standard lens. Fixed 0.5 short-throw lenses hang too low (about 70 cm). Standard 1.35–2.2 lenses hang too high for most ceilings (about 1.9–3.1 m).
3. **"4000 lumens" is a sound minimum, but only as ANSI or ISO 21118 lumens**, and only if the table isn't in direct window light. At 120 × 80 cm, 4000 ANSI lumens puts about 3500 lux on the table. Under normal office light (500 lux), that is 8:1 contrast, which passes the AV industry's 7:1 floor for "just looking". By a bright window (about 1000 lux), it falls to 4.5:1, which is too washed out. 6000 ANSI lumens is the comfortable target for a daylit room. "4000 LED lumens" or "light-source lumens" is much dimmer than 4000 ANSI lumens, so it fails.
4. **Native 1920 × 1080 or 1920 × 1200 is enough.** It gives about 1.35–1.5 projector pixels per mm on the table, or about 40–45 pixels across the height of a 30 mm card.
5. **Prefer 3LCD (or 3-chip) over single-chip DLP.** A DLP projector shows red, green and blue one after another, so a camera can catch coloured flicker and bands. 3LCD shows all colours at once.

The checklist table is at the end, in [Checklist](#checklist).

---

## Words used here

- **Throw ratio**: distance from the lens to the image ÷ width of the image. A throw ratio of 1.0 means a 1 m wide image from 1 m away. Lower means it can hang lower for the same image. Spec sheets list it as "throw ratio", "throw ratio range" or "projection ratio", sometimes as "1.35–2.20:1".
- **Zoom**: an optical zoom lets the throw ratio slide within a range (e.g. 1.35–2.20, called "1.6× zoom"). Spec sheets say "optical zoom", "zoom ratio" or give a throw ratio range. A single number means a fixed lens.
- **Aspect ratio**: the image's shape, width : height. 16:9 (1920 × 1080, "1080p"/"Full HD"), 16:10 (1920 × 1200, "WUXGA") or 4:3.
- **Offset**: where the image sits relative to the lens's centre line. Spec sheets give it as a percentage ("offset 115%").
- **Lens shift**: a knob or motor that slides the image without moving the projector ("vertical lens shift ±50%").
- **ANSI lumens / ISO 21118 lumens**: standard measures of how much light actually reaches the image (explained under [Brightness](#4-brightness)).
- **Lux**: light falling on a surface, lumens per square metre. Office lighting and daylight are given in lux, so lux lets us compare the projector with the room.
- **3LCD / DLP**: the two main ways a projector makes an image. 3LCD uses three small LCD panels, one each for red, green and blue, shown at the same time. Single-chip DLP uses one mirror chip and a spinning colour wheel (or flashing LEDs or lasers), showing colours one after another.

---

## 1. Throw ratio and zoom → height range

### The formula

Pointing straight down, the projector makes a rectangle on the table. Its shape is fixed by the projector (16:9, 16:10…), so to cover the whole table it must be big enough in **both** directions:

```
image width  W = max( table width,  table depth × aspect )      aspect = 16/9, 16/10 or 4/3
height       h = throw ratio × W                                 lens to table
```

With a zoom lens, the throw ratio is a range [TR_min, TR_max], so the heights where the image exactly fits the table are:

```
h_min = TR_min × W        (zoomed fully wide: the lowest the projector can hang and still cover the table)
h_max = TR_max × W        (zoomed fully tele: any higher and the smallest image is bigger than the table)
```

Hanging above h_max still works, but the image spills past the table. Pixels and light are wasted, and px/mm and lux on the table both drop. Below h_min the image can't reach the table's edges.

The throw ratio definition comes from manufacturers, e.g. [BenQ: "throw ratio … D/W"](https://www.benq.com/en-us/knowledge-center/knowledge/what-is-throw-ratio-for-projectors). Note that makers measure the distance from slightly different points (lens front, or a reference mark on the case). For final placement, use the projection-distance table in the model's manual.

**Worked example, 120 × 80 cm, 16:9.** Depth needs 80 × 16/9 = 142.2 cm of image width, which is more than the 120 cm table width, so **W = 142.2 cm** and h = 1.42 × throw ratio. The image is 142 × 80 cm: it covers the depth exactly and overhangs the width by 11 cm each side. A 16:10 image needs only 128 cm (h = 1.28 × throw ratio) and wastes less, because 16:10 is closer to the table's 3:2 shape.

### Image size for each table

| Table | 16:9 image (W × depth) | 16:10 image | 4:3 image |
|---|---|---|---|
| 90 × 60 cm | 107 × 60 cm (0.64 m²) | 96 × 60 cm (0.58 m²) | 90 × 68 cm (0.61 m²) |
| 120 × 80 cm | 142 × 80 cm (1.14 m²) | 128 × 80 cm (1.02 m²) | 120 × 90 cm (1.08 m²) |
| 160 × 100 cm | 178 × 100 cm (1.78 m²) | 160 × 100 cm (1.60 m²) | 160 × 120 cm (1.92 m²) |

### Throw-ratio bands and the heights they give

Industry bands, from [AVIXA (the AV industry association)](https://www.avixa.org/explore/articles/short-throw-ratio): **ultra-short throw < 0.4**, **short throw 0.4–1.0**, **standard throw ≈ 1.5 and up**. The 1.0–1.5 gap is filled in practice by "short-throw zoom" lenses and the short end of standard zooms. Example: the Epson EB-L690SU, sold as "short throw", lists 0.79–1.36 ([Epson](https://www.epson.co.in/Projectors/Corporate-and-Education/-EB-L690SU-Short-Throw-WUXGA-3LCD-Laser-Projector/p/V11HB31056)).

Heights (lens to table top) for an exact fit:

| Band (typical throw ratio) | 90 × 60, 16:9 | **120 × 80, 16:9** | **120 × 80, 16:10** | 160 × 100, 16:9 |
|---|---|---|---|---|
| Ultra-short (0.25–0.4) | 27–43 cm | **36–57 cm** | 32–51 cm | 44–71 cm |
| Short, fixed (0.5) | 53 cm | **71 cm** | 64 cm | 89 cm |
| Short zoom (0.8–1.36) | 85–145 cm | **114–193 cm** | 102–174 cm | 142–242 cm |
| Standard zoom (1.35–2.2) | 144–235 cm | **192–313 cm** | 173–282 cm | 240–391 cm |

The camera research ("Which cameras fit the budget, and at what height?") found these camera heights at 120 × 80 cm: Pi Camera Module 3 at **118–177 cm**, Brio 4K at **90–110 cm**. Comparing:

- **Ultra-short throw doesn't fit.** It hangs 40–60 cm above the table, inside the space where people reach, and far below either camera. UST projectors are built to sit at a wall's foot with an extreme offset, not to hang over a table.
- **Fixed 0.5 short throw is too low** (64–71 cm at 120 × 80). The camera would have to hang well above it, with the projector body in or near its view.
- **Short-throw zoom (about 0.8–1.36) is the sweet spot.** At 120 × 80 cm it spans about 1.0–1.9 m, which covers the Camera Module 3's whole range and reaches the top of the Brio's.
- **Standard throw (1.35+) is usually too high.** At 120 × 80 cm it needs at least 1.7–1.9 m above the table top. That is 2.5–2.7 m from the floor for a 75 cm table, more than many rooms have. It only fits a small table or a high ceiling.

**Throw ratio to ask for.** Pick the rig height h first, then the throw ratio you need is h ÷ W. For 120 × 80 cm, 16:9:

| Camera's height range | Throw ratio needed |
|---|---|
| Camera Module 3, 118–177 cm | 0.83–1.24 (16:9) / 0.92–1.38 (16:10) |
| Brio 4K, 90–110 cm | 0.63–0.77 (16:9) / 0.70–0.86 (16:10) |

So the **requirement is a zoom range that contains about 0.85–1.2**, the throw ratios for heights of about 1.2–1.7 m over 120 × 80 cm. A wider zoom (≥ 1.5×) is the nice-to-have, because it lets the same projector serve other table sizes and heights. The Brio's height needs about 0.65–0.85, which only a few short-throw zooms reach. If the Brio wins, check that the zoom's low end goes below about 0.8.

## 2. Offset and lens shift

Most projectors don't put the image centred on the lens. **Offset** is how far the image sits to one side of the lens's centre line, as a percentage of image height. [BenQ](https://www.benq.com/en-us/business/golf-simulator-projector/resources/right-projector-offset.html): offset is "the distance between the center of the lens to the bottom of the image" (table) or "the top of the image" (ceiling). At **100%** the image's edge lines up with the lens centre. At **115%** the edge sits a further 15% of the image height beyond it. Fixed short-throw lenses typically have 100–115% (e.g. Optoma ZH406ST: throw ratio 0.5, offset 115%, [spec page](https://justprojectors.com.au/optomazh406st.htm)).

**Pointing down**, "image height" becomes the image's short side on the table, which is the table depth (80 cm at 120 × 80). The image centre lands this far from the point directly under the lens:

```
shift of image centre = (offset − 50%) × image depth
```

| Offset | Shift at 120 × 80 (80 cm depth) |
|---|---|
| 50% (centred, e.g. lens shift at its middle) | 0 cm |
| 100% | 40 cm, so the lens sits right above the table's edge |
| 115% | 52 cm, so the lens sits 12 cm beyond the table's edge |

This is **useful, not a problem**. With 100–115% offset, the projector hangs over the table's edge (or just past it), out of the way of hands and out of the camera's view, while the camera hangs over the centre. It does mean the rig's arm must reach that far, and the camera ends up 40–50 cm from the projector, not beside it.

**Lens shift** lets you slide the image without tilting. Example: the Epson EB-L630U has vertical ±50% and horizontal ±20% ([Epson](https://www.epson.com.vn/p/V11HA26040)). Vertical ±50% moves the image by up to half its height, here 40 cm. Lens shift is nice-to-have: it lets you fine-tune the image onto the table without moving the mount. **Don't tilt the projector to aim it.** Tilting turns the rectangle into a trapezoid ("keystone"). Fixing that digitally throws away pixels and brightness.

Where to find it: "offset", "projection offset", "lens shift (vertical/horizontal)". If the sheet doesn't list it, the manual's projection-distance diagram shows it as a dimension from the lens centre to the image edge.

## 3. Pointing straight down

The maker must explicitly allow it. Spec-sheet words:

- Epson: "**Projection Orientation: 360º Free**" (EB-L630U, [Epson](https://www.epson.com.vn/p/V11HA26040)); "360° installation … from horizontal to vertical and everything in between" (EB-L630U, [reseller copy of Epson's text](https://justprojectors.com.au/epsonebl630u.htm)).
- Optoma: "**360 Degree Installation**" and "**Portrait Installation**" (ZH406ST, [spec page](https://justprojectors.com.au/optomazh406st.htm)).

**Why lamps forbid it.** A projector lamp is a high-pressure gas bulb that relies on convection and a fan path designed for one orientation. Lamp-projector manuals typically say "do not tilt more than 15°" and forbid vertical use, warning the lamp may fail to light or its life drops sharply ([example lamp manuals: Epson EB-Z series](https://download.epson.com.sg/manuals/EB-Z%20series%20UsersGuide.pdf), and Vivitek/InFocus/JVC user manuals carry the same warning). **Laser and LED light sources** don't have that limit, which is why "360°" is almost only found on laser models.

Also check that the fan vents aren't blocked when it points down (hot air rises past the body), and that the case has **ceiling-mount screw holes**, so a standard mount or plate can hold it.

## 4. Brightness

### What lumen numbers mean

- **ANSI lumens**: the light measured at 9 points on a projected white image, averaged, times the image area. [ProjectorCentral](https://www.projectorcentral.com/Lumens-Explained.htm): "ANSI lumens = average of Lux readings × image area in square meters." It is light that actually reaches the image.
- **ISO 21118 lumens** (often printed "ISO lumens", or "lm (ISO 21118)"): an international standard that uses the same 9-point method and also limits how far production units may vary from the rating. Treat it as **equal to ANSI** for shopping. Sources disagree on which reads a little higher, but the gap is small next to the gap to marketing numbers.
- **LED lumens / light-source lumens / "lumens" with no standard named**: not comparable. Light-source lumens measure the bulb before the optics lose light. "LED lumens" add a perception bonus for saturated colour. BenQ says these come out 1.3–2.4× the ANSI figure ([BenQ: ANSI vs light-source vs LED lumens](https://www.benq.com/en-us/knowledge-center/knowledge/finding-your-way-through-the-various-measures-of-brightness.html)). So **"4000 LED lumens" can be as little as about 1700 ANSI lumens.**
- **Colour brightness** ("Color Light Output", IDMS 15.4): how bright full colours are, not just white. 3LCD projectors list colour brightness equal to white. Single-chip DLP projectors with a white segment in the colour wheel can have colour brightness well below white. Epson says "as low as 1/3 of the provided spec" if colour brightness isn't listed ([Epson: Color Brightness](https://epson.ca/projectors-color-brightness)). That is a maker's own claim against competitors, but the mechanism is real. It matters here because Snapscript lights cards up in **colour** (errors, outlines).

Spec ratings are measured new, in the brightest picture mode. A laser's "20,000 h" life is the time until brightness falls to **50%** ([Epson light-source specifications](https://files.support.epson.com/docid/cpd5/cpd57051/source/specifications/reference/ef100/spex_laser_ef100.html)). Plan for some margin.

### How much light on the table

Light on the table (lux) = ANSI lumens ÷ image area (m²). **Mounting height doesn't change it**, because the image is always sized to the table. Only table size and aspect ratio do.

How bright is the room? European office lighting (EN 12464-1) requires **500 lux** on a desk for reading and writing ([DIALux summary of EN 12464-1](https://dialux4.support-en.dial.de/support/solutions/articles/9000080374-standard-values-for-office-interiors)). Daylight indoors that people find comfortable is **300 to about 3000 lux** ([VELUX daylight guide](https://www.velux.com/healthy-buildings/research-and-knowledge/deic-basic-book/daylight/daylight-calculations-and-measurements)). A table near a window on a bright day sits at the upper end. A table also catches more room light than a wall screen, because ceiling lights and skylight aim at horizontal surfaces.

How much contrast is "enough"? The AV industry standard ANSI/INFOCOMM 3M-2011, now AVIXA's **Image System Contrast Ratio**, sets minimum on/off contrast measured in the real room including ambient light ([AVIXA](https://www.avixa.org/standards/image-system-contrast-ratio); [Rave on the standard](https://www.ravepubs.com/infocomm-designing-for-high-contrast-how-one-university-uses-infocomms-projected-image-standard)): **7:1** passive viewing, **15:1** basic decision making, 50:1 analytical, 80:1 full-motion video ([summary at proav.de](https://proav.de/video/contrast-brightness.html)). Projected highlights on cards and a simple sketch are "passive" to "basic". The room light falls on both the lit and unlit parts of the table, so:

```
contrast ≈ (projector lux + room lux) ÷ room lux
```

**At 120 × 80 cm (rated ANSI lumens, new):**

| ANSI lumens | Lux on table (16:9 / 16:10) | Contrast in 300 lux (dim room) | 500 lux (office) | 1000 lux (near a window) |
|---|---|---|---|---|
| 2000 | 1760 / 1950 | 6.9 : 1 | 4.5 : 1 | 2.8 : 1 |
| 3000 | 2640 / 2930 | 9.8 | 6.3 | 3.6 |
| **4000** | **3520 / 3910** | **12.7** | **8.0** | **4.5** |
| 5000 | 4400 / 4880 | 15.6 | 9.8 | 5.4 |
| 6000 | 5270 / 5860 | 18.6 | 11.5 | 6.3 |
| 8000 | 7030 / 7810 | 24.4 | 15.1 | 8.0 |

(Contrast column uses 16:9. 16:10 is about 10% better.)

**Lumens needed** at 120 × 80, 16:9: for **7:1**, 2000 lm (300 lux room), **3400 lm (500 lux)**, 6800 lm (1000 lux). For **15:1**, 4800, 8000 and 16000 lm. At 160 × 100 the image is 1.56× bigger, so multiply by 1.56. At 90 × 60, multiply by 0.56.

**Verdict on "at least 4000 lumens".** Right as a **minimum**, provided that:
1. it is **ANSI or ISO 21118** lumens, not LED, light-source or unlabelled lumens;
2. the table is under normal room light (about 500 lux), not in a sunbeam or right by a window;
3. the table is about 120 × 80 cm. For 160 × 100, 4000 lm gives only about 5:1 in an office.

For a room that is really **daylit**, aim for **about 6000 ANSI lumens**. Add the easy free fixes too: blinds, keep the table out of direct sun, and use a matte table surface. A softer rule of thumb, image "50% to 100% brighter than the ambient light" ([proav.de](https://proav.de/video/contrast-brightness.html)), would pass even 2000 lm. The 7:1 floor is the safer bar.

## 5. Resolution on the table

**Native resolution** is the number of pixels the imaging chip really has ("native resolution", "panel resolution", "display resolution"). **Accepted** or **supported input** resolution ("supports 4K input", "max input") is what the projector will take over HDMI and then scale down. Many cheap projectors accept 1080p or 4K while showing only 720p or less. Some business models list "4K enhancement" or "pixel shift": native WUXGA panels shifted to fake extra detail (the EB-L690SU lists WUXGA "with 4K Enhancement", [Epson](https://www.epson.co.in/Projectors/Corporate-and-Education/-EB-L690SU-Short-Throw-WUXGA-3LCD-Laser-Projector/p/V11HB31056)). **Shop by native.**

Projector pixels on the table = native horizontal pixels ÷ image width:

| Native | 120 × 80 cm | px per 30 mm card height | Pixel size |
|---|---|---|---|
| 1280 × 800 (WXGA) | 1.0 px/mm (16:10, 128 cm) | 30 | 1.0 mm |
| 1920 × 1080 (1080p) | 1.35 px/mm (16:9, 142 cm) | 40 | 0.74 mm |
| 1920 × 1200 (WUXGA) | 1.5 px/mm (16:10, 128 cm) | 45 | 0.67 mm |
| 3840 × 2160 (native 4K) | 2.7 px/mm | 81 | 0.37 mm |

The projector doesn't read anything. It only needs to draw a crisp outline round a single card, colour a card, and show the sketch and small help text. With 1080p, a card's 30 mm height is 40 pixels and a 1 mm-wide line is a pixel or two, which is plenty for outlines. Projected text stays readable down to about 10–12 px tall, about 8 mm on the table. That is fine for help text on a doc comment. **Native 1920 × 1080 or 1920 × 1200 is the requirement.** WXGA (1280 × 800) is the floor of acceptability. Native 4K is a nice-to-have that costs a lot and is rare in laser 360° models.

Also: **px/mm doesn't change with height** (the image is sized to the table), but it does drop with table size. At 160 × 100 cm, 1080p gives 1.08 px/mm.

## 6. Other checks

- **Contrast ratio on the spec sheet** ("2,500,000:1", "dynamic contrast"): **ignore it.** It is measured in a dark room. On a lit table the room light sets contrast (see [Brightness](#4-brightness)). The ISCR standard measures "system" contrast for exactly this reason ([Rave](https://www.ravepubs.com/infocomm-designing-for-high-contrast-how-one-university-uses-infocomms-projected-image-standard)).
- **Colour on white cards**: prefer equal **colour and white brightness** (3LCD, or a sheet that lists "Color Light Output" equal to white). Error highlights are coloured light on white card stock, so weak colour brightness shows up directly.
- **Fan noise** ("noise level", "fan noise", in dB or dB(A), usually listed for Normal and Eco modes): people sit right under it. Example: EB-L630U lists 38 dB normal / 27 dB eco ([Epson](https://www.epson.com.vn/p/V11HA26040)); ZH406ST lists 32 dB eco ([spec page](https://justprojectors.com.au/optomazh406st.htm)). Require ≤ about 38 dB in normal mode. ≤ 30 dB is nice. Eco modes lower both noise and brightness.
- **Input lag** ("input lag", "response time", "game mode", in ms): time from HDMI signal to image. [BenQ](https://www.benq.com/en-us/knowledge-center/knowledge/benq-input-lag-and-gaming-projector-performance.html) puts "good" for gaming at under 25 ms. Business projectors rarely list it. Reviewers like [RTINGS](https://www.rtings.com/projector/tests/inputs/input-lag) measure it. Cards mostly sit still, and the camera and vision pipeline will add far more delay, so it's **not required**. For other spatial projects that track hands, ≤ 50 ms (or a "low latency"/game mode) is a nice-to-have.
- **Light source** ("light source", "laser diode", "LED", "lamp", with "light source life" in hours):
  - **Laser**: 20,000 h (normal) to 50% brightness ([Epson](https://files.support.epson.com/docid/cpd5/cpd57051/source/specifications/reference/ef100/spex_laser_ef100.html)), instant on/off, usually 360°.
  - **LED**: long life, but true ANSI lumens are usually low (beware LED lumens).
  - **Lamp**: cheaper, but a few thousand hours, warm-up and cool-down, and usually **no vertical mounting**.
  - **Require laser or LED. Laser is the nice-to-have.**
- **Flicker on camera.** Single-chip DLP shows red, green and blue one after another (a colour wheel or flashing lasers/LEDs). A camera with short exposure or a rolling shutter (both the Camera Module 3 and the Brio are rolling-shutter) can catch partial colours as bands or flicker. BenQ's fix for DLP is to set the camera frame rate to the projector's refresh rate or a multiple of it ([BenQ: recording without flicker](https://www.benq.com/en-us/golf-simulator-projector/knowledge/record-golf-swing-without-flickering.html)). Longer exposures, covering whole refresh cycles (e.g. 1/60 s at 60 Hz), also average it out. **3LCD and 3-chip DLP show all colours at once** and avoid the colour-sequential problem. Nice-to-have: 3LCD. Whatever is bought, the "IRL camera experiment" should confirm there is no banding at the chosen exposure (the camera research already listed projector flicker as a thing to confirm).
- **Geometric correction** ("4-corner correction", "point correction", "geometric correction"): lets software-free fine alignment. Handy, but each correction costs some pixels. Nice-to-have.
- **Weight and mount**: the rig must hold it. Example: EB-L630U is 8.4 kg ([Epson AU specs](https://www.epson.com.au/products/projector/EB-L630U_Specs.asp)). Install-class laser projectors are often 5–10 kg, portable LED ones 1–3 kg. Record the weight on the checklist so the rig design can use it.

## 7. Reuse for other spatial-computing projects

What makes a projector a good general-purpose tabletop one beyond Snapscript:

- **360° mounting and laser light**: points anywhere, on/off instantly, no lamp swaps.
- **A wide optical zoom (≥ 1.5×) and lens shift**: the same unit fits different tables, heights and walls without tilting.
- **Brightness headroom (≥ 5000–6000 ANSI)**: works in lit rooms and on bigger surfaces.
- **Native WUXGA (16:10)** or better: 16:10 wastes less on 3:2 tables. Higher native resolution helps any project that projects text.
- **3LCD or 3-chip**: plays well with cameras, which most spatial projects use.
- **Low input lag mode**: hand-tracking projects feel better at ≤ 50 ms.
- **Network or serial control** ("LAN control", "PJLink", "RS-232C"): software can turn it on and off and switch inputs.
- **Quiet eco mode**, and standard ceiling-mount holes.

---

## Checklist

Shop by these. "Where to look" gives the spec-sheet names.

| Spec | Required | Nice-to-have | Where to look on the sheet |
|---|---|---|---|
| Mounting | Maker allows straight-down use: "360° installation" / "360° free" | Also "portrait mode" | Installation, projection orientation |
| Light source | Laser or LED (not lamp) | Laser, ≥ 20,000 h to half brightness | Light source, light source life |
| Throw ratio | Zoom range includes about **0.85–1.2** (16:9) for 1.2–1.7 m over 120 × 80; in general includes *h* ÷ W for your rig height | Optical zoom ≥ 1.5×; low end ≤ 0.8 if the Brio's ~1 m height is used | Throw ratio, projection ratio, zoom |
| Offset / lens shift | Offset known (from sheet or manual diagram) so the mount can be placed | Vertical lens shift ≥ ±50%, some horizontal | Offset, lens shift |
| Brightness | **≥ 4000 ANSI or ISO 21118 lumens** (not LED/light-source lumens) at 120 × 80 in a normally lit room | ≥ 6000 ANSI for a daylit room or 160 × 100 table | Brightness, white light output, lm (ISO 21118) |
| Colour brightness | Listed, or 3LCD | Equal to white brightness | Color brightness, Color Light Output |
| Native resolution | 1920 × 1080 or 1920 × 1200 native (≥ 1.35 px/mm at 120 × 80) | Native WUXGA (16:10); native 4K | Native resolution (not "supported input") |
| Imaging tech | (any) | 3LCD or 3-chip, no colour-sequential flicker on camera | Display technology |
| Fan noise | ≤ ~38 dB normal mode | ≤ 30 dB | Noise level, fan noise |
| Contrast | Ignore the number | — | — |
| Input lag | Not required | ≤ 50 ms (game / low-latency mode) | Input lag, response time |
| Inputs and control | HDMI | LAN control / PJLink / RS-232C | Interfaces |
| Geometric correction | — | 4-corner or point correction | Keystone, geometric correction |
| Weight | Known, within the rig's limit | ≤ 5 kg | Weight |

**Height formula:** h = throw ratio × max(table width, table depth × aspect). At 120 × 80 cm, 16:9: **h = 1.42 × throw ratio**. 16:10: **h = 1.28 × throw ratio**.

**Example models that meet most of the checklist** (examples only, check stock and current specs):

- *Epson EB-L630U*: laser, 3LCD, WUXGA, 6200 lm (ISO 21118), "360° free", lens shift ±50% V. But its throw ratio of 1.35–2.20 is a **standard** lens, about 1.73–2.82 m at 120 × 80 (16:10). Too high for most rooms unless the table is small ([Epson](https://www.epson.com.vn/p/V11HA26040)).
- *Epson EB-L690SU*: laser, 3LCD, WUXGA, 6200 lm, 360°, throw ratio **0.79–1.36**, about 1.0–1.74 m at 120 × 80 (16:10). This is the band this checklist asks for ([Epson](https://www.epson.co.in/Projectors/Corporate-and-Education/-EB-L690SU-Short-Throw-WUXGA-3LCD-Laser-Projector/p/V11HB31056)).
- *Optoma ZH406ST*: laser, DLP, 1080p, 4200 ANSI, 360° and portrait, but a fixed 0.5 lens (about 71 cm at 120 × 80, too low) and discontinued. Shown as an example of a fixed short-throw sheet ([spec page](https://justprojectors.com.au/optomazh406st.htm)).

## Open points to raise (not settled here)

- **Projector light on markers.** The projector lights the cards the camera reads. Whether bright coloured highlights wash out markers or handwriting is for the IRL camera experiment to test, along with flicker.
- **Camera and projector placement.** With 100–115% offset, the projector sits over the table edge and the camera over the centre, 40–50 cm apart. The rig design should use this.
- **Ceiling height** of the actual room sets the top of the usable throw-ratio range. Measure it before shopping.
