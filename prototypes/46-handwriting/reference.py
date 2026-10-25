# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["transformers<4.50", "torch", "pillow", "sentencepiece", "protobuf"]
# ///
"""PROTOTYPE (#46), throwaway: read saved crops with the PyTorch model, as a reference.

Checks that the ONNX models on the Pi give the same text, and tries other models
(e.g. microsoft/trocr-base-handwritten) on the same crops.

    uv run reference.py runs/<label>-<time>-crops [--model microsoft/trocr-base-handwritten]
"""

import argparse
import json
import time
from pathlib import Path

import torch
from PIL import Image

from prep import prepare
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

ap = argparse.ArgumentParser()
ap.add_argument("crops")
ap.add_argument("--model", default="microsoft/trocr-small-handwritten")
ap.add_argument("--prep", default="raw", help="raw, contrast, tight or wide (see prep.py)")
ap.add_argument("--quiet", action="store_true")
args = ap.parse_args()

proc = TrOCRProcessor.from_pretrained(args.model)
model = VisionEncoderDecoderModel.from_pretrained(args.model).eval()
crops = Path(args.crops)
run = json.loads(Path(str(crops).removesuffix("-crops") + ".json").read_text())
want = {r["id"]: r for r in run["results"]}
ok = nocase = same = 0
by_u = {}
for f in sorted(crops.glob("*.png"), key=lambda f: int(f.stem)):
    r = want[int(f.stem)]
    t = time.perf_counter()
    with torch.no_grad():
        ids = model.generate(proc(prepare(Image.open(f), args.prep).convert("RGB"), return_tensors="pt").pixel_values, max_new_tokens=24)
    text = proc.batch_decode(ids, skip_special_tokens=True)[0]
    onnx = {m.split("/")[-2] + "/" + m.split("/")[-1]: o["text"] for m, o in r["reads"].items()}
    got, want_ = "".join(text.split()), "".join(r["want"].split())
    ok += got == want_
    nocase += got.lower() == want_.lower()
    by_u.setdefault(r["u_mm"], []).append(got == want_)
    same += text == next((v for k, v in onnx.items() if k.endswith("fp32")), None)
    if not args.quiet:
        print(f"{r['want']!r:>16} U={r['u_mm']}  torch: {text!r:<18} onnx: {onnx}  {time.perf_counter() - t:.2f}s")
print(f"{args.model} prep={args.prep}: exact {ok}/{len(want)}, ignoring case {nocase}/{len(want)}; "
      + ", ".join(f"U={u}: {sum(v)}/{len(v)}" for u, v in sorted(by_u.items()))
      + f"; same as ONNX fp32 on {same}/{len(want)}")
