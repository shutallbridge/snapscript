"""PROTOTYPE (#46), throwaway: run an exported TrOCR (export_model.py) with plain onnxruntime.

Greedy decoding, no past key values. Returns the text, the lowest token
probability (a confidence to test as the read-error rule) and the time taken.
"""

import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image
from tokenizers import Tokenizer

START, EOS = 2, 2
MAX_TOKENS = 24


class TrOCR:
    def __init__(self, folder: Path, threads: int = 4):
        opts = ort.SessionOptions()
        opts.intra_op_num_threads = threads
        self.encoder = ort.InferenceSession(str(folder / "encoder_model.onnx"), opts)
        self.decoder = ort.InferenceSession(str(folder / "decoder_model.onnx"), opts)
        self.tok = Tokenizer.from_file(str(folder / "tokenizer.json"))

    @staticmethod
    def pixels(img: Image.Image) -> np.ndarray:
        """Same as TrOCRProcessor: squash to 384×384 bicubic, scale to [-1, 1]."""
        a = np.asarray(img.convert("RGB").resize((384, 384), Image.BICUBIC), dtype=np.float32)
        return ((a / 255 - 0.5) / 0.5).transpose(2, 0, 1)[None]

    def read(self, img: Image.Image) -> dict:
        t0 = time.perf_counter()
        hidden = self.encoder.run(None, {"pixel_values": self.pixels(img)})[0]
        t1 = time.perf_counter()
        ids, probs = [START], []
        for _ in range(MAX_TOKENS):
            logits = self.decoder.run(None, {"input_ids": np.array([ids], dtype=np.int64), "encoder_hidden_states": hidden})[0][0, -1]
            p = np.exp(logits - logits.max())
            p /= p.sum()
            nxt = int(p.argmax())
            if nxt == EOS:
                break
            ids.append(nxt)
            probs.append(float(p[nxt]))
        t2 = time.perf_counter()
        return {
            "text": self.tok.decode(ids[1:], skip_special_tokens=True),
            "min_p": min(probs, default=0.0),
            "encode_s": t1 - t0,
            "decode_s": t2 - t1,
        }
