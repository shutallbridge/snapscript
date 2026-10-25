"""PROTOTYPE (#46), throwaway: clean a card crop before TrOCR reads it."""

import numpy as np
from PIL import Image


def prepare(img: Image.Image, how: str) -> Image.Image:
    """Clean a crop before reading. raw: as cut out. contrast: gray, paper to white and
    ink to black. tight: contrast, then cut to the ink with a margin. wide: tight, then
    padded with white to at least 3:1, so short text isn't stretched into a blob."""
    if how == "raw":
        return img
    g = np.asarray(img.convert("L"), dtype=np.float32)
    paper, ink = np.percentile(g, 75), np.percentile(g, 1)
    g = np.clip((g - ink) / max(paper - ink, 1) * 255, 0, 255)
    out = Image.fromarray(g.astype(np.uint8))
    if how == "contrast":
        return out
    ys, xs = np.nonzero(g < 128)
    if len(xs):
        pad = 0.15 * (ys.max() - ys.min() + 1) + 2
        out = out.crop((max(xs.min() - pad, 0), max(ys.min() - pad, 0), min(xs.max() + pad, g.shape[1]), min(ys.max() + pad, g.shape[0])))
    if how == "tight":
        return out
    w = max(out.width, 3 * out.height)
    canvas = Image.new("L", (w, out.height), 255)
    canvas.paste(out, ((w - out.width) // 2, 0))
    return canvas
