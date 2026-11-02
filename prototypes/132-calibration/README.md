# Prototype: calibration from the table app's settings menu

Throwaway, for [Prototype calibration from the table app's settings menu](https://github.com/shutallbridge/snapscript/issues/132). It's the [steady table](https://github.com/shutallbridge/snapscript/issues/147) prototype (`prototype/147-steady-table`), with calibration added.

- **The vision service owns the line-up** (`lineup.py`, saved as `calib.json` here). The table app runs the steps from its settings menu and draws what each one needs. Commands go to `vision.py` over the table-state socket, and its answers come back on it.
- **Settings menu** (`,`, arrows, Enter): Calibrate…, check view, corner tags, knocked stand (warn / fix / off), card height (own line-up / table only), real-world size (typed depth / ruler page).
- **Calibrate**, in three steps:
  1. **Bare table**: 12 projected tags, as before (tag centres plus one lens term).
  2. **Calibration cards and ruler page**: lay the six calibration cards on 4U bases in the six boxes, and the ruler page flat in the big box. The exposure is set from the cards' paper, and the size from the ruler page's two markers (257 mm apart). Then a tag is projected onto each card's face, two per card, and the **card-height line-up** is fitted from them. The answer says how far off card tops are with the table's line-up only, with "one plane plus a height" (the table's line-up scaled, turned and shifted), and with a separate homography for card height (two planes). Each fit is also given leaving each card out.
  3. **Check**: cyan lines on every card's edge, a pink outline of the ruler page, and past each line's last card a guide slot from that card's own angle (yellow) and from the strip's (pink). Enter saves, Escape cancels.
- **Corner tags**: four small tags stay projected in the work area's corners. Their drift since saving is shown in the menu. With "warn", the status bar asks for a recalibration past 3 mm; with "fix", the drift is folded into every position.

`print.html` (and `results/calibration-print.pdf`): six calibration cards (markers 1100–1105, blank faces) and the ruler page (markers 2080, 2081). Print at 100% with no margins, and check the 50 mm bars.

`rig.json` holds what both sides share: the projected tags' IDs and places, the boxes, and the typed depth.

## On the Pi (`~/snap-132`)

```sh
rsync -a --exclude runs --exclude .tags ./ rig:snap-132/
ssh rig 'bash ~/snap-132/start-vision.sh --lens 3.75 --miss-ok 1 --change-hold 3 --light-tol 0.15 --keep-text --face-check 0.93 --empty-ratio 0.4 --gone-empty 0.5 --hold 30'
ssh rig 'KEEP_TEXT=1 SKETCH=b bash ~/snap-132/start-app.sh'
ssh rig 'echo ", Enter" > ~/snap-132/runs/key'   # press keys in the table app from SSH
```

`vision.py` flags added: `--calib`, `--calib-fallback` (the card feedback prototype's `calib.json` until the first save), `--card-fit homography|plane+height`, `--drift off|warn|fix`, `--planes two|table`. The exposure comes from the saved line-up unless `--exposure-ms` is given. Each step's camera frame is saved as `runs/calib-<step>-*.jpg`, and its answer goes to `/tmp/vision132.log` and the run's `vision-*.jsonl`.
