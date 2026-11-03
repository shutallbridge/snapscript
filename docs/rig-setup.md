# Rig setup

One-time steps to get the rig's Raspberry Pi ready to run the vision service (`snapscript-vision`). Reach the Pi with `ssh rig` (see `docs/agents/rig.md`).

## What the Pi has

Checked on 2026-11-03:

- Raspberry Pi 5 Model B, 4 cores
- Debian 13 (trixie), with the system Python at `/usr/bin/python3.13` (3.13.5)
- The camera: OmniVision OV64A40 (64 MP sensor). The service takes 4624 × 3472 stills, about 7.7 fps.
- From apt: `python3-picamera2` (0.3.38), `python3-libcamera`, `python3-simplejpeg` and `python3-numpy` (2.2.4)
- No `uv` yet

## The camera packages come from apt

libcamera's Python bindings are built for the Pi's own libcamera and come only from apt. `picamera2` is taken from apt too, so the two match. They are already installed. On a fresh Pi OS:

```sh
sudo apt install -y python3-picamera2
```

## A uv venv that also sees system packages

The service runs from a uv venv on the system Python 3.13. The venv also sees system packages, so `picamera2` from apt can be imported, while uv installs everything else from the lockfile.

1. Install uv, at the repo's version (`mise.toml`):

   ```sh
   curl -LsSf https://astral.sh/uv/0.13.6/install.sh | sh
   ```

2. Copy the Python workspace from the Mac (the venv is made on the Pi):

   ```sh
   rsync -a --delete --exclude .venv --exclude __pycache__ python/ rig:snapscript/python/
   ```

3. Make the venv on the system Python, with system packages, and sync only the vision service into it:

   ```sh
   ssh rig 'cd ~/snapscript/python && ~/.local/bin/uv venv --python /usr/bin/python3.13 --system-site-packages \
     && ~/.local/bin/uv sync --package snapscript-vision --no-dev --python /usr/bin/python3.13'
   ```

   `--python` matters on every `uv sync`. Without it, uv follows the workspace's `.python-version` (3.12, for the Mac), makes a new venv on its own Python, and drops the system packages.

4. Check that the venv sees both sides:

   ```sh
   ssh rig '~/snapscript/python/.venv/bin/python -c "import picamera2, pupil_apriltags, numpy; print(numpy.__version__, numpy.__file__)"'
   ```

   uv installs numpy from the lockfile into the venv, so the venv's numpy is newer than apt's. picamera2 and simplejpeg from apt then run on it. Both are built for numpy 2, so that should work. Step 4 is where to see if it doesn't.

After changing code on the Mac, repeat step 2 and the `uv sync` of step 3.

## Running it pinned to cores 0–1

The service is meant to run on cores 0 and 1, leaving 2 and 3 for the sketch, so the sketch keeps 60 fps. Its marker search uses 2 threads. In batch 2 the table app spawns it this way. By hand:

```sh
ssh rig 'mkdir -p ~/.local/state/snapscript && cd ~/snapscript/python && \
  taskset -c 0,1 .venv/bin/python -u -m snapscript_vision --source camera \
    --lineup ~/.local/state/snapscript/lineup.json --markers MARKERS.json --port 8115'
```

- Handwriting is read in the cloud by default (`--reader openrouter`), which needs `OPENROUTER_API_KEY` in the service's environment. Keep the key out of the repo. `--reader fake:FAKE.json` runs without it.
- `--source camera` focuses once at start. `camera:lens=3.75` holds a known focus (in dioptres) instead.
- `--markers MARKERS.json` gives the marker data by hand. Without it the service waits for the table app's `markers` message (see `service.py`) before it reads any frames.
- `--lineup` is the service's own file. Calibration writes it there, and it stays across restarts. Until the first calibration is saved, positions are in camera pixels.
- Run `.venv/bin/python` directly, not `uv run`. `uv run` would sync first, and without `--python` that sync replaces the venv.
- To check the pinning while it runs: `ssh rig 'taskset -cp $(pgrep -f snapscript_vision)'` should say `0,1`.

## The table app

`pnpm table` starts the table app (`apps/table`), which starts the vision service itself, pinned as above, and opens `projects/confetti/`. It needs the whole repo on the Pi, at `~/snapscript` (where the venv above is), and Node and pnpm. The Pi had neither on 2026-11-03.

1. Install Node and pnpm at the repo's versions (`mise.toml`), with mise:

   ```sh
   ssh rig 'curl https://mise.run | sh && ~/.local/bin/mise use -g node@24.18.1 pnpm@11.7.0'
   ```

2. Copy the repo from the Mac (the venv, `node_modules` and builds are made on the Pi):

   ```sh
   rsync -a --delete --exclude .git --exclude node_modules --exclude .venv --exclude __pycache__ \
     --exclude dist --exclude out --exclude libraries/p5/p5.js ./ rig:snapscript/
   ```

   `--delete` would also remove the venv, so `--exclude .venv` matters. Then make the venv as above if it isn't there yet.

3. Install the packages: `ssh rig 'cd ~/snapscript && ~/.local/bin/mise exec -- pnpm install'`. Electron downloads its arm64 build the first time it starts.

4. Start it, on the Pi's desktop or over SSH (it draws on the desktop session's Wayland display either way):

   ```sh
   ssh rig 'cd ~/snapscript && OPENROUTER_API_KEY=… ~/.local/bin/mise exec -- pnpm table'
   ```

   It builds what changed, then runs the app pinned to cores 2–3. `Ctrl+Q` on the table's keyboard quits it, and the service with it. There's no autostart.

The app takes these from its environment, all optional: `SNAPSCRIPT_PROJECT` (the project folder), `SNAPSCRIPT_VISION=off` (don't start the service; connect to one already running), `SNAPSCRIPT_VISION_PORT` (8115), `SNAPSCRIPT_VISION_SOURCE` (`camera`), `SNAPSCRIPT_VISION_READER` (the service's default, the cloud) and `SNAPSCRIPT_LINEUP` (`~/.local/state/snapscript/lineup.json`).

To check the pinning while it runs: `ssh rig 'taskset -cp $(pgrep -f -o electron)'` should say `2,3`.

Off the rig, `pnpm --filter @snapscript/table smoke` starts the built app against a stand-in for the service on the machine's own display: it lays a program, changes it (a restart in the same process), freezes it (the sketch process is killed and replaced) and lays another. Screenshots of each view go to `apps/table/out/smoke/`.
