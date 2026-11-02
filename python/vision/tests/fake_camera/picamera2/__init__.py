"""A stand-in for picamera2, off the Pi, so the service's camera source can be run in tests.

It takes its pictures of a drawn world (FAKE_CAMERA_WORLD, a `world:` file, and FAKE_CAMERA_MARKERS), honours auto
and fixed exposure as the real camera's controls set them, and writes every `set_controls` call as a JSON line to
FAKE_CAMERA_LOG, so a test can see what the camera was told.
"""

import json
import os
import time

import numpy as np
from snapscript_vision.markers import parse, read
from snapscript_vision.world import render


class _Request:
    def __init__(self, frame, meta):
        self.frame, self.meta = frame, meta

    def make_array(self, name):
        h, w = self.frame.shape
        yuv = np.full((h * 3 // 2, w), 128, np.uint8)  # YUV420: the grey plane, then the colour planes
        yuv[:h] = self.frame
        return yuv

    def get_metadata(self):
        return dict(self.meta)

    def release(self):
        pass


class Picamera2:
    def __init__(self):
        self.world = os.environ["FAKE_CAMERA_WORLD"]
        self.markers = parse(read(os.environ["FAKE_CAMERA_MARKERS"]))
        self.log = os.environ["FAKE_CAMERA_LOG"]
        self.ctl = {"AeEnable": True, "LensPosition": 1.0}
        self.started = False

    def create_still_configuration(self, main=None, buffer_count=1, **kw):
        return {"main": main, "buffer_count": buffer_count}

    def configure(self, config):
        self._write({"configure": config})

    def start(self):
        self.started = True

    def set_controls(self, ctl):
        ctl = {k: (int(v) if hasattr(v, "value") else v) for k, v in ctl.items()}
        self.ctl.update(ctl)
        self._write({"set_controls": ctl})

    def autofocus_cycle(self):
        self.ctl["LensPosition"] = 3.5
        return True

    def capture_metadata(self):
        return {"LensPosition": self.ctl["LensPosition"]}

    def capture_request(self):
        assert self.started, "capture before start"
        world = json.loads(open(self.world).read())
        fixed = None if self.ctl.get("AeEnable", True) else (self.ctl["ExposureTime"] / 1000,
                                                              self.ctl.get("AnalogueGain", 1.0))
        frame, (ms, gain) = render(world, self.markers, fixed)
        time.sleep(0.01)
        return _Request(frame, {"ExposureTime": int(round(ms * 1000)), "AnalogueGain": gain,
                                "SensorTimestamp": time.clock_gettime_ns(time.CLOCK_MONOTONIC),
                                "LensPosition": self.ctl["LensPosition"]})

    def _write(self, rec):
        with open(self.log, "a") as f:
            f.write(json.dumps(rec) + "\n")
