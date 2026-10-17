"""The paper prototype: a program's cards as folded pieces, through `card_sheet`."""

import pytest

from helpers import arrangement
from magnets import ProgramError, card_sheet, check


def pieces(sheet):
    return [piece for page in sheet.pages for piece in page.pieces]


def marks(panel):
    """(edge, mm from the panel's left or top, letter) of every mark."""
    found = []
    for m in panel.marks:
        along = m.y - panel.y if m.edge in ("left", "right") and not panel.rotated else m.x - panel.x
        found.append((m.edge, along, m.letter))
    return sorted(found)


@pytest.mark.parametrize("unit", [30, 20])
def test_example_set_marks(unit):
    (piece,) = pieces(card_sheet("example", "[set(x)to]\n", unit=unit))
    front, back = piece.front, piece.back
    assert (front.notation, back.notation) == ("[set(x)to]", "[get(x)]")
    assert marks(front) == [("bottom", 0.25 * unit, "F"), ("top", 0.25 * unit, "F")]
    # The get panel's top edge sits on the fold, behind the F/S pocket.
    top = [m for m in back.marks if m.edge == "top"]
    assert [(m.x - back.x, m.y, m.letter) for m in top] == [(0.25 * unit, back.y, "S")]
    assert [m.letter for m in back.marks if m.edge == "bottom"] == ["N"]
    assert (front.width, front.height) == (unit, unit)


def test_every_card_once_at_min_length_front_above_back():
    text = "[define(f)]\n[if][get(score)]\n  [call:print][get(score)][num(500)]\n[dedent]\n"
    sheet = card_sheet("example", text, unit=30)
    found = pieces(sheet)
    assert [p.card.text for p in found] == [
        "[define(f)]", "[if]", "[get(score)]", "[call:print]", "[get(score)]", "[num(500)]", "[dedent]",
    ]
    assert [p.length for p in found] == [1, 2, 1, 1, 1, 1, 2]
    # A card on the back side is printed with the class's front on top.
    get = found[2]
    assert (get.front.notation, get.back.notation) == ("[set(score)to]", "[get(score)]")
    for p in found:
        assert p.front.width == p.back.width == p.length * 30
        assert p.front.y + p.front.height == p.fold_y == p.back.y
        assert p.front.x == p.back.x
    # Each piece after the last, in its row or a row below, never overlapping.
    for page in sheet.pages:
        for a, b in zip(page.pieces, page.pieces[1:]):
            assert b.front.x >= a.front.x + a.front.width or b.front.y >= a.back.y + a.back.height


@pytest.mark.parametrize(
    "card, front, back",
    [
        ("[set(score)to]", "[set(score)to]", "[get(score)]"),
        ("[get(score)]", "[set(score)to]", "[get(score)]"),
        ("[str(500)]", "[num(500)]", "[str(500)]"),
        ("[num(7)]", "[num(7)]", "[str(7)]"),
        ("[call(draw)]", "[define(draw)]", "[call(draw)]"),
        ("[getProp(message)]", "[setProp(message)to]", "[getProp(message)]"),
        ("[optional(title)]", "[required(title)]", "[optional(title)]"),
        ("[bool:false]", "[bool:true]", "[bool:false]"),
    ],
)
def test_back_labels_carry_the_handwriting_over(card, front, back):
    (piece,) = pieces(card_sheet("example", card))
    assert (piece.front.notation, piece.back.notation) == (front, back)


# set_get with a pocket on every edge, from both ends, half pockets too; and
# a block head, which is not a flip pair.
EVERY_EDGE = dict(
    set_get={
        "top": [("left", 0.25, "N/-"), ("right", 0.5, "F/S")],
        "bottom": [("left", 0.75, "-/S")],
        "left": [(0.25, "S/N")],
        "right": [(0.5, "N/F"), (0.75, "-/N")],
    },
    block_head={
        "top": [("left", 0.5, "S/F")],
        "bottom": [("right", 0.25, "N/-")],
        "left": [(0.75, "F/-")],
    },
)


def test_letters_are_the_layer_nearest_each_face():
    (head,) = pieces(card_sheet(arrangement(**EVERY_EDGE), "[repeat]"))
    assert head.front.notation == "[repeat]"
    assert marks(head.front) == [("bottom", 60 - 7.5, "N"), ("left", 22.5, "F"), ("top", 15, "S")]
    # Its back is unlabelled and shows the front's down layers.
    assert head.back.notation is None
    assert marks(head.back) == [("bottom", 15, "F"), ("left", 7.5, "–"), ("top", 60 - 7.5, "–")]


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_back_letters_are_the_checkers_derived_up_layers(flip):
    arr = arrangement(flip, **EVERY_EDGE)
    sides = check(arr).sides
    for card, side in [("[set(x)to]", "set_get.set"), ("[get(x)]", "set_get.get")]:
        (piece,) = pieces(card_sheet(arr, card))
        panel = piece.front if side == "set_get.set" else piece.back
        expected = sorted(
            (edge, "–" if p.up == "-" else p.up) for edge, ps in sides[side].edges.items() for p in ps
        )
        assert sorted((m.edge, m.letter) for m in panel.marks) == expected


@pytest.mark.parametrize("flip, rotated, fold", [("top_bottom", False, "↕"), ("left_right", True, "↔")])
def test_back_folds_onto_front(flip, rotated, fold):
    sheet = card_sheet(arrangement(flip, **EVERY_EDGE), "[if][get(x)]", unit=25)
    for piece in pieces(sheet):
        assert piece.fold == fold
        assert piece.back.rotated is rotated and piece.front.rotated is False
        # Mirrored through the fold line, each back mark lands on a front mark.
        front = sorted((m.x, m.y) for m in piece.front.marks)
        mirrored = sorted((m.x, 2 * piece.fold_y - m.y) for m in piece.back.marks)
        assert mirrored == pytest.approx(front)
        assert len(front) == len(set(front))


def test_program_text_above_its_cards_on_as_many_a4_pages_as_needed():
    # 30 cards, 2U and 1U at 30 mm, four to a row: more rows than a page holds.
    text = "// thirty cards\n" + "".join(f"[if][num({i})]\n" for i in range(15))
    sheet = card_sheet("example", text)
    first = sheet.pages[0]
    assert [line.text for line in first.text] == text.splitlines()
    assert first.pieces[0].front.y > first.text[-1].y
    assert all((page.width, page.height) == (210, 297) for page in sheet.pages)
    assert len(sheet.pages) > 1 and all(page.pieces for page in sheet.pages)
    # In program order, across pages, each piece whole on one page.
    found = [p.card.text for p in pieces(sheet)]
    assert found == [card for i in range(15) for card in ("[if]", f"[num({i})]")]
    for page in sheet.pages:
        assert all(10 <= p.front.y and p.back.y + p.back.height <= 297 - 10 for p in page.pieces)


def test_unknown_card():
    with pytest.raises(ProgramError, match="unknown card"):
        card_sheet("example", "[nope]")


@pytest.mark.parametrize(
    "text, unit, paper, card, largest",
    [
        # 2U at 100 mm is 200 mm, over A4's 190 mm printable width.
        ("[num(1)]\n[if]", 100, "a4", "[if]", "95"),
        # Letter is 195.9 mm wide inside its margins.
        ("[if]", 100, "letter", "[if]", "97.9"),
        # The longest card names the unit that fits the whole program.
        ("[if][num(1)]\n[dedent]\n[define(f)]", 96, "a4", "[if]", "95"),
    ],
)
def test_a_card_too_long_for_the_page_names_the_largest_unit(text, unit, paper, card, largest):
    with pytest.raises(ValueError) as err:
        card_sheet("example", text, unit=unit, paper=paper)
    message = str(err.value)
    assert message.startswith(f"{card} is too long")
    assert f"the largest unit that fits is {largest} mm" in message


def rows(page):
    """The page's pieces grouped by the y of their top edge, in order."""
    found = {}
    for p in page.pieces:
        found.setdefault(p.front.y, []).append(p)
    return list(found.values())


def test_pieces_in_a_row_and_rows_touch_inside_the_printable_area():
    # 1U and 2U cards at 30 mm: a 190 mm wide printable area holds six U per row.
    text = "[if][get(score)]\n" * 5
    (page,) = card_sheet("example", text, unit=30).pages
    lengths = [[p.length for p in row] for row in rows(page)]
    assert lengths == [[2, 1, 2, 1], [2, 1, 2, 1], [2, 1]]
    for row in rows(page):
        assert row[0].front.x == 10
        for a, b in zip(row, row[1:]):
            assert b.front.x == a.front.x + a.front.width
    tops = [row[0].front.y for row in rows(page)]
    assert [b - a for a, b in zip(tops, tops[1:])] == [60, 60]
    for p in page.pieces:
        assert 10 <= p.front.x and p.front.x + p.front.width <= 200
        assert 10 <= p.front.y and p.back.y + p.back.height <= 287


@pytest.mark.parametrize("paper", ["a4", "letter"])
def test_every_page_has_a_50_mm_ruler_clear_of_the_pieces(paper):
    text = "".join(f"[if][num({i})]\n" for i in range(20))
    sheet = card_sheet("example", text, paper=paper)
    assert len(sheet.pages) > 1
    for page in sheet.pages:
        ruler = page.ruler
        assert ruler.length == 50
        assert 10 <= ruler.x and ruler.x + ruler.length <= page.width - 10
        assert 10 <= ruler.y <= ruler.y + ruler.height <= page.height - 10
        assert all(p.back.y + p.back.height <= ruler.y for p in page.pieces)


def test_letter_paper_and_a4_by_default():
    text = "".join(f"[if][num({i})]\n" for i in range(20))
    assert card_sheet("example", text).paper == "a4"
    sheet = card_sheet("example", text, paper="letter")
    assert sheet.paper == "letter"
    for page in sheet.pages:
        assert (page.width, page.height) == (215.9, 279.4)
        for p in page.pieces:
            assert 10 <= p.front.x and p.front.x + p.front.width <= 215.9 - 10
            assert 10 <= p.front.y and p.back.y + p.back.height <= 279.4 - 10
    with pytest.raises(ValueError, match="unknown paper 'a3'"):
        card_sheet("example", "[if]", paper="a3")


@pytest.mark.parametrize("per_row", [3, 11])
def test_a_row_that_fits_exactly_is_full(per_row):
    # 1U cards at a unit that divides the 190 mm printable width exactly.
    text = "".join(f"[num({i})]" for i in range(per_row))
    (page,) = card_sheet("example", text, unit=190 / per_row).pages
    assert [len(row) for row in rows(page)] == [per_row]
