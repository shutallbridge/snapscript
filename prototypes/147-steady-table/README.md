# Prototype: a steady table

Throwaway, for [Prototype a steady table](https://github.com/shutallbridge/snapscript/issues/147). It's the [walking skeleton](https://github.com/shutallbridge/snapscript/issues/115) (`prototype/115-walking-skeleton`), with the three rules being tried behind flags. The defaults keep the skeleton's rules, so a run with no flags is the "before".

- **Joins** (`app/snap.js`, env `JOIN` as JSON): `mode` `corner` (#111's end-to-corner distance) or `axis` (along and across judged apart: `along` in `[-overlap, make]`, `|across| <= across`). A join already made is kept until it passes `brk` / `acrossBrk`. `how` `own` or `mean` picks the line's angle (the first card's own, or both cards' averaged). Example: `JOIN='{"mode":"axis","make":10,"brk":15}'`.
- **Re-reads** (`vision.py`): `--change-hold N` (a rewrite must hold N calm cycles), `--light-tol 0.15` (don't judge a rewrite while the paper is lit differently from its read), `--keep-text` (a card read again keeps its text; the app needs `KEEP_TEXT=1` to treat it as read).
- **Lifted** (`vision.py`): `--near outline --near-gap-mm 15` (neighbours by card outline), `--miss-ok 1` (a neighbour may miss one frame), `--alone-s S` (a card with no neighbour).
- `gaps.py`: per frame, each end-to-end pair's gap along and across, with the first card's angle and with both averaged, and each card's angle noise. Run it with the cards butted at a true zero gap.
- `app/replay.js`: recorded table states through the reader and checker under any `JOIN` / `KEEP_TEXT`, counting what the table view would change.

## On the Pi (`~/snap-147`)

```sh
rsync -a --exclude runs ./ rig:snap-147/
ssh rig 'bash ~/snap-147/start-vision.sh --lens 3.75 --exposure-ms 40 --near outline --miss-ok 1 --change-hold 3 --keep-text'
ssh rig 'SKETCH=b KEEP_TEXT=1 JOIN='"'"'{"mode":"axis","make":10,"brk":15}'"'"' bash ~/snap-147/start-app.sh'
ssh rig 'python3 ~/snap-147/gaps.py --last 60'
ssh rig 'cd ~/snap-147/app && GAPS=1 node replay.js ~/snap-115/runs/vision-*.jsonl'
```

The line-up is the card feedback prototype's `~/snap-129/calib.json`.
