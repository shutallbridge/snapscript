# PROTOTYPE (#46): smallest readable marker

Throwaway. Answers one question: the smallest `tagStandard41h12` marker that reads reliably in the 16 MP mode, across the table.

- `make_sheets.py`: on the Mac, `uv run make_sheets.py [--paper letter]` → `out/marker-sheets-<paper>.pdf`. Five pages (centre, near, far-left, far-centre, far-right), sizes 8–18 mm, 6 copies each; `id = page * 100 + size_index * 6 + copy`. Print at 100% and check the 100 mm and 50 mm rulers.
- `measure.py`: on the Pi, in `~/marker46` (venv made with `--system-site-packages`, plus `pupil-apriltags`): `venv/bin/python measure.py --af --label <name>`. Locks focus and exposure, takes 30 frames, prints a table per sheet in view, saves `runs/<label>-<time>.json` and `.jpg`.
- `pi.sh`: run commands on the Pi, or copy files to and from it, over password SSH. `PI_PASS=… ./pi.sh 'cmd'`, `./pi.sh put a b`, `./pi.sh get a b`.
- `results/`: the first desk run (near sheet only), 2026-10-23; the rig run (`rig-*`, 112 cm, four sheets), 2026-10-25.

Pass rule: all 6 copies of a size read in ≥29 of 30 frames, with no IDs read that aren't printed.
