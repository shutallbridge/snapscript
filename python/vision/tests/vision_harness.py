"""Runs the real vision service as a process and reads its JSON lines over TCP.

Tests describe a table as drawn frames: each frame lists the cards lying on it, by marker and pose in table mm.
The service draws those cards' sheets onto a table picture itself (the drawn frame source), so the tests run off
the Pi. Nothing here reaches inside the service: the tests see only what crosses the socket.
"""

import json
import re
import socket
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image

START_T = 1_000_000.0   # the drawn frames' first time stamp, s
PERIOD_S = 0.125        # time between drawn frames, s (about the rig camera's 7.6 fps)
PX_PER_MM = 4.0         # how the drawn camera sees the table
ORIGIN_MM = (-20.0, -10.0)  # the table mm at the drawn picture's top-left pixel
MM_PER_PH = 781.0       # the line-up's mm per projector height

# Marker IDs as the table app sends them: language cards from `language/markers.yaml` (90 is [define{}] 5U, 19
# [repeat], 65 [num{}] 4U), library cards and pages from 400 as a project's lockfile gives them, and the ruler's two
# from the table's own markers.
MARKERS = {
    "languageMarkers": {
        "90": {"card": "[define{}]", "length": 5},
        "19": {"card": "[repeat]", "length": 2},
        "65": {"card": "[num{}]", "length": 4},
    },
    "lockfile": {
        "402": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "circle", "length": 3},
        "400": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "createCanvas", "length": 6},
        "401": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "background", "length": 5},
        "403": {"kind": "page", "textbook": "snapscript-p5-getting-started", "volume": "confetti", "page": 0},
        "404": {"kind": "page", "textbook": "snapscript-p5-getting-started", "volume": "confetti", "page": 1},
    },
    "ruler": [312, 313],
}


@dataclass
class Card:
    marker: int
    x: float
    y: float
    angle: float = 0.0
    smudged: bool = False  # a smudge on the marker's corner: the camera misses it, but the card looks the same
    ink: tuple = ()     # strokes written on the sheet: (x0, y0, x1, y1) rectangles in sheet mm

    def json(self):
        out = {"marker": self.marker, "x": self.x, "y": self.y, "angle": self.angle}
        if self.ink:
            out["ink"] = [list(r) for r in self.ink]
        return out | ({"smudged": True} if self.smudged else {})


# Digits as seven-segment strokes 1 mm wide, 6 mm wide and 12 mm tall: each segment is 6 mm² of ink.
SEGMENTS = {"a": (0, 0, 6, 1), "b": (5, 0, 6, 6), "c": (5, 6, 6, 12), "d": (0, 11, 6, 12),
            "e": (0, 6, 1, 12), "f": (0, 0, 1, 6), "g": (0, 5.5, 6, 6.5)}
DIGITS = {"0": "abcdef", "1": "bc", "2": "abged", "3": "abgcd", "4": "fgbc", "5": "afgcd", "6": "afgedc",
          "7": "abc", "8": "abcdefg", "9": "abcdfg"}


def written(text, x0=45.0, y0=9.0):
    """Ink strokes for digits written along a whiteboard from sheet mm (x0, y0). For `[num{}]` (4U) the
    whiteboard is x 41-117 mm, y 3-27 mm."""
    out = []
    for i, ch in enumerate(text):
        dx = x0 + i * 9
        out += [(dx + a, y0 + b, dx + c, y0 + d) for a, b, c, d in (SEGMENTS[s] for s in DIGITS[ch])]
    return tuple(out)


@dataclass
class Hand:
    """A hand lying flat on the table, its palm centred at (x, y) table mm, fingers pointing up the table."""
    x: float
    y: float

    def json(self):
        return {"hand": [self.x, self.y]}


def frame_t(i, period_s=PERIOD_S):
    return START_T + i * period_s


def write_markers(d: Path) -> Path:
    p = d / "markers.json"
    p.write_text(json.dumps(MARKERS))
    return p


def write_lineup(d: Path, mm_per_ph=MM_PER_PH) -> Path:
    """The camera-to-projector line-up for the drawn camera, worked out by hand: a drawn pixel (u, v) is table mm
    (u / PX_PER_MM + ORIGIN_MM), and projector heights are table mm / mm_per_ph."""
    s = 1 / (PX_PER_MM * mm_per_ph)
    H = [[s, 0, ORIGIN_MM[0] / mm_per_ph], [0, s, ORIGIN_MM[1] / mm_per_ph], [0, 0, 1]]
    p = d / "lineup.json"
    p.write_text(json.dumps({"k1": 0.0, "H": H, "mm_per_projector_height": mm_per_ph}))
    return p


def write_scene(d: Path, frames, size_mm=(420, 300), period_s=PERIOD_S) -> Path:
    """frames: one list of Cards (and Hands) per frame, drawn in order, later ones on top."""
    p = d / "scene.json"
    p.write_text(json.dumps({
        "start_t": START_T, "period_s": period_s,
        "camera": {"px_per_mm": PX_PER_MM, "origin_mm": list(ORIGIN_MM), "size_mm": list(size_mm)},
        "frames": [[c.json() for c in f] for f in frames],
    }))
    return p


def write_fake_reader(d: Path, answers) -> Path:
    """A fake handwriting reader. It answers its calls in order (the last answer repeats), each `after_s` of frame
    time after the call, and notes every call in `calls.jsonl`. An answer is {"text": "500"} (empty: no text back)
    or {"fail": "connect"} / {"fail": "server"}."""
    p = d / "reader.json"
    p.write_text(json.dumps({"answers": answers, "calls": str(d / "calls.jsonl")}))
    return p


def reader_calls(d: Path):
    p = d / "calls.jsonl"
    return [json.loads(l) for l in p.read_text().splitlines()] if p.exists() else []


def run_service(d: Path, source: str, settings=None, lineup=None, reader=None, env=None, timeout=120):
    """Start the service on a free port, read every JSON line it sends until its frames run out, and return them.

    `reader`: the fake reader's answers (see write_fake_reader), or a `--reader` spec. By default a fake reader
    answers "500" after 2 s."""
    if not isinstance(reader, str):
        reader = f"fake:{write_fake_reader(d, reader or [{'text': '500', 'after_s': 2.0}])}"
    args = [sys.executable, "-m", "snapscript_vision", "--source", source, "--port", "0", "--reader", reader,
            "--markers", str(write_markers(d)), "--lineup", str(lineup or write_lineup(d))]
    if settings is not None:
        sp = d / "settings.json"
        sp.write_text(json.dumps(settings))
        args += ["--settings", str(sp)]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True, env=env)
    try:
        line = proc.stdout.readline()
        m = re.search(r"listening on 127\.0\.0\.1:(\d+)", line)
        if not m:
            proc.kill()
            raise AssertionError(f"service didn't start: {line!r} {proc.stderr.read()}")
        with socket.create_connection(("127.0.0.1", int(m.group(1))), timeout=timeout) as s:
            buf = b""
            while chunk := s.recv(65536):
                buf += chunk
        proc.wait(timeout=timeout)
        assert proc.returncode == 0, proc.stderr.read()
    finally:
        if proc.poll() is None:
            proc.kill()
    return [json.loads(l) for l in buf.decode().splitlines() if l.strip()]


# Committed camera pictures of the drawn table (PX_PER_MM, ORIGIN_MM, 420 x 300 mm), for recordings:
# `one-card` has [createCanvas] (400) at (150, 120); `two-cards` adds [circle] (402) at (300, 200), turned 45°.
RECORDINGS = Path(__file__).parent / "recordings"


def write_recording(d: Path, pictures, times) -> Path:
    """A recording as the rig's record.py writes it, from committed pictures (one name per frame): NAME.json
    (w, h, a time per frame) and NAME.y (grey planes back to back). Returns the recording's base path."""
    frames = [np.asarray(Image.open(RECORDINGS / f"{name}.png").convert("L")) for name in pictures]
    h, w = frames[0].shape
    base = d / "clip"
    (d / "clip.y").write_bytes(np.stack(frames).tobytes())
    (d / "clip.json").write_text(json.dumps({"w": w, "h": h, "t": times}))
    return base


def run_drawn(d: Path, frames, period_s=PERIOD_S, **kw):
    return run_service(d, f"drawn:{write_scene(d, frames, period_s=period_s)}", **kw)


def states(msgs):
    return [m for m in msgs if m["type"] == "state"]


def hw_of(msgs, marker):
    """The handwriting of the card with this marker, in each table state it's in."""
    return [c.get("hw") for m in states(msgs) for c in m["cards"] if c["marker"] == marker]
