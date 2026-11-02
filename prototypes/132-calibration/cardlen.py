"""PROTOTYPE (#147), throwaway: a card's length in U, as snap.js works it out (cards.json "len" first)."""
import json
from pathlib import Path

LEN = {int(k): v for k, v in json.loads((Path(__file__).with_name("cards.json")).read_text()).get("len", {}).items()}


def length_u(note):
    """snap.js lengthU: a card's length from the card sheet rule."""
    import math, re
    if note == "[dedent]":
        return 2
    if note.startswith("[color("):
        return 4
    if note.startswith("[define{"):
        return 5
    m = re.match(r"^\[(\w+)\{[^}]*\}(\w*)\]$", note)
    if m:
        return max(2, math.ceil((21.5 + sum(len(w) * 5.5 + 3 for w in m.groups() if w) + 60 + 3) / 30 - 1e-9))
    label = re.sub(r"\)?\]$", "", re.sub(r"^\[\w+\(?", "", note)).split(".")[-1] or note[1:-1]
    return max(2, math.ceil((21.5 + len(label) * 5.5 + 3) / 30 - 1e-9))
