"""What the service knows of the language: which kind of thing each marker is on.

It knows a card's length, whether it's handwritten, and where its whiteboard is on the sheet; and which markers are
on textbook pages and on the ruler page. Nothing else.

The file format of the lockfile and the language markers belongs to #157. Until it settles, this loads one JSON
shape (marker ID -> entry) that a #157 loader can fill instead:

    {"markers": {
      "1027": {"kind": "card", "card": "[num{}]", "length": 4, "handwritten": true, "whiteboard": [41, 3, 117, 27]},
      "1001": {"kind": "card", "card": "[call(p5.createCanvas)]", "length": 6, "handwritten": false},
      "2000": {"kind": "page", "page": "0. Get a canvas"},
      "2080": {"kind": "ruler"}}}

`length` is in U and `whiteboard` is (x0, y0, x1, y1) in mm on the card's sheet, from its top-left corner.
"""

import json
from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Marker:
    id: int
    kind: str                         # "card", "page" or "ruler"
    length: int | None = None         # U, for cards
    handwritten: bool = False
    whiteboard: tuple | None = None   # sheet mm, for handwritten cards


def load(path) -> dict[int, Marker]:
    raw = json.loads(Path(path).read_text())["markers"]
    out = {}
    for k, v in raw.items():
        kind = v["kind"]
        if kind not in ("card", "page", "ruler"):
            raise ValueError(f"marker {k}: unknown kind {kind!r}")
        wb = v.get("whiteboard")
        out[int(k)] = Marker(int(k), kind, v.get("length"), bool(v.get("handwritten", False)),
                             tuple(wb) if wb else None)
    return out
