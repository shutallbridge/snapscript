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
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

ap = argparse.ArgumentParser()
ap.add_argument("crops")
ap.add_argument("--model", default="microsoft/trocr-small-handwritten")
args = ap.parse_args()

proc = TrOCRProcessor.from_pretrained(args.model)
model = VisionEncoderDecoderModel.from_pretrained(args.model).eval()
crops = Path(args.crops)
run = json.loads(Path(str(crops).removesuffix("-crops") + ".json").read_text())
want = {r["id"]: r for r in run["results"]}
ok = same = 0
for f in sorted(crops.glob("*.png"), key=lambda f: int(f.stem)):
    r = want[int(f.stem)]
    t = time.perf_counter()
    with torch.no_grad():
        ids = model.generate(proc(Image.open(f).convert("RGB"), return_tensors="pt").pixel_values, max_new_tokens=24)
    text = proc.batch_decode(ids, skip_special_tokens=True)[0]
    onnx = {m.split("/")[-2] + "/" + m.split("/")[-1]: o["text"] for m, o in r["reads"].items()}
    ok += "".join(text.split()) == "".join(r["want"].split())
    same += text == next((v for k, v in onnx.items() if k.endswith("fp32")), None)
    print(f"{r['want']!r:>16} U={r['u_mm']}  torch: {text!r:<18} onnx: {onnx}  {time.perf_counter() - t:.2f}s")
print(f"{args.model}: exact {ok}/{len(want)}; same as ONNX fp32 on {same}/{len(want)}")
