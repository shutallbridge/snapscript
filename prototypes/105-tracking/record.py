"""PROTOTYPE (#105), throwaway: record rig footage for card tracking. Runs on the Pi.

Grabs full 16 MP frames as fast as the camera gives them (about 7.6 fps) with the rig's locked settings
(8.33 ms, gain 1, LensPosition 3.75, from #46) and appends each frame's grey plane to one raw file in RAM,
with a timestamp per frame. Replay reads them back with clip.py.

    ~/marker46/venv/bin/python record.py NAME SECONDS
"""

import json
import sys
import time
from pathlib import Path

from libcamera import controls
from picamera2 import Picamera2

W, H = 4624, 3472
OUT = Path("/dev/shm/clips")


def main():
    name, secs = sys.argv[1], float(sys.argv[2])
    OUT.mkdir(exist_ok=True)
    cam = Picamera2()
    cfg = cam.create_video_configuration(main={"size": (W, H), "format": "YUV420"}, raw={"size": (W, H)},
                                         buffer_count=4, controls={"FrameRate": 7.6})
    cam.configure(cfg)
    cam.set_controls({"AeEnable": False, "ExposureTime": 8333, "AnalogueGain": 1.0,
                      "AfMode": controls.AfModeEnum.Manual, "LensPosition": 3.75})
    cam.start()
    time.sleep(1.5)
    times = []
    with open(OUT / f"{name}.y", "wb") as f:
        t_end = time.time() + secs
        print(f"RECORDING {name} for {secs:.0f} s", flush=True)
        while time.time() < t_end:
            req = cam.capture_request()
            try:
                y = req.make_array("main")[:H, :W]
                ts = req.get_metadata()["SensorTimestamp"] / 1e9
            finally:
                req.release()
            f.write(y.tobytes())
            times.append(ts)
    cam.stop()
    (OUT / f"{name}.json").write_text(json.dumps({"w": W, "h": H, "t": times}))
    dt = times[-1] - times[0]
    print(f"done: {len(times)} frames in {dt:.1f} s = {(len(times) - 1) / dt:.2f} fps", flush=True)


if __name__ == "__main__":
    main()
