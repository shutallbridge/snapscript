"""PROTOTYPE, throwaway (#10): magnets needed to build the four legal
bundled programs twice, for each arrangement given, plus forbid results.

    uv run python prototype_magnet_count.py out/proto/<run>.yaml ...
"""

import re
import sys
from importlib.resources import files
from pathlib import Path

import yaml

from magnets import data, programs

rules = data.load_rules()
classes = data.load_classes(grammar=rules)
bundled = yaml.safe_load(files("magnets").joinpath("data/programs.yaml").read_text())
names = ["first_sketch", "nested_blocks", "parameters", "receivers_and_groups"]
sides = [c.side.split(".")[0] for n in names for c in programs.all_cards(programs.parse(bundled[n]["text"], classes))]

print("| run | magnets (4 programs x2) | per card | forbid snap / mixed / nothing / repel (contacts) | avoidable should / nice leaks | status |")
print("|---|---|---|---|---|---|")
for path in map(Path, sys.argv[1:]):
    arr = yaml.safe_load(path.read_text())["classes"]
    per = {c: sum(l != "-" for e in edges.values() for p in e for l in p["layers"].split("/")) for c, edges in arr.items()}
    magnets = 2 * sum(per.get(s, 0) for s in sides)
    summary = (path.with_suffix("") / "summary.txt").read_text()
    contacts = summary.split("Contacts by kind")[1]
    forbid = " / ".join(re.search(r"forbid\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)", contacts).groups())
    should = re.search(r"Avoidable should-leaks: (\d+)", summary).group(1)
    nice = re.search(r"Avoidable nice-leaks: (\d+)", summary).group(1)
    status = re.search(r"Search \(goal \w+\): (.*)", summary).group(1)
    valid = re.search(r"^(VALID|INVALID)", summary, re.M).group(1)
    print(f"| {path.stem} | {magnets} | {magnets / (2 * len(sides)):.1f} | {forbid} | {should} / {nice} | {valid}, {status} |")
