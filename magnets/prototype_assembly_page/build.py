"""PROTOTYPE (#92), throwaway: never merged into main.

Three variants of the assembly page, switchable via `?variant=A|B|C` and the
floating bar; `?run=example|full` picks the arrangement. Writes one HTML file:

    uv run python prototype_assembly_page/build.py

The pockets are read the way `magnets bases` reads them: load_arrangement's
fronts, a top/bottom pocket at `position(length)` U from the left end, a
left/right pocket `at` U from the top edge.
"""

import json
from pathlib import Path

from magnets.data import load_arrangement, load_classes, load_rules, mentioned_classes

HERE = Path(__file__).parent
RUNS = {
    "example": "example",
    # A copy of the latest `magnets search --flip top_bottom`, every class.
    "full": str(HERE.parent / "tests" / "fixtures" / "full_search.yaml"),
}
MAX_LENGTH = 6


def run_data(source: str) -> dict:
    classes = load_classes(grammar=load_rules())
    arrangement = load_arrangement(source, max_length=MAX_LENGTH, classes=classes)
    built = mentioned_classes(source, classes=classes)
    return {
        "flip": arrangement.flip,
        "maxLength": MAX_LENGTH,
        "built": list(built),
        "fronts": {
            name: {
                edge: [
                    {"anchor": p.anchor, "at": [p.at.numerator, p.at.denominator], "up": p.up, "down": p.down}
                    for p in pockets
                ]
                for edge, pockets in arrangement.fronts[name].items()
            }
            for name in built
        },
    }


def main() -> None:
    classes = load_classes(grammar=load_rules())
    data = {
        "classes": {
            name: {
                "id": c.id,
                "minLength": c.min_length,
                "flipPair": c.flip_pair,
                "members": [m for side in c.sides for m in side.members],
            }
            for name, c in classes.items()
        },
        "runs": {key: run_data(source) for key, source in RUNS.items()},
    }
    html = (HERE / "page.html").read_text().replace("/*DATA*/null", json.dumps(data))
    out = HERE.parent / "out" / "prototype-assembly-page" / "assembly.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print(out.resolve())


if __name__ == "__main__":
    main()
