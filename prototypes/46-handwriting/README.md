# PROTOTYPE (#46): can TrOCR read handwritten cards?

Throwaway. Answers one question: does TrOCR-small, untrained, read handwritten card text from the rig camera at U = 25, 30 or 35 mm, and how fast is it on the Pi 5 CPU?

- `make_hw_sheets.py`: on the Mac, `uv run make_hw_sheets.py` → `out/hw-sheets-a4.pdf` and `cards.json`. Nine A4 pages of mock card faces (1U tall, 2–4U long, a 12 mm marker at the left end) with the text to write printed under each card. Each card has its own marker ID; `cards.json` holds its text and where its writing space is.
- `export_model.py`: on the Mac, `uv run export_model.py` → `out/models/trocr-small-handwritten/{fp32,int8}` (ONNX, no past key values; int8 is onnxruntime dynamic quantization).
- `read_hw.py` + `trocr.py`: on the Pi, in `~/hw46` (venv with `--system-site-packages`, plus `onnxruntime pupil-apriltags tokenizers`): `venv/bin/python read_hw.py --af --label <name> [--mode 64]`. Locks focus and exposure, takes one frame, fits one homography per page from its markers, cuts out each writing space, and reads it with each model. Saves `runs/<label>-<time>.{jpg,json}`, `-crops/` and `-crops.png`. `--image` reads a saved frame again.
- `reference.py`: on the Mac, `uv run reference.py runs/<…>-crops [--model …]` reads saved crops with PyTorch, to check the ONNX output and to try other models.
- `pi.sh`: SSH helper, from the marker prototype.

Scoring: gaps are ignored (as in the spec). "exact" counts case; "ignoring case" doesn't.
- `results/`: the Layout A rig run, 2026-10-25 (all nine pages on the table, 16 MP and 64 MP frames, raw and cleaned crops).

## Result (2026-10-25)

Not usable as is. With the crops cleaned (`prep.py` "tight": paper to white, ink to black, cut to the ink), TrOCR-small reads 31/96 cards exactly and 48/96 ignoring case; on real card text (leaving out the look-alike strings) 30/60 ignoring case. U size and 64 MP make no difference. The model pulls text toward English (`frameCount` → `framework`), reads `0` as `o` and `_` as `-`, and its confidence doesn't separate right reads from wrong. TrOCR-base and -large do worse. Speed on the Pi is fine: 0.53 s per card fp32, 0.31 s int8. See the #46 comment for details and the ways forward.

## Cloud reading (2026-10-27)

- `cloud_read.py`: on the Mac, `uv run cloud_read.py` reads the saved Layout A crops (`runs/A-16-20261025-233100-crops`) through OpenRouter. It sends one request per card, all in flight at once. The model returns only `{text, unreadable}`, and each reply belongs to the card whose request it answers. Options: `--models`, `--preps raw,clean`, `--prompts plain,kind`, `--limit N`, `--parallel N`, and `--report <json>` to rebuild the page. The key goes in `.env` here as `OPENROUTER_API_KEY=…` (gitignored).
- Each model is pinned to one host, with no fallbacks and with `data_collection: deny`. Reasoning is off, or at its lowest where it can't be turned off (GLM: mandatory on every host; Flash-Lite: minimal). Temperature is 0.
- **raw** is the crop as cut out. **clean** is `prep.py` "tight". Both are enlarged to at least 200 px tall. A crop with almost no contrast (under 40 grey levels from paper to darkest pixel; written crops are 95+) isn't stretched, because stretching turns paper noise into fake ink.
- **plain** prompt: copy exactly, keep case, don't fix spelling, gaps don't matter, say unreadable if blank. **kind** adds one line for the card's kind (number, name or text), which the marker gives.
- Each read is checked as the Pi would check it: a `num` must match `-?\d+(\.\d+)?` and a name may only use `[A-Za-z0-9_.]`. Anything else, or unreadable, is a read error.
- There are six blank crops, made from real crops by painting the ink over with a fitted paper surface.
- Results: `results/cloud-all-20261027.{json,html}` (every model × prep × prompt, 96 cards + 6 blanks) and `results/cloud-latency1-20261027.json` (24 cards, one request at a time).

Result: every model reads far better than TrOCR (31/96). The kind prompt helps every model by 8–15 cards, while cleaning makes little difference. Best: `gemma-4-31b-it` and `glm-5.3-flash`, raw crops, kind prompt: 80/96 exact and 54/60 on real card text. Gemma gives the same text every run; GLM and Flash-Lite don't. Haiku 5.5 is worse than the small models, because it often answers unreadable. Most real-text misses are in the crops or the writing, not the models: `drawCircle` runs off the 2U card, `_` written mid-height reads as `-` or `.`, and a lone `X`/`x` or `y`/`Y` has nothing to compare its size with. No model invents text on blank cards, except Flash-Lite once in 24 blank reads. Typical time per card is 1.5–2 s from the Mac, with occasional slow requests of 5–13 s.

Added later the same day: `gemini-3.6-flash`, thinking at minimal (`results/cloud-flash-20261027.*`). Its best setup, raw crops with the kind prompt, reads 78/96 exact and 54/60 real text, the same as the best small models. But it invents text on blank cards 5 times in 24 (`Underwood`, `Thread.count`, `Resized`), and changes 2 of 25 reads between runs. Typical time is 2.1–2.4 s, with one 16 s request.

Also added: `gemini-3.8-flash` (`results/cloud-flash38-20261027.*`). Thinking can't be turned off on any host, so it runs at minimal, about 225 thinking tokens per card. Its best setup, raw crops with the kind prompt, reads 81/96 exact and 87/96 ignoring case, the best of any model, mostly because it reads the look-alike strings (`sS5`, `zZ2`, `B8`, `g9q`). On real text it reads 53/60, the same as the others: its misses are the lone `X` (read as `x` three times), `score2` → `Scale 2`/`Score2`, and the clipped `drawCircle`. It invents nothing on blank cards, and changes 2 of 25 reads between runs. But it's about twice as slow: 4.1 s typical, with requests up to 11–14 s.
