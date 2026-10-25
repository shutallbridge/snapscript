# PROTOTYPE (#46): can TrOCR read handwritten cards?

Throwaway. Answers one question: does TrOCR-small, untrained, read handwritten card text from the rig camera at U = 25, 30 or 35 mm, and how fast is it on the Pi 5 CPU?

- `make_hw_sheets.py`: on the Mac, `uv run make_hw_sheets.py` → `out/hw-sheets-a4.pdf` and `cards.json`. Nine A4 pages of mock card faces (1U tall, 2–4U long, a 12 mm marker at the left end) with the text to write printed under each card. Each card has its own marker ID; `cards.json` holds its text and where its writing space is.
- `export_model.py`: on the Mac, `uv run export_model.py` → `out/models/trocr-small-handwritten/{fp32,int8}` (ONNX, no past key values; int8 is onnxruntime dynamic quantization).
- `read_hw.py` + `trocr.py`: on the Pi, in `~/hw46` (venv with `--system-site-packages`, plus `onnxruntime pupil-apriltags tokenizers`): `venv/bin/python read_hw.py --af --label <name> [--mode 64]`. Locks focus and exposure, takes one frame, fits one homography per page from its markers, cuts out each writing space, and reads it with each model. Saves `runs/<label>-<time>.{jpg,json}`, `-crops/` and `-crops.png`. `--image` reads a saved frame again.
- `reference.py`: on the Mac, `uv run reference.py runs/<…>-crops [--model …]` reads saved crops with PyTorch, to check the ONNX output and to try other models.
- `pi.sh`: SSH helper, from the marker prototype.

Scoring: gaps are ignored (as in the spec). "exact" counts case; "ignoring case" doesn't.
