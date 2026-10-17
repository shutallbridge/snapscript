# Recognising short handwritten tokens on cards

Research for [#28](https://github.com/shutallbridge/snapscript/issues/28), part of the map [#26](https://github.com/shutallbridge/snapscript/issues/26).

**Question.** How can the short handwriting on a card's whiteboard (`[num(500)]`, `[set(xPos)to]`, `[str(hello_world)]`, `[call(p5.circle)]`) be recognised on the same device that reads the markers, and how many camera pixels does it need?

A note on words: in this file **marker** always means the printed pattern on a card side (see `CONTEXT.md`). The thing you write with is called a **whiteboard pen**.

Sources are linked inline. Where a number is my own arithmetic or estimate rather than a quoted figure, it says so.

## Short answer

- **Handwriting, not markers, will probably set the camera's resolution and height.** A typical marker needs roughly 1–1.5 camera pixels per mm of table. Case-sensitive handwritten names need roughly 3 px/mm. Digits alone need about 2 px/mm.
- **Target size: about 20 px for a lowercase letter's height, about 30 px for a digit or capital.** Below about 10–12 px, published OCR systems stop working.
- **At 120 × 80 cm, only full-resolution stills from an ~12 MP camera reach this.** For example, a Raspberry Pi Camera Module 3 gives about 3.2 px/mm. A 1080p webcam gives about 1.35 px/mm, which is too few. A 4K webcam gives about 2.7 px/mm, which is borderline.
- **Approaches to test:** a small character-level recogniser limited to each card kind's allowed characters (PARSeq or the PP-OCRv5 recogniser), and TrOCR-small as the accuracy baseline. The marker tells us where the whiteboard is, so we can skip the "find the text" step entirely.
- **The ID shortcut works and matters.** Read each card side once, cache the result by marker ID, and read again only when the whiteboard crop changes. Then even a model that takes one second per token is fine on a Raspberry Pi 5 or in a browser.
- **No model will be perfect.** At a few percent character error, a 6-letter name is misread something like one time in five. The system needs a way to show the user what it read.

## 1. What makes this problem easy, and what makes it hard

**Easy parts** (compared with general handwriting recognition):

- **We know where the text is.** The marker gives the card side's position and rotation, so the whiteboard area can be cut out and straightened (a *perspective warp*). Most OCR pipelines spend much of their effort on *text detection*, which means finding where the text is in a photo. We can skip that and run *recognition* only: one cropped image in, one string out.
- **We know which characters are allowed.** The marker tells us the card's kind (OVERVIEW_SPEC.md, "Handwriting"):
  - `[num(…)]`: digits, `-` and `.`. That is 12 symbols.
  - names (`[set(…)to]`, `[get(…)]`, `[define(…)]`, `[call(…)]`): letters, digits, `_`, and `.` as the namespace separator in `[call(p5.circle)]`. That is about 64 symbols, case-sensitive.
  - `[str(…)]`: free text.
- **The tokens are short.** They are usually 1–12 characters on one line.
- **It changes rarely.** A card's writing stays the same until someone wipes it.

**Hard parts:**

- **Case-sensitive names.** Many letters are the same shape in upper and lower case and differ only in size: c/C, o/O, s/S, v/V, w/W, x/X, z/Z, and others. The EMNIST handwriting dataset *merges* 15 such letter pairs (C, I, J, K, L, M, O, P, S, U, V, W, X, Y, Z) in its "Balanced" split because classifiers could not tell them apart ([Cohen et al. 2017, EMNIST](https://arxiv.org/abs/1702.05373)). In the same paper, a simple classifier scores 97% on digits alone but only 78% on the 62-class digits+upper+lower set. A model can only tell `x` from `X` by comparing it with neighbouring letters. For a one-letter name like `[set(x)to]` versus `[set(X)to]` there may be nothing to compare against.
- **Look-alikes across letters and digits**, such as 0/O/o, 1/l/I, 5/S, 2/Z, and `_` versus an underline stroke. These matter only inside names and strings. Inside `[num(…)]` the allowed set removes them.
- **Whiteboard pen strokes are thick** (about 1.5–3 mm) compared with the card. A 30 mm card cannot hold large writing, so characters will be small on the camera image.
- **Not text-like.** Names such as `xPos` and `p5.circle` are not English words. Models trained on English prose lean towards real words (see TrOCR below).

## 2. Candidate approaches

### A. Small per-character classifier (MNIST/EMNIST-style CNN)

This means: cut the crop into single characters, for example by finding separate blobs of ink (*connected components*), then classify each character with a tiny *convolutional neural network* (CNN), the standard kind of image-classifying network.

- **Accuracy:** about 97–99%+ per digit is normal. MNIST digits are only **20 × 20 px** inside a 28 × 28 image ([MNIST page](http://yann.lecun.com/exdb/mnist/)). Letters with case are much worse. The EMNIST 62-class result above is about 78% for a simple classifier, and the lost accuracy is mostly in the upper/lower pairs.
- **Weak spot:** cutting into characters. It fails when letters touch, which happens often in quick handwriting.
- **Runs anywhere.** The model is a few hundred KB and takes well under a millisecond per character on a Pi or in a browser. This is my estimate, based on the model size.
- **Good fit for:** `[num(…)]` only.

### B. Line recognisers that read a whole strip of characters ("scene text" / CRNN-style)

These read a whole strip at once and output a string, so no cutting into characters is needed. They output one character at a time. That means we can **forbid characters that the card kind doesn't allow** when decoding. For example, an `[num(…)]` card can never be read as `5OO`.

- **PARSeq** ([code and model, Apache-2.0](https://github.com/baudm/parseq)) has about 24M parameters. Its input is a **32 × 128 px** strip. Its character sets include a 62-symbol mixed-case set and a 94-symbol full set, and it exports to ONNX. It was trained mostly on printed/scene text, so it **needs fine-tuning on handwriting**. That means further training on handwriting examples, ideally photos of our own cards.
- **PaddleOCR PP-OCRv5 recogniser** ([PaddleOCR](https://github.com/PaddlePaddle/PaddleOCR), [PP-OCRv5 docs](https://www.paddleocr.ai/latest/en/version3.x/algorithm/PP-OCRv5/PP-OCRv5.html)). The docs say it was upgraded for "complex Chinese and English handwriting". The recognition model takes a strip **48 px tall**. Model sizes are listed as tiny 1.5M, small 7.7M, and medium 34.5M parameters. The docs report recognition accuracy on handwritten English of **0.58 (server model) and 0.49 (mobile model)**. These are on Paddle's own test set, whose exact metric and contents the page does not define, so treat them only as "handwriting is still its weak spot". There is an official **browser SDK, PaddleOCR.js** ([docs](https://www.paddleocr.ai/latest/en/version3.x/inference_deployment/cross_platform/browser.html)), plus ONNX export and C++ deployment.
- **Tesseract / Tesseract.js** ([Tesseract.js](https://github.com/naptha/tesseract.js), a WebAssembly build for the browser). This is **not suitable**. The Tesseract FAQ says handwriting "won't work very well, as Tesseract is designed for printed text" ([FAQ](https://tesseract-ocr.github.io/tessdoc/FAQ.html)). Its size guidance is still useful (section 3).

### C. TrOCR (transformer handwriting model)

TrOCR is a *transformer* model, the same family as large language models: an image encoder plus a text decoder, trained on the IAM handwriting dataset ([Li et al. 2021](https://arxiv.org/abs/2109.10282), [model card](https://huggingface.co/microsoft/trocr-small-handwritten)).

- **Sizes and accuracy:** on IAM, measured with case-sensitive character error rate (CER, the share of characters wrong):

  | Model | Parameters | IAM CER |
  | --- | --- | --- |
  | small | 62M | 4.22% |
  | base | 334M | 3.42% |
  | large | 558M | 2.89% |

- **Speed:** 8.4 lines/s for small, on a V100 data-centre GPU, with beam search of 10 ([paper, Table 5](https://arxiv.org/abs/2109.10282)). There is no published Pi or browser speed. **We must measure it.**
- **Input:** the whole crop is resized to **384 × 384**. It is meant for "single text-line images" (model card), which matches our tokens.
- **Weak spot for us:** its text decoder works in English word pieces and has learned English. It may "correct" `xPos` to `xpos` or `Pos`, and it is harder to restrict to an allowed character set than approach B. This is my expectation from how the model is built; it needs testing.
- **Browser:** an ONNX build of trocr-small-handwritten exists for Transformers.js ([Xenova/trocr-small-handwritten](https://huggingface.co/Xenova/trocr-small-handwritten)). Transformers.js runs on WebAssembly or on WebGPU with `device: "webgpu"` ([guide](https://huggingface.co/docs/transformers.js/guides/webgpu)). The guide says about 85% of browsers had WebGPU as of March 2026.

### D. Cloud and operating-system OCR

- **Google Cloud Vision** reads handwriting through `DOCUMENT_TEXT_DETECTION`, with an English handwriting hint `en-t-i0-handwrit` ([docs](https://docs.cloud.google.com/vision/docs/handwriting)).
- **Azure Read** reads printed and handwritten English. It states a **minimum text height of 12 px in a 1024 × 768 image** ([docs](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/overview-ocr)). It is also available as an on-premises Docker container.
- **Apple Vision** (`VNRecognizeTextRequest`) is macOS/iOS only. By default it ignores text smaller than 1/32 of the image height ([docs](https://developer.apple.com/documentation/vision/vnrecognizetextrequest/minimumtextheight)).

These are likely the most accurate options with no training, but they need a network connection, cost money per call, and send photos of a classroom table to a third party. None runs on the Pi or fully in the browser. **Best use: as a reference result in the IRL experiment**, to show how good a local model could get.

### E. Bigger hardware on the Pi

The Raspberry Pi AI HAT+ (Hailo-8L 13 TOPS, or Hailo-8 26 TOPS) and the AI HAT+ 2 (Hailo-10H, 40 TOPS, 8 GB, which runs "LLMs and VLMs up to ~6 billion parameters") are add-on accelerators ([docs](https://www.raspberrypi.com/documentation/accessories/ai-hat-plus.html)). They are an option if a CPU-only Pi 5 is too slow. With the ID shortcut (section 5), that should not be needed.

## 3. How many pixels per character?

There is no single published "minimum px for handwriting". These primary-source data points agree closely:

| Source | Figure |
| --- | --- |
| Tesseract FAQ ([old FAQ](https://github.com/tesseract-ocr/tessdoc/blob/main/tess3/FAQ-Old.md#is-there-a-minimum--maximum-text-size-it-wont-read-screen-text)) | Good results at **x-height ≈ 20 px**. "Below an x-height of 10 pixels, you have very little chance of accurate results." (x-height is the height of a lowercase `x`.) |
| Azure Read ([docs](https://learn.microsoft.com/en-us/azure/ai-services/computer-vision/overview-ocr)) | Minimum text height **12 px** |
| MNIST ([page](http://yann.lecun.com/exdb/mnist/)) | Handwritten digits normalised to a **20 px** box. Recognisers exceed 99% at this size. |
| PARSeq / PP-OCRv5 inputs | Whole line resized to **32 px / 48 px** tall |

The model input sizes are telling. If the camera captures text smaller than what the model is fed, the model only gets an enlarged blurry copy, with no new detail.

**Recommendation (my synthesis):**

- **Target: ~20 px x-height (lowercase), ~30 px cap/digit height.**
- **Hard floor: ~12 px character height.** Expect errors here, especially with mixed case.
- **Stroke width ≥ ~3 px**, so a stroke survives blur and the camera's colour processing.

### From pixels to pixels-per-mm on the table

Handwriting size on a card is my estimate, since nothing is measured yet. With U = 30 mm, the whiteboard area is maybe 15–20 mm tall. With a whiteboard pen, comfortable writing that fits is roughly **digits and capitals ≈ 10 mm, lowercase x-height ≈ 6 mm, strokes ≈ 1.5–2 mm**. At U = 25 mm, scale down by about 15%.

| Card content | Needs | → px/mm on the table |
| --- | --- | --- |
| `[num(500)]` (digits only) | 20–30 px on 10 mm | **2–3 px/mm** (floor ~1.2) |
| `[set(xPos)to]` (mixed-case name) | 20 px on 6 mm x-height | **~3.3 px/mm** (floor ~2) |
| `[str(hello_world)]` | same as names | **~3.3 px/mm** |

### What cameras give over a 120 × 80 cm table

This is arithmetic, assuming the image's short side just covers 80 cm (a 16:9 sensor can't be the limit on both sides at once).

| Camera / mode | Pixels | px/mm over 80 cm |
| --- | --- | --- |
| Pi Camera Module 3, full-resolution still | 4608 × 2592 ([docs](https://www.raspberrypi.com/documentation/accessories/camera.html)) | **3.2** |
| Pi Camera Module 3, video mode | 2304 × 1296 | 1.6 |
| 4K USB webcam | 3840 × 2160 | 2.7 |
| 1080p USB webcam | 1920 × 1080 | 1.35 |

The Camera Module 3's vertical field of view is 41° (same docs), so it covers 80 cm from about **1.07 m** up (my arithmetic). Its horizontal view then covers about 1.39 m, which is enough for 120 cm.

Real images lose some of this, for example to lens blur at the edges, focus, and colour processing. So the **Camera Module 3 at full resolution is just enough** for names, a **4K webcam is borderline**, and **1080p is enough only for markers and maybe digits**. A wide-angle lens (e.g. Camera Module 3 Wide, 102°) lets the camera hang lower but spreads the same pixels over more table, so it doesn't help resolution.

A useful split: **track markers on fast video frames, and take an occasional full-resolution still to read handwriting.** Handwriting doesn't change from frame to frame, so it doesn't need video speed.

## 4. Do markers or handwriting set the camera height?

**Handwriting, very likely.** A rough comparison (my estimate; #27 will fix the real marker): a 4 × 4-bit square marker plus border is about 6 cells across. On a 30 mm card side with a ~20 mm marker, each cell is about 3.3 mm. Reading a cell reliably needs a few pixels. OpenCV, for example, samples 4 px per cell by default (`perspectiveRemovePixelPerCell`) and by default rejects markers whose outline is below 3% of the image's longest side (`minMarkerPerimeterRate`) ([aruco_detector.hpp](https://github.com/opencv/opencv/blob/4.x/modules/objdetect/include/opencv2/objdetect/aruco_detector.hpp)). That means about **1–1.5 px/mm** for markers, against **~3 px/mm** for case-sensitive handwriting. With a fixed camera, px/mm is set by how much table the camera sees, so the handwriting needs more than twice the resolution the markers do.

So handwriting decides: a ~12 MP camera rather than 1080p, or a smaller table per camera, or larger writing. Larger writing means a bigger whiteboard area or a bigger U. A dense marker style chosen in #27 could narrow the gap, but is unlikely to close it.

## 5. The ID shortcut

The idea: recognise each card side once, cache the text by its marker ID, and re-read only when its writing changes. **Yes, this makes slow models acceptable.**

- **Detecting a change is cheap.** Compare today's straightened whiteboard crop with the one that was recognised, using a simple pixel difference. Re-read only when it differs and no hand is covering the card. This takes microseconds per card (my estimate).
- **Budget.** A program uses tens of written card sides (the sample in #26 had 31 distinct sides). Even at ~1 s per token for TrOCR-small on a Pi 5 CPU (an unmeasured guess; the published speed is on a data-centre GPU), the first full read takes about 30 s. After that, a single rewritten card takes about 1 s, which feels fine. The Pi 5's quad Cortex-A76 is "2–3× the speed" of a Pi 4 ([product page](https://www.raspberrypi.com/products/raspberry-pi-5/)), and there is spare time between camera frames.
- **It also enables a full-resolution still per change** (section 3), and **voting**: read the same card across a few stills and keep the result that agrees.
- **Caveat:** the cache must be cleared when a card side is wiped and rewritten. Comparing the crop handles that. Swapping two cards is handled by the ID.

## 6. Where each approach runs

| Approach | Raspberry Pi 5 (Python) | Browser (WASM / WebGPU) | Notes |
| --- | --- | --- | --- |
| A. Digit/char CNN | Yes, trivially | Yes, trivially (ONNX Runtime Web) | Digits only |
| B. PARSeq / PP-OCRv5 recogniser | Yes (ONNX Runtime / Paddle) | Yes (ONNX Runtime Web; PaddleOCR.js official) | Can be restricted to allowed characters. Needs fine-tuning on handwriting. |
| C. TrOCR-small | Probably, about 1 s/token (to measure) | Yes (Transformers.js, WASM or WebGPU) | Best published handwriting accuracy. Leans towards English. |
| C. TrOCR-base/large | Slow (unmeasured), possibly with AI HAT+ | Heavy (334M–558M params) | Laptop/GPU class |
| D. Cloud APIs | Network call | Network call | Reference result only |
| Tesseract(.js) | Yes | Yes | Not for handwriting |

ONNX Runtime Web can run every ONNX operator on WebAssembly, but only a subset on WebGPU, WebGL and WebNN ([docs](https://onnxruntime.ai/docs/tutorials/web/)). A model may therefore fall back to the slower WebAssembly (CPU) path. Nothing here forces the browser-or-Pi decision in #31: both can run approaches A–C.

## 7. Recommendation

**Test, in this order:**

1. **TrOCR-small-handwritten as-is**, as the accuracy baseline. It needs no training. Run it in Transformers.js and in Python on the Pi to measure real speed.
2. **A character-level recogniser (PP-OCRv5 or PARSeq) restricted to each card kind's allowed characters**, first as-is and then fine-tuned on a few hundred photos of our own cards. This is the most likely long-term choice: small, fast, runs in both places, and can never return a character the card kind forbids.
3. **One cloud API (Google or Azure)** on the same photos, as a reference result.
4. For `[num(…)]` only, a tiny digit CNN if approach 2 is weak on digits.

**Pipeline:** marker → straighten the whiteboard crop → crop changed? → recognise with only the card kind's allowed characters → cache by marker ID.

**Pixel requirement for the IRL experiment:** aim for **≥ 3 px/mm on the table** (≈ 20 px lowercase x-height at 6 mm), with a floor of ~2 px/mm. Over 120 × 80 cm that means **full-resolution stills from a ~12 MP camera** (e.g. Pi Camera Module 3), not 1080p. **Handwriting, not markers, sets the camera resolution and height.** Print test cards at U = 25, 30 and 35 mm, written with fine and bullet-tip whiteboard pens, and measure character error rate at several heights.

## 8. Questions to raise (not decided here)

- **Showing what was read.** At a few percent character error, multi-letter names will sometimes be misread. Should the projector show the recognised text next to each card, so users catch misreads? The spec's Feedback section doesn't cover this yet.
- **Correcting names against the program.** If `[get(xPos)]` is read as `xP0s` and only `xPos` is defined, should the system snap to the defined name? That would hide genuine typos that the spec treats as errors.
- **One-letter names that differ only in case** (`x` vs `X`, `s` vs `S`). Handwriting may not reliably carry this difference. Is this acceptable, or should card design (e.g. a printed baseline/x-height guide on the whiteboard) help?
- **Writing guidance:** should cards print light guide lines or character boxes? Boxes make cutting into characters (approach A) trivial and keep writing large.
- The literal `_` in `[str(…)]` is already **TBD** in the spec. It also affects recognition, because `_` must be told apart from a stray underline.
