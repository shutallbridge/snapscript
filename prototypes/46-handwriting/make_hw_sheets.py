# /// script
# requires-python = ">=3.12"
# dependencies = ["reportlab", "pillow"]
# ///
"""PROTOTYPE (#46), throwaway: print mock card faces to handwrite on, at U = 25, 30, 35 mm.

Each card is 1U tall and 2-4U long, with a 12 mm tagStandard41h12 marker at its
left end and blank space to write on. The text to write is printed under the card.
Every card has its own marker ID (1000 + u_index * 100 + card), so read_hw.py
knows which card it is looking at and what should be written on it.

    uv run make_hw_sheets.py   ->  out/hw-sheets-a4.pdf, cards.json
"""

import json
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.request import urlopen

from PIL import Image
from reportlab.lib.units import mm
from reportlab.pdfgen.canvas import Canvas

US = [25, 30, 35]  # candidate U sizes, mm
TAG = 12.0  # marker size picked in the rig run, mm
PAD = 2.0  # white space around the marker
INSET = 1.5  # what read_hw.py trims off the writing area, to stay clear of the printed lines
WIDTH, HEIGHT, MARGIN = 210.0, 297.0, 10.0

# (text to write, card length in U, why it's here)
CARDS = [
    ("x", 2, "one letter"),
    ("X", 2, "case of x"),
    ("i", 2, "one letter"),
    ("y", 2, "one letter"),
    ("500", 2, "number"),
    ("0", 2, "zero"),
    ("-1", 2, "minus"),
    ("0.5", 2, "decimal point"),
    ("1 000", 2, "gap, means 1000"),
    ("oO0", 2, "o, O, zero"),
    ("lI1", 2, "l, I, one"),
    ("sS5", 2, "s, S, five"),
    ("zZ2", 2, "z, Z, two"),
    ("cC", 2, "case"),
    ("vV", 2, "case"),
    ("wW", 2, "case"),
    ("kK", 2, "case"),
    ("pP", 2, "case"),
    ("B8", 2, "B, eight"),
    ("b6", 2, "b, six"),
    ("g9q", 2, "g, nine, q"),
    ("hi", 2, "short word"),
    ("score2", 2, "letters + digit"),
    ("drawCircle", 2, "long name squeezed"),
    ("drawCircle", 3, "long name"),
    ("frameCount", 3, "camelCase"),
    ("framecount", 3, "same, all small"),
    ("hello_world", 3, "underscore"),
    ("p5.circle", 3, "dot"),
    ("speedX", 3, "capital at end"),
    ("Welcome_user!", 4, "long string"),
    ("isVisible", 4, "camelCase"),
]

HERE = Path(__file__).parent
CACHE = HERE / ".tags"
TAG_URL = "https://raw.githubusercontent.com/AprilRobotics/apriltag-imgs/master/tagStandard41h12/tag41_12_{:05d}.png"


def tag_bits(i: int) -> list[list[bool]]:
    """9×9 grid, True where the cell is black."""
    path = CACHE / f"{i:05d}.png"
    if not path.exists():
        CACHE.mkdir(exist_ok=True)
        path.write_bytes(urlopen(TAG_URL.format(i)).read())
    im = Image.open(path).convert("RGBA")
    return [[im.getpixel((x, y))[3] > 0 and im.getpixel((x, y))[0] < 128 for x in range(9)] for y in range(9)]


def draw_tag(c: Canvas, bits, x: float, top: float, size: float) -> None:
    cell = size / 9
    p = c.beginPath()
    for row, line in enumerate(bits):
        for col, black in enumerate(line):
            if black:
                p.rect((x + col * cell) * mm, (top - (row + 1) * cell) * mm, cell * mm, cell * mm)
    c.drawPath(p, fill=1, stroke=0)


def draw_ruler(c: Canvas, x: float, y: float, length: float) -> None:
    c.setLineWidth(0.25 * mm)
    c.line(x * mm, y * mm, (x + length) * mm, y * mm)
    for t in range(0, int(length) + 1, 5):
        tick = 3 if t % 10 == 0 else 1.5
        c.line((x + t) * mm, y * mm, (x + t) * mm, (y - tick) * mm)


def layout():
    """Place every card on pages, one U size at a time. Positions in mm from the page's top-left."""
    cards, pages = [], []
    for ui, u in enumerate(US):
        page, x, y = None, MARGIN, None
        for ci, (text, length, why) in enumerate(CARDS):
            w, h = length * u, u
            if page is None or x + w > WIDTH - MARGIN:
                x, y = MARGIN, (y + u + 11 if y is not None else None)
            if page is None or y + h + 6 > HEIGHT - MARGIN:
                page, x, y = len(pages), MARGIN, MARGIN + 30
                pages.append(u)
            tag_x, tag_y = x + PAD, y + (h - TAG) / 2
            write_x = x + PAD + TAG + PAD
            cards.append({
                "id": 1000 + ui * 100 + ci, "text": text, "u_mm": u, "length_u": length, "why": why,
                "page": page, "card": [x, y, w, h],
                "tag_center": [tag_x + TAG / 2, tag_y + TAG / 2], "tag_mm": TAG,
                "write": [write_x + INSET, y + INSET, x + w - write_x - 2 * INSET, h - 2 * INSET],
            })
            x += w + 6
    return cards, pages


def main() -> None:
    cards, pages = layout()
    with ThreadPoolExecutor(16) as pool:
        bits = dict(zip([k["id"] for k in cards], pool.map(tag_bits, [k["id"] for k in cards])))

    out = HERE / "out" / "hw-sheets-a4.pdf"
    out.parent.mkdir(exist_ok=True)
    c = Canvas(str(out), pagesize=(WIDTH * mm, HEIGHT * mm))
    c.setTitle("PROTOTYPE #46 handwriting sheets")
    flip = lambda y: (HEIGHT - y) * mm  # layout is top-down, PDF is bottom-up

    for p, u in enumerate(pages):
        c.setFont("Helvetica-Bold", 12)
        c.drawString(MARGIN * mm, flip(MARGIN + 4), f"U = {u} mm   (page {p + 1} of {len(pages)})")
        c.setFont("Helvetica", 7)
        c.drawString(MARGIN * mm, flip(MARGIN + 8), "#46 handwriting test (prototype). Print at 100% / Actual size; the ruler must measure 100 mm.")
        c.drawString(MARGIN * mm, flip(MARGIN + 11.5), "Write the grey text under each card in the space right of the marker, with the card marker, as you would on a real card. Keep off the marker.")
        draw_ruler(c, MARGIN, HEIGHT - MARGIN - 18, 100)
        c.drawString((MARGIN + 101) * mm, flip(MARGIN + 19), "100 mm")
        for k in (k for k in cards if k["page"] == p):
            x, y, w, h = k["card"]
            c.setStrokeGray(0.6)
            c.setLineWidth(0.3 * mm)
            c.rect(x * mm, flip(y + h), w * mm, h * mm)
            div = x + PAD + TAG + PAD
            c.setDash(1 * mm, 1.5 * mm)
            c.line(div * mm, flip(y), div * mm, flip(y + h))
            c.setDash()
            cx, cy = k["tag_center"]
            draw_tag(c, bits[k["id"]], cx - TAG / 2, HEIGHT - (cy - TAG / 2), TAG)
            c.setFillGray(0.45)
            c.setFont("Helvetica", 9)
            c.drawString((div + 1) * mm, flip(y + h + 4), k["text"])
            c.setFont("Helvetica", 5.5)
            c.drawRightString((x + w) * mm, flip(y + h + 4), f"{k['why']} · {k['id']}")
            c.setFillGray(0)
        c.showPage()
    c.save()
    (HERE / "cards.json").write_text(json.dumps(cards, indent=1))
    print(f"wrote {out} ({len(pages)} pages, {len(cards)} cards) and cards.json")


if __name__ == "__main__":
    main()
