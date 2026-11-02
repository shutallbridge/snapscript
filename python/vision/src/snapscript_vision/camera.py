"""The rig's camera through `picamera2` (from apt on the Pi, seen through the venv's system packages).

    --source camera                       full 16 MP stills, focused once at start
    --source camera:lens=3.75             focus fixed at 3.75 dioptres
    --source camera:lens=3.75,size=4624x3472

As the prototypes ran it (#105, #115, #132): YUV420 stills, two buffers, and the grey plane is the frame. Each
frame's time is when it was exposed (wall-clock s, from the sensor's time stamp).

Exposure is auto (`expose()`) or fixed (`expose(ms, gain)`). After a change, frames are dropped until the camera
has taken it up: for fixed, until a frame's metadata shows the new exposure; for auto, for `AUTO_SETTLE_S`.
"""

import time

import numpy as np

SIZE = (4624, 3472)
AUTO_SETTLE_S = 1.5     # auto exposure finds the room's light in about this long (#132's step 1)
FIXED_SETTLE_FRAMES = 8  # a fixed exposure shows within a few frames; past this, go on anyway
FIXED_MATCH = 0.05      # a frame has taken a fixed exposure when its ExposureTime is within 5% of it


class CameraSource:
    def __init__(self, lens=None, size=SIZE):
        from libcamera import controls
        from picamera2 import Picamera2

        self.size = tuple(size)
        self.cam = Picamera2()
        self.cam.configure(self.cam.create_still_configuration(main={"size": self.size, "format": "YUV420"},
                                                               buffer_count=2))
        self.cam.start()
        if lens is None:  # focus once on the table, then hold it
            self.cam.set_controls({"AfMode": controls.AfModeEnum.Auto})
            self.cam.autofocus_cycle()
            lens = self.cam.capture_metadata()["LensPosition"]
        self.cam.set_controls({"AfMode": controls.AfModeEnum.Manual, "LensPosition": float(lens)})
        self.lens = float(lens)
        self.fixed = None       # (ms, gain), or None for auto
        self.exposure = None    # what the last frame was taken at
        self._settle = None     # what the next frames wait for after a change

    @classmethod
    def from_spec(cls, arg: str):
        opts = dict(kv.split("=", 1) for kv in arg.split(",") if kv)
        unknown = sorted(set(opts) - {"lens", "size"})
        if unknown:
            raise ValueError(f"unknown camera options: {', '.join(unknown)} (lens=DIOPTRES, size=WxH)")
        lens = float(opts["lens"]) if "lens" in opts else None
        size = tuple(int(v) for v in opts["size"].split("x")) if "size" in opts else SIZE
        return cls(lens, size)

    def expose(self, ms=None, gain=1.0):
        """Fixed exposure, or auto with no arguments."""
        if ms is None:
            self.fixed = None
            self.cam.set_controls({"AeEnable": True})
            self._settle = ("auto", time.monotonic() + AUTO_SETTLE_S)
        else:
            self.fixed = (float(ms), float(gain))
            self.cam.set_controls({"AeEnable": False, "ExposureTime": int(round(ms * 1000)),
                                   "AnalogueGain": float(gain)})
            self._settle = ("fixed", FIXED_SETTLE_FRAMES)

    def _grab(self):
        req = self.cam.capture_request()
        try:
            grey = np.ascontiguousarray(req.make_array("main")[: self.size[1], : self.size[0]])
            meta = req.get_metadata()
        finally:
            req.release()
        # SensorTimestamp: ns on CLOCK_MONOTONIC at the start of the frame's readout
        age = (time.clock_gettime_ns(time.CLOCK_MONOTONIC) - meta["SensorTimestamp"]) / 1e9
        return time.time() - age, grey, meta

    def _settled(self, meta):
        if self._settle is None:
            return True
        kind, left = self._settle
        if kind == "auto":
            done = time.monotonic() >= left
        else:
            want = self.fixed[0] * 1000
            done = abs(meta.get("ExposureTime", 0) - want) <= FIXED_MATCH * want or left <= 1
            self._settle = None if done else ("fixed", left - 1)
        if done:
            self._settle = None
        return done

    def __iter__(self):
        while True:
            t, grey, meta = self._grab()
            if not self._settled(meta):
                continue
            self.exposure = (round(meta.get("ExposureTime", 0) / 1000, 3), round(meta.get("AnalogueGain", 1.0), 3))
            yield t, grey
