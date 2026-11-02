# snapscript-vision

The vision service (module `snapscript_vision`): a process that turns camera frames into steady table states and sends them over local TCP as JSON lines.

```sh
uv run python -m snapscript_vision --source drawn:scene.json --lineup lineup.json --markers markers.json [--settings settings.json] [--port 8115]
```

- `--source`: where frames come from. `drawn:SCENE.json` draws card sheets with their markers onto a table picture (for tests off the Pi); `recording:PATH` replays a rig recording (`PATH.json` and `PATH.y`, the card tracking prototype's format); `world:WORLD.json` is a drawn table that can change while the service runs, and takes an exposure (for calibration's tests); `camera` is the rig's camera through `picamera2`. See `sources.py`.
- `--lineup`: the camera-to-projector line-up, mm per projector height and the camera's fixed exposure. The service owns this file: calibration's commands make it. See `geometry.Lineup` and `calibration.py`.
- `--markers`: which kind of card or page each marker is on, in the table reader's loaded shape (`languageMarkers`, `lockfile`) plus the table's own markers (the ruler page's and calibration's). See `markers.py`.
- `--settings`: JSON with any of the named thresholds in `settings.py`.

The service prints `listening on 127.0.0.1:PORT`, starts on its frames when the first client connects, and exits when they run out. The message shape is in `service.py`. Calibration's commands and results go over the same socket (`calibration.py`). On the rig, see `docs/rig-setup.md`.

Tests start the real process and read its JSON lines:

```sh
uv run pytest
```
