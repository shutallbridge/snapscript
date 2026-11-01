"""Pack each stage's parts onto A1 mini plates and write each plate's folder.

    python3 -I plates.py <bases dir> <branch root> [plate name ...]

Reads `stages.json` (from stages.py). One part type per plate (frames,
cores, front faces, back faces), any lengths. Parts are packed with 5 mm
between neighbours and the bed's edge, then the group is centred on the
180 x 180 bed. Naming is deterministic: stage, then part type, then plates
in order, each filled from the longest part down.

Writes `plates.json` (every plate) and, for the named plates or all of them,
`stage-<n>/<plate>/` with `plate.3mf`, the STLs it uses and `contents.md`.
"""

import json
import shutil
import struct
import sys
import zipfile
from collections import Counter
from dataclasses import dataclass
from pathlib import Path

HERE = Path(__file__).parent
BED = 180.0
GAP = 5.0
FLIP_PAIRS = ("08-literal", "10-color", "15-operator")
PART_TYPES = ["frames", "cores", "front-faces", "back-faces"]


@dataclass(frozen=True)
class Mesh:
    vertices: list[tuple[float, float, float]]  # moved so the bounding box starts at 0
    triangles: list[tuple[int, int, int]]
    size: tuple[float, float, float]


def read_stl(path: Path) -> Mesh:
    data = path.read_bytes()
    (n,) = struct.unpack("<I", data[80:84])
    index: dict[tuple[float, float, float], int] = {}
    vertices, triangles = [], []
    for i in range(n):
        v = struct.unpack("<12f", data[84 + 50 * i : 84 + 50 * i + 48])
        tri = []
        for p in (v[3:6], v[6:9], v[9:12]):
            p = tuple(round(c, 5) for c in p)
            if p not in index:
                index[p] = len(vertices)
                vertices.append(p)
            tri.append(index[p])
        triangles.append(tuple(tri))
    lo = [min(p[k] for p in vertices) for k in range(3)]
    hi = [max(p[k] for p in vertices) for k in range(3)]
    moved = [tuple(p[k] - lo[k] for k in range(3)) for p in vertices]
    return Mesh(moved, triangles, tuple(hi[k] - lo[k] for k in range(3)))


@dataclass
class Rect:
    x: float
    y: float
    w: float
    h: float


class MaxRects:
    """MaxRects, best short side fit, 90° turns allowed. Every part is grown by
    the gap, in a bin grown by the gap, so neighbours end up a gap apart."""

    def __init__(self, size: float, rule: str = "short", turn_first: bool = False):
        self.free = [Rect(0, 0, size, size)]
        self.rule, self.turn_first = rule, turn_first

    def _score(self, r: Rect, pw: float, ph: float) -> tuple:
        short, long_ = sorted((r.w - pw, r.h - ph))
        if self.rule == "short":
            return (short, long_, r.y, r.x)
        if self.rule == "long":
            return (long_, short, r.y, r.x)
        if self.rule == "area":
            return (r.w * r.h - pw * ph, short, r.y, r.x)
        return (r.y + ph, r.x)  # bottom-left

    def insert(self, w: float, h: float) -> tuple[Rect, bool] | None:
        best = None
        for r in self.free:
            turns = [(False, (w, h)), (True, (h, w))]
            for turned, (pw, ph) in turns[::-1] if self.turn_first else turns:
                if pw <= r.w + 1e-9 and ph <= r.h + 1e-9:
                    score = self._score(r, pw, ph)
                    if best is None or score < best[0]:
                        best = (score, Rect(r.x, r.y, pw, ph), turned)
        if best is None:
            return None
        placed = best[1]
        free = []
        for r in self.free:
            free.extend(self._split(r, placed))
        self.free = [r for r in free if not any(r is not o and self._contains(o, r) for o in free)]
        self.free = list({(r.x, r.y, r.w, r.h): r for r in self.free}.values())
        return placed, best[2]

    @staticmethod
    def _split(r: Rect, p: Rect) -> list[Rect]:
        if p.x >= r.x + r.w or p.x + p.w <= r.x or p.y >= r.y + r.h or p.y + p.h <= r.y:
            return [r]
        out = []
        if p.x > r.x:
            out.append(Rect(r.x, r.y, p.x - r.x, r.h))
        if p.x + p.w < r.x + r.w:
            out.append(Rect(p.x + p.w, r.y, r.x + r.w - p.x - p.w, r.h))
        if p.y > r.y:
            out.append(Rect(r.x, r.y, r.w, p.y - r.y))
        if p.y + p.h < r.y + r.h:
            out.append(Rect(r.x, p.y + p.h, r.w, r.y + r.h - p.y - p.h))
        return out

    @staticmethod
    def _contains(a: Rect, b: Rect) -> bool:
        return a.x <= b.x and a.y <= b.y and a.x + a.w >= b.x + b.w and a.y + a.h >= b.y + b.h


@dataclass
class Placed:
    stem: str
    x: float  # bed position of the part's bounding box, after any turn
    y: float
    turned: bool


def parts_for(frames: dict[str, int]) -> dict[str, Counter]:
    """A stage's frames -> every part type's STL stems and counts."""
    out = {t: Counter() for t in PART_TYPES}
    for stem, n in frames.items():
        length = stem.rsplit("-", 1)[1]
        out["frames"][stem] += n
        out["cores"][f"core-{length}"] += n
        out["front-faces"][f"front-face-{length}"] += n
        if stem.startswith(FLIP_PAIRS):
            out["back-faces"][f"back-face-{length}"] += n
    return out


def stl_path(bases: Path, stem: str) -> Path:
    return bases / ("shared" if stem.split("-")[0] in ("core", "front", "back") else "frames") / f"{stem}.stl"


def pack(stems: list[str], meshes: dict[str, Mesh]) -> list[list[Placed]]:
    """Fill plates in turn: each takes every remaining part that still fits, in order."""
    left = list(stems)
    plates = []
    while left:
        # Try each rule in a fixed order and keep the first that fits the most.
        best = None
        for rule in RULES:
            for turn_first in (False, True):
                got = fill(left, meshes, MaxRects(BED - 2 * GAP + GAP, rule, turn_first))
                if best is None or len(got[0]) > len(best[0]):
                    best = got
        placed, rest = best
        if not placed:
            raise ValueError(f"{left[0]} doesn't fit on the bed")
        plates.append(centre(placed, meshes))
        left = rest
    return plates


RULES = ["short", "long", "area", "bottom-left"]


def fill(left: list[str], meshes: dict[str, Mesh], bin_: MaxRects) -> tuple[list[Placed], list[str]]:
    placed, rest = [], []
    for stem in left:
        w, h, _ = meshes[stem].size
        got = bin_.insert(w + GAP, h + GAP)
        if got is None:
            rest.append(stem)
        else:
            r, turned = got
            placed.append(Placed(stem, r.x, r.y, turned))
    return placed, rest


def footprint(p: Placed, meshes: dict[str, Mesh]) -> tuple[float, float]:
    w, h, _ = meshes[p.stem].size
    return (h, w) if p.turned else (w, h)


def centre(placed: list[Placed], meshes: dict[str, Mesh]) -> list[Placed]:
    x0 = min(p.x for p in placed)
    y0 = min(p.y for p in placed)
    x1 = max(p.x + footprint(p, meshes)[0] for p in placed)
    y1 = max(p.y + footprint(p, meshes)[1] for p in placed)
    dx, dy = (BED - (x1 - x0)) / 2 - x0, (BED - (y1 - y0)) / 2 - y0
    return [Placed(p.stem, p.x + dx, p.y + dy, p.turned) for p in placed]


def write_3mf(path: Path, placed: list[Placed], meshes: dict[str, Mesh]) -> None:
    objects, items = [], []
    seen = Counter()
    for i, p in enumerate(placed, start=1):
        m = meshes[p.stem]
        seen[p.stem] += 1
        verts = "".join(f'<vertex x="{x:.5f}" y="{y:.5f}" z="{z:.5f}"/>' for x, y, z in m.vertices)
        tris = "".join(f'<triangle v1="{a}" v2="{b}" v3="{c}"/>' for a, b, c in m.triangles)
        name = f"{p.stem} #{seen[p.stem]}"
        objects.append(
            f'<object id="{i}" name="{name}" type="model"><mesh><vertices>{verts}</vertices>'
            f"<triangles>{tris}</triangles></mesh></object>"
        )
        # Row-vector 3MF transform: a turn of 90° about z, then the move.
        if p.turned:
            matrix = f"0 1 0 -1 0 0 0 0 1 {p.x + m.size[1]:.4f} {p.y:.4f} 0"
        else:
            matrix = f"1 0 0 0 1 0 0 0 1 {p.x:.4f} {p.y:.4f} 0"
        items.append(f'<item objectid="{i}" transform="{matrix}"/>')
    model = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<model unit="millimeter" xml:lang="en-US" xmlns="http://schemas.microsoft.com/3dmanufacturing/core/2015/02">'
        f"<resources>{''.join(objects)}</resources><build>{''.join(items)}</build></model>"
    )
    content_types = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="model" ContentType="application/vnd.ms-package.3dmanufacturing-3dmodel+xml"/>'
        "</Types>"
    )
    rels = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Target="/3D/3dmodel.model" Id="rel0" '
        'Type="http://schemas.microsoft.com/3dmanufacturing/2013/01/3dmodel"/></Relationships>'
    )
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("[Content_Types].xml", content_types)
        z.writestr("_rels/.rels", rels)
        z.writestr("3D/3dmodel.model", model)


def contents(placed: list[Placed]) -> Counter:
    return Counter(p.stem for p in placed)


def main() -> None:
    bases, root, only = Path(sys.argv[1]), Path(sys.argv[2]), set(sys.argv[3:])
    stages = json.loads((HERE / "stages.json").read_text())
    meshes: dict[str, Mesh] = {}
    plates = []
    for stage, frames in stages.items():
        for part_type, counts in parts_for(frames).items():
            if not counts:
                continue
            for stem in counts:
                meshes.setdefault(stem, read_stl(stl_path(bases, stem)))
            # Longest first, then by name, so the same list always packs the same way.
            stems = [s for s in sorted(counts, key=lambda s: (-meshes[s].size[0], s)) for _ in range(counts[s])]
            for n, placed in enumerate(pack(stems, meshes), start=1):
                plates.append((f"S{stage}-{part_type}-{n:02d}", int(stage), part_type, placed))

    summary = []
    for name, stage, part_type, placed in plates:
        c = contents(placed)
        folder = f"stage-{stage}/{name}"
        summary.append(
            {
                "plate": name,
                "stage": stage,
                "part_type": part_type,
                "folder": folder,
                "part_count": len(placed),
                "contents": ", ".join(f"{s} ×{n}" for s, n in c.items()),
            }
        )
        if only and name not in only:
            continue
        out = root / folder
        out.mkdir(parents=True, exist_ok=True)
        for stem in c:
            shutil.copy(stl_path(bases, stem), out / f"{stem}.stl")
        write_3mf(out / "plate.3mf", placed, meshes)
        lines = [f"# {name}", "", f"Stage {stage}, {part_type}, {len(placed)} parts.", ""]
        lines += [f"- `{s}.stl` ×{n}" for s, n in c.items()]
        if part_type == "cores":
            lines += ["", "Cores need supports: add them in Bambu Studio."]
        lines += ["", "`plate.3mf` has every part placed, 5 mm apart and centred on the 180 × 180 bed."]
        (out / "contents.md").write_text("\n".join(lines) + "\n")
    (HERE / "plates.json").write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    for s in summary:
        print(f"{s['plate']:22} {s['part_count']:3}  {s['contents']}")


if __name__ == "__main__":
    main()
