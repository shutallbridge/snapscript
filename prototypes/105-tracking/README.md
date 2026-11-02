# Prototype: card tracking on recorded rig footage

Throwaway, for [Prototype the vision service's card tracking on recorded rig footage](https://github.com/shutallbridge/snapscript/issues/105). Built on the card feedback prototype (`prototype/129-card-feedback`), whose paper cards (marker IDs 1000–1029, `cards.json`) and the 3D `[call(p5.circle)]` (ID 0) were filmed.

- `record.py`: records full 16 MP frames (7.6 fps, 8.33 ms, gain 1, `LensPosition` 3.75) into RAM on the Pi.
- `detect_all.py`: runs the marker search on every recorded frame, at `quad_decimate` 2 and 1.
- `timeline.py`: per-marker seen/unseen timeline of a clip.
- `crops.py`: cuts a card's face out of frames from its marker pose and the sheet layout, to check the whiteboard box.
- `track.py`: replays a clip through the tracker and prints every table state it would send. All rules are flags.
- `layout.html` / `layout.pdf`: what was laid out on the table.

## Clips (Pi, `~/snap-105/clips` and `/dev/shm/clips`, not committed: about 16 MB a frame)

| clip | what happens |
|---|---|
| `c1-still` | demo program 1's first block plus the 3D circle, hands off (8 s) |
| `c2-hands` | flat hand over the `[repeat]` body ~3 s, two reaches to the far edge, hand resting over the top lines ~10 s, pointing (60 s) |
| `c3a-place` | paper `[circle]` and two blank `[num{…}]` laid quickly, 3D circle slid ~9 cm, `[noStroke]` lifted ~5 s and put back |
| `c3b-write` | `40` written on a blank `[num{…}]` lying on the table, then `0` added |
| `c3c-remove` | the paper `[circle]` and its two `num` cards taken away |

## Running

```sh
scp record.py detect_all.py crops.py track.py geometry.py rig:snap-105/
ssh rig 'cd ~/snap-105 && ~/marker46/venv/bin/python record.py NAME SECONDS'
ssh rig 'cd ~/snap-105 && ~/marker46/venv/bin/python detect_all.py /dev/shm/clips/NAME'
ssh rig 'cd ~/snap-105 && ~/marker46/venv/bin/python track.py /dev/shm/clips/NAME [--diag MARKER_ID]'
```

`track.py` reads `~/snap-129/cards.json` for each marker's card notation.
