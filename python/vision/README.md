# snapscript-vision

The vision service (module `snapscript_vision`): a process that turns camera frames into steady table states and sends them over local TCP as JSON lines.

```sh
uv run python -m snapscript_vision --source drawn:scene.json --lineup lineup.json --markers markers.json [--reader openrouter|fake:reader.json] [--settings settings.json] [--port 8115]
```

- `--source`: where frames come from. `drawn:SCENE.json` draws card sheets with their markers onto a table picture (for tests off the Pi); `recording:PATH` replays a rig recording (`PATH.json` and `PATH.y`, the card tracking prototype's format). See `sources.py`.
- `--lineup`: the camera-to-projector line-up and mm per projector height. See `geometry.Lineup`.
- `--markers`: which kind of card or page each marker is on, in the table reader's loaded shape (`languageMarkers`, `lockfile`) plus the ruler page's markers. See `markers.py`.
- `--reader`: who reads handwriting. `openrouter` (the default) is the cloud read, Gemma 4 31B through OpenRouter; it takes its API key from `OPENROUTER_API_KEY` in the environment and won't start without it. Never put the key in a file in the repo. `fake:READER.json` answers from a file, for tests. See `readers.py`.
- `--settings`: JSON with any of the named thresholds in `settings.py`.

The service prints `listening on 127.0.0.1:PORT`, starts on its frames when the first client connects, and exits when they run out. The message shape is in `service.py`.

Tests start the real process and read its JSON lines:

```sh
uv run pytest
```
