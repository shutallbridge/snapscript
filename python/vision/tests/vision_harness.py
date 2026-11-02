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

START_T = 1_000_000.0   # the drawn frames' first time stamp, s
PERIOD_S = 0.125        # time between drawn frames, s (about the rig camera's 7.6 fps)
PX_PER_MM = 4.0         # how the drawn camera sees the table
ORIGIN_MM = (-20.0, -10.0)  # the table mm at the drawn picture's top-left pixel
MM_PER_PH = 781.0       # the line-up's mm per projector height

# The card feedback prototype's marker IDs (#159: fixtures use them until #157 settles the lockfile).
MARKERS = {
    "languageMarkers": {
        "1000": {"card": "[define{}]", "length": 5},
        "1009": {"card": "[repeat]", "length": 2},
        "1027": {"card": "[num{}]", "length": 4},
    },
    "lockfile": {
        "0": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "circle", "length": 3},
        "1001": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "createCanvas", "length": 6},
        "1004": {"kind": "library", "card": "call", "package": "snapscript-p5", "name": "background", "length": 5},
        "2000": {"kind": "page", "textbook": "snapscript-p5-getting-started", "volume": "confetti", "page": 0},
        "2001": {"kind": "page", "textbook": "snapscript-p5-getting-started", "volume": "confetti", "page": 1},
    },
    "ruler": [2080, 2081],
}


@dataclass
class Card:
    marker: int
    x: float
    y: float
    angle: float = 0.0

    def json(self):
        return {"marker": self.marker, "x": self.x, "y": self.y, "angle": self.angle}


def frame_t(i):
    return START_T + i * PERIOD_S


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


def write_scene(d: Path, frames, size_mm=(420, 300)) -> Path:
    """frames: one list of Cards per frame."""
    p = d / "scene.json"
    p.write_text(json.dumps({
        "start_t": START_T, "period_s": PERIOD_S,
        "camera": {"px_per_mm": PX_PER_MM, "origin_mm": list(ORIGIN_MM), "size_mm": list(size_mm)},
        "frames": [[c.json() for c in f] for f in frames],
    }))
    return p


def run_service(d: Path, source: str, settings=None, lineup=None, timeout=120):
    """Start the service on a free port, read every JSON line it sends until its frames run out, and return them."""
    args = [sys.executable, "-m", "snapscript_vision", "--source", source, "--port", "0",
            "--markers", str(write_markers(d)), "--lineup", str(lineup or write_lineup(d))]
    if settings is not None:
        sp = d / "settings.json"
        sp.write_text(json.dumps(settings))
        args += ["--settings", str(sp)]
    proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
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


def run_drawn(d: Path, frames, **kw):
    return run_service(d, f"drawn:{write_scene(d, frames)}", **kw)


def states(msgs):
    return [m for m in msgs if m["type"] == "state"]
