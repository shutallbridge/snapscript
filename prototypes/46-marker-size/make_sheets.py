# /// script
# requires-python = ">=3.12"
# dependencies = ["reportlab", "pillow"]
# ///
"""PROTOTYPE (#46), throwaway: print sheets of tagStandard41h12 markers, 8–18 mm.

One page per table position. Each page has every size, COPIES markers per size,
and its own block of IDs, so one camera frame of all pages tells the positions
apart: id = page * 100 + size_index * COPIES + copy. `measure.py` uses the same rule.

    uv run make_sheets.py [--paper a4|letter]   ->  out/marker-sheets-<paper>.pdf
"""

import argparse
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

from PIL import Image
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

SIZES = list(range(8, 19))  # printed width of the whole 9×9 marker, mm
COPIES = 6
PAGES = ["centre", "near", "far-left", "far-centre", "far-right"]
PAPERS = {"a4": (210.0, 297.0), "letter": (215.9, 279.4)}

HERE = Path(__file__).parent
CACHE = HERE / ".tags"
TAG_URL = "https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tagStandard41h12/tag41_12_{:05d}.png"


def tag_id(page: int, size_index: int, copy: int) -> int:
    return page * 100 + size_index * COPIES + copy


def tag_bits(i: int) -> list[list[bool]]:
    """9×9 grid, True where the cell is black."""
    path = CACHE / f"{i:05d}.png"
    if not path.exists():
        CACHE.mkdir(exist_ok=True)
        path.write_bytes(urlopen(TAG_URL.format(i)).read())
    im = Image.open(path).convert("RGBA")
    return [[im.getpixel((x, y))[3] > 0 and im.getpixel((x, y))[0] < 128 for x in range(9)] for y in range(9)]


def draw_tag(c: Canvas, bits, x: float, top: float, size: float) -> None:
    """One filled path for all black cells, so no seams between cells."""
    cell = size / 9
    p = c.beginPath()
    for row, line in enumerate(bits):
        for col, black in enumerate(line):
            if black:
                p.rect((x + col * cell) * mm, (top - (row + 1) * cell) * mm, cell * mm, cell * mm)
    c.drawPath(p, fill=1, stroke=0)


def draw_ruler(c: Canvas, x: float, y: float, length: float, vertical: bool) -> None:
    c.setLineWidth(0.25 * mm)
    dx, dy = (0, 1) if vertical else (1, 0)
    c.line(x * mm, y * mm, (x + dx * length) * mm, (y + dy * length) * mm)
    for t in range(0, int(length) + 1, 5):
        tick = 3 if t % 10 == 0 else 1.5
        px, py = x + dx * t, y + dy * t
        if vertical:
            c.line(px * mm, py * mm, (px - tick) * mm, py * mm)
        else:
            c.line(px * mm, py * mm, px * mm, (py - tick) * mm)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--paper", choices=PAPERS, default="a4")
    args = ap.parse_args()
    width, height = PAPERS[args.paper]
    margin = 12.0

    ids = [tag_id(p, s, k) for p in range(len(PAGES)) for s in range(len(SIZES)) for k in range(COPIES)]
    with ThreadPoolExecutor(16) as pool:
        bits = dict(zip(ids, pool.map(tag_bits, ids)))

    out = HERE / "out" / f"marker-sheets-{args.paper}.pdf"
    out.parent.mkdir(exist_ok=True)
    c = Canvas(str(out), pagesize=(width * mm, height * mm))
    c.setTitle("PROTOTYPE #46 marker size sheets")

    label_w = 16.0
    pitch = (width - 2 * margin - label_w) / COPIES
    for p, name in enumerate(PAGES):
        top = height - margin
        c.setFont("Helvetica-Bold", 12)
        c.drawString(margin * mm, (top - 4) * mm, f"Position: {name}")
        c.setFont("Helvetica", 7)
        first, last = tag_id(p, 0, 0), tag_id(p, len(SIZES) - 1, COPIES - 1)
        c.drawString(margin * mm, (top - 8) * mm, f"tagStandard41h12, IDs {first}–{last}. #46 marker size test (prototype).")
        c.drawString(margin * mm, (top - 11.5) * mm, "Print at 100% / Actual size. Both rulers must measure 100 mm and 50 mm exactly.")
        c.drawString(margin * mm, (top - 15) * mm, "Sizes are the full printed square (9 × 9 cells).")
        draw_ruler(c, margin, top - 22, 100, vertical=False)
        c.drawString((margin + 101) * mm, (top - 23) * mm, "100 mm")
        draw_ruler(c, width - margin + 5, top - 55, 50, vertical=True)
        c.drawRightString((width - margin + 5) * mm, (top - 58.5) * mm, "50 mm")

        y = top - 28
        for s, size in enumerate(SIZES):
            c.setFont("Helvetica-Bold", 9)
            c.drawString(margin * mm, (y - size / 2 - 1.5) * mm, f"{size} mm")
            for k in range(COPIES):
                i = tag_id(p, s, k)
                x = margin + label_w + k * pitch + (pitch - size) / 2
                draw_tag(c, bits[i], x, y, size)
                c.setFont("Helvetica", 5)
                c.drawCentredString((x + size / 2) * mm, (y - size - 2.2) * mm, str(i))
            y -= size + 6.5
        c.showPage()
    c.save()
    print(f"wrote {out} ({args.paper}, {len(PAGES)} pages)")


if __name__ == "__main__":
    main()
