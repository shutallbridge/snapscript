# Demo bases: print plates (throwaway, never merged)

For [Print the demo bases](https://github.com/shutallbridge/snapscript/issues/121). One folder per plate, one plate per print session on an A1 mini (180 × 180 mm):

- `stage-1/`: programs 1 and 2; `stage-2/`: program 3; `stage-3/`: program 4.
- Each plate folder has `plate.3mf` (every part placed, 5 mm apart and centred), the STLs it uses, and `contents.md`.
- Plates hold one part type (frames, cores, front faces or back faces) at any lengths. Cores need supports, added in Bambu Studio.

Made from the frozen 0.1.0 arrangement (commit 8159e4c) with `main`'s `magnets bases` (4631e28), default tolerances:

```
magnets bases 0.1.0.yaml --classes call,get,literal,operator,color,simple_head,block_head,global,dedent,define,else --max-length 5
```

`_tools/`: `programs.txt` (the demo programs, fixed and responsive), `stages.py` (writes `stages.json`, each stage's frames) and `plates.py` (packs and writes the plates, and `plates.json`, the list of every plate).
