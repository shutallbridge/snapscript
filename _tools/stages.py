"""Split the demo set's bases into print stages.

A printed card's sheet can't be swapped, so each printed label is its own
card; handwritten cards of one class and length are interchangeable. The kit
builds one program at a time, so a stage needs, for each card, the most any
of its programs (fixed or responsive) needs, less what earlier stages printed.

Prints `stages.json`: for each stage, frame file -> count.
"""

import json
import re
import sys
from collections import Counter
from pathlib import Path

HERE = Path(__file__).parent

# Stages in print order: the programs each adds.
STAGES = {1: ["1", "2"], 2: ["3"], 3: ["4"]}

# Frame file stem for each class and length (from `magnets bases`).
FRAME = {
    ("simple_head", 4): "00-simple_head-4u",
    ("get", 2): "01-get-2u",
    ("get", 3): "01-get-3u",
    ("get", 4): "01-get-4u",
    ("define", 3): "02-define-3u",
    ("define", 4): "02-define-4u",
    ("call", 2): "03-call-2u",
    ("call", 3): "03-call-3u",
    ("call", 4): "03-call-4u",
    ("literal", 4): "08-literal-4u",
    ("color", 4): "10-color-4u",
    ("block_head", 2): "12-block_head-2u",
    ("block_head", 4): "12-block_head-4u",
    ("dedent", 2): "13-dedent-2u",
    ("operator", 2): "15-operator-2u",
    ("global", 5): "22-global-5u",
    ("else", 2): "24-else-2u",
}

# A flip pair's two sides are one card.
OPERATOR_CARD = {"*": "*/", "/": "*/", "+": "+-", "-": "+-", "<": "<>", ">": "<>"}


def printed_length(label: str) -> int:
    """The printed length rule from #101: 6 letters at 2U, 11 at 3U, 17 at 4U."""
    for n, most in [(2, 6), (3, 11), (4, 17)]:
        if len(label) <= most:
            return n
    raise ValueError(label)


def card(text: str) -> tuple[str, int, str]:
    """A card text -> (class, length, label); one label is one physical card."""
    if m := re.fullmatch(r"\[(get|call)\((?:p5\.)?(\w+)\)\]", text):
        cls, name = m.groups()
        return cls, printed_length(name), name
    if m := re.fullmatch(r"\[define\((\w+)\)\]", text):
        return "define", printed_length(f"define {m[1]}"), m[1]
    if m := re.fullmatch(r"\[color\((\w+)\)\]", text):
        return "color", 4, m[1]
    if m := re.fullmatch(r"\[([*/+\-<>])\]", text):
        return "operator", 2, OPERATOR_CARD[m[1]]
    handwritten = {
        r"\[get\{\w+\}\]": ("get", 4),
        r"\[(num|str)\{[^}]*\}\]": ("literal", 4),
        r"\[set\{\w+\}to\]": ("simple_head", 4),
        r"\[for\{\w+\}in\]": ("block_head", 4),
        r"\[global\{\w+\}\]": ("global", 5),
    }
    for pattern, (cls, n) in handwritten.items():
        if re.fullmatch(pattern, text):
            return cls, n, "handwritten"
    fixed = {"[repeat]": ("block_head", 2), "[if]": ("block_head", 2), "[dedent]": ("dedent", 2), "[else]": ("else", 2)}
    if text in fixed:
        return (*fixed[text], text)
    raise ValueError(f"unknown card {text}")


def programs() -> dict[str, Counter]:
    out: dict[str, Counter] = {}
    name = None
    for line in (HERE / "programs.txt").read_text().splitlines():
        if line.startswith("#") or not line.strip():
            continue
        if line.startswith("== "):
            name = line[3:]
            out[name] = Counter()
            continue
        for text in re.findall(r"\[[^\]]*\]", line):
            out[name][card(text)] += 1
    return out


def main() -> None:
    progs = programs()
    printed: Counter = Counter()
    stages = {}
    for stage, numbers in STAGES.items():
        need: Counter = Counter()
        for name, cards in progs.items():
            if name.split("-")[0] in numbers:
                need |= cards  # the most of each card any one program needs
        add = (need | printed) - printed
        printed += add
        frames: Counter = Counter()
        for (cls, n, _), count in add.items():
            frames[FRAME[cls, n]] += count
        stages[stage] = dict(sorted(frames.items()))
    json.dump(stages, sys.stdout, indent=2)
    print()


if __name__ == "__main__":
    main()
