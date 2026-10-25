# /// script
# requires-python = ">=3.12,<3.13"
# dependencies = ["optimum[onnxruntime]>=1.24", "transformers<4.50", "torch", "pillow", "sentencepiece"]
# ///
"""PROTOTYPE (#46), throwaway: export TrOCR to ONNX, full precision and int8.

    uv run export_model.py [--model microsoft/trocr-small-handwritten]
        ->  out/models/<name>/fp32/{encoder_model,decoder_model}.onnx + tokenizer files
            out/models/<name>/int8/  the same, dynamically quantized to int8

Copy out/models/<name> to the Pi; read_hw.py runs it with plain onnxruntime.
"""

import argparse
import shutil
from pathlib import Path

from onnxruntime.quantization import QuantType, quantize_dynamic
from optimum.exporters.onnx import main_export

HERE = Path(__file__).parent

ap = argparse.ArgumentParser()
ap.add_argument("--model", default="microsoft/trocr-small-handwritten")
args = ap.parse_args()

root = HERE / "out" / "models" / args.model.split("/")[-1]
fp32, int8 = root / "fp32", root / "int8"
# No past key values: simpler to decode by hand, and card text is only a few tokens.
main_export(args.model, output=fp32, task="image-to-text", no_post_process=True)
int8.mkdir(parents=True, exist_ok=True)
for f in fp32.iterdir():
    if f.suffix == ".onnx":
        quantize_dynamic(f, int8 / f.name, weight_type=QuantType.QInt8)
    else:
        shutil.copy(f, int8 / f.name)
print("wrote", root)
