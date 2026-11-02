"""Runs the real vision service on a live drawn table (the `world:` frame source) and talks to it over TCP.

The test plays the room and the table app. It changes the world file while the service runs (lays a card or the
ruler page, has the projector show markers, dims the room), and sends calibration commands as the table app would.
The service draws every frame from the world file as it is at that moment. The test sees only what crosses the
socket, and the line-up file the service keeps.
"""

import json
import os
import re
import socket
import subprocess
import sys
import time
from pathlib import Path

from vision_harness import MARKERS, ORIGIN_MM, PX_PER_MM, write_fake_reader

MM_PER_PH = 250.0       # the drawn projector's true mm per projector height (its picture is 375 x 250 mm)
ASPECT = 1.5            # the drawn projector's width over its height
ROOM = 5.0              # the room's light: grey per ms of exposure on white paper
PROJECTOR = 40.0        # the projector's white, the same way
CALIBRATION = list(range(300, 312))  # the twelve markers projected in step 1
RULER, RULER_MM = [2080, 2081], 257.0
TABLE_MARKERS = {**MARKERS, "calibration": CALIBRATION, "ruler": RULER, "ruler_mm": RULER_MM}
FAKE_CAMERA = Path(__file__).parent / "fake_camera"


class World:
    """The table as the service's drawn camera sees it, in a file the test rewrites (atomically) as things change."""

    def __init__(self, d: Path, k1=0.0):
        self.path = d / "world.json"
        self.state = {
            "start_t": 1_000_000.0, "period_s": 0.125,
            "camera": {"px_per_mm": PX_PER_MM, "origin_mm": [ORIGIN_MM[0], ORIGIN_MM[1]], "size_mm": [400, 270],
                       "k1": k1},
            "room": ROOM,
            "projector": {"mm_per_ph": MM_PER_PH, "light": PROJECTOR, "shows": []},
            "cards": [], "ruler": None,
        }
        self.write()

    def write(self):
        tmp = self.path.with_suffix(".tmp")
        tmp.write_text(json.dumps(self.state))
        os.replace(tmp, self.path)

    def set(self, **kw):
        for k, v in kw.items():
            if k == "shows":
                self.state["projector"]["shows"] = v
            else:
                self.state[k] = v
        self.write()


def write_markers(d: Path) -> Path:
    p = d / "markers.json"
    p.write_text(json.dumps(TABLE_MARKERS))
    return p


class Service:
    """The real service as a process, on a free port, with a JSON-lines connection to it."""

    def __init__(self, d: Path, source: str, lineup: Path, env=None):
        reader = write_fake_reader(d, [{"text": "500", "after_s": 2.0}])
        args = [sys.executable, "-m", "snapscript_vision", "--source", source, "--port", "0",
                "--reader", f"fake:{reader}", "--markers", str(write_markers(d)), "--lineup", str(lineup)]
        self.proc = subprocess.Popen(args, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
                                     env={**os.environ, **(env or {})})
        line = self.proc.stdout.readline()
        m = re.search(r"listening on 127\.0\.0\.1:(\d+)", line)
        if not m:
            self.proc.kill()
            raise AssertionError(f"service didn't start: {line!r} {self.proc.stderr.read()}")
        self.sock = socket.create_connection(("127.0.0.1", int(m.group(1))), timeout=60)
        self.buf, self.got = b"", []

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def close(self):
        self.sock.close()
        self.proc.kill()
        self.proc.wait()

    def _next(self, deadline):
        while b"\n" not in self.buf:
            self.sock.settimeout(max(deadline - time.monotonic(), 0.01))
            try:
                chunk = self.sock.recv(65536)
            except TimeoutError:
                return None
            if not chunk:
                raise AssertionError(f"service closed the connection: {self.proc.stderr.read()}")
            self.buf += chunk
        line, self.buf = self.buf.split(b"\n", 1)
        msg = json.loads(line)
        self.got.append(msg)
        return msg

    def wait_for(self, ok, timeout=60):
        """The next message `ok` accepts."""
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            msg = self._next(deadline)
            if msg is not None and ok(msg):
                return msg
        raise AssertionError(f"nothing came in {timeout} s; last messages: {self.got[-3:]}")

    def calibrate(self, step, **kw):
        """Send a calibration step as the table app does, and return its result."""
        self.sock.sendall((json.dumps({"type": "calibrate", "step": step, **kw}) + "\n").encode())
        return self.wait_for(lambda m: m["type"] == "calibration" and m["step"] == step)

    def state_with(self, ok, timeout=60):
        """The next table state `ok` accepts."""
        return self.wait_for(lambda m: m["type"] == "state" and ok(m), timeout)


def card_at(state, marker):
    return next((c for c in state["cards"] if c["marker"] == marker), None)
