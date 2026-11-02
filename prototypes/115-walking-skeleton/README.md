# Prototype: walking skeleton on the rig

Throwaway, for [Walking skeleton on the rig](https://github.com/shutallbridge/snapscript/issues/115). The whole chain on the Pi with the card feedback prototype's paper cards (marker IDs 1000–1022, demo 1's first block): camera → vision service → table state → table reader → checker → runtime → p5 in Electron, projected, with error lighting.

- `vision.py`: the vision service (cores 0–1). The card tracking prototype's rules, live (`track.py` is copied from `prototype/105-tracking`). Sends a table state over TCP (port 8115, one JSON line) only on change. Handwriting crops are real; the cloud read is mocked (`--read-s`). Flags: `--exposure-ms` (fixed exposure, gain 1), `--near-mm`, `--flush`. `touch runs/snap` saves an annotated frame.
- `app/`: the table app (Electron, cores 2–3). `snap.js` is a stand-in for the table reader, checker and runtime, just enough for demo 1. `main.js` runs them in process and times every state; the sketch runs in its own `WebContentsView`. `SKETCH=b` swaps a restarted sketch in only after its first frame; `OUTLINE=face|outside|0` picks the error look; `STRESS=N` adds N animated confetti.
- `sysmon.py`, `misses.py`, `rereads.py`, `trips.py`: CPU/GPU/temperature, marker misses, false re-reads, and the timing summary, from `runs/`.

## On the Pi (`~/snap-115`, `~/electron` holds Electron 45 arm64)

```sh
rsync -a ./ rig:snap-115/
ssh rig 'bash ~/snap-115/start-vision.sh --lens 3.75 --exposure-ms 40 --near-mm 130'
ssh rig 'SKETCH=b bash ~/snap-115/start-app.sh'
ssh rig 'python3 ~/snap-115/trips.py'
```

The line-up is the card feedback prototype's `~/snap-129/calib.json`.
