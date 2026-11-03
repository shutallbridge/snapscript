"""What the service knows of the language: which kind of thing each marker is on.

It knows a card's length, whether it's handwritten, and where its whiteboard is on the sheet; and which markers are
on textbook pages and on the ruler page. Nothing else.

The service reads no project files: the table app sends the marker data in a `markers` message when it connects
(#184), and tests may give the same data as a `--markers` file. Either way it is the table reader's loaded shape
(`@snapscript/table-reader`'s `LanguageMarkers` and `Lockfile`) as JSON, plus the table's own markers:

    {"languageMarkers": {"65": {"card": "[num{}]", "length": 4}, "19": {"card": "[repeat]", "length": 2}},
     "lockfile": {"402": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "circle", "length": 3},
                  "403": {"kind": "page", "textbook": "snapscript-p5-getting-started", "volume": "confetti", "page": 3}},
     "ruler": [312, 313], "ruler_mm": 257, "calibration": [300, 301, ..., 311]}

The message is that object with `"type": "markers"` added.

A language marker's card is handwritten when its notation has braces (`[num{}]`, `[set{}to]`); library cards are
printed. Lengths are in U.

The table's own markers (in `language/markers.yaml`, 300-399: calibration's 300-311, the ruler's 312 and 313) are the
ruler page's two, `ruler_mm` apart on the printed page, and the twelve the projector shows in calibration's first
step (#172).
"""

import json
from dataclasses import dataclass
from pathlib import Path

# The card sheet's layout (#101), in mm on the sheet from its top-left corner: the printed word starts after the
# marker, each letter is 5.5 mm wide, and the whiteboard is 24 mm tall between the words.
WORD_START_MM = 17 + 1.5 + 3
LETTER_MM = 5.5
WORD_GAP_MM = 3
EDGE_MM = 3
WHITEBOARD_TOP_MM, WHITEBOARD_BOTTOM_MM = 3, 27


@dataclass(frozen=True)
class Marker:
    id: int
    kind: str                         # "card", "page", "ruler" or "calibration"
    length: int | None = None         # U, for cards
    handwritten: bool = False
    whiteboard: tuple | None = None   # (x0, y0, x1, y1) sheet mm, for handwritten cards


def whiteboard(card: str, length: int):
    """Where a handwritten card's whiteboard is on its sheet, from its notation (`[set{}to]`) and length."""
    word, close = card[1:card.index("{")], card[card.index("}") + 1:-1]
    x0 = WORD_START_MM + len(word) * LETTER_MM + WORD_GAP_MM
    x1 = length * 30 - EDGE_MM - (len(close) * LETTER_MM + WORD_GAP_MM if close else 0)
    return (x0, WHITEBOARD_TOP_MM, x1, WHITEBOARD_BOTTOM_MM)


def read(path) -> dict:
    """The marker data in a `--markers` file."""
    return json.loads(Path(path).read_text())


def parse(raw: dict) -> dict[int, Marker]:
    out = {}
    for k, v in raw.get("languageMarkers", {}).items():
        card, length = v["card"], int(v["length"])
        hw = "{" in card
        out[int(k)] = Marker(int(k), "card", length, hw, whiteboard(card, length) if hw else None)
    for k, v in raw.get("lockfile", {}).items():
        if v["kind"] == "library":
            out[int(k)] = Marker(int(k), "card", int(v["length"]))
        elif v["kind"] == "page":
            out[int(k)] = Marker(int(k), "page")
        else:
            raise ValueError(f"lockfile marker {k}: unknown kind {v['kind']!r}")
    for k in raw.get("ruler", []):
        out[int(k)] = Marker(int(k), "ruler")
    for k in raw.get("calibration", []):
        out[int(k)] = Marker(int(k), "calibration")
    return out


@dataclass(frozen=True)
class TableMarkers:
    ruler: tuple            # the ruler page's two markers
    ruler_mm: float | None  # how far apart their centres are printed
    calibration: tuple      # the markers projected in calibration's first step


def parse_table(raw: dict) -> TableMarkers:
    mm = raw.get("ruler_mm")
    return TableMarkers(tuple(int(k) for k in raw.get("ruler", [])), float(mm) if mm is not None else None,
                        tuple(int(k) for k in raw.get("calibration", [])))
