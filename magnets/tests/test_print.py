"""The paper prototype: a program's cards as folded pieces, through `card_sheet`."""

import pytest

from helpers import arrangement
from magnets import ProgramError, bundled_programs, card_sheet, check, check_program


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
def test_example_num_marks(unit):
    (piece,) = pieces(card_sheet("example", "[str{hi}]\n", unit=unit))
    front, back = piece.front, piece.back
    assert (front.notation, back.notation) == ("[num{hi}]", "[str{hi}]")
    assert marks(front) == [("left", 0.5 * unit, "F"), ("right", 0.5 * unit, "N")]
    # The str panel's right edge holds num's N/S pocket flipped: S/N.
    right = [m for m in back.marks if m.edge == "right"]
    assert [(m.x - back.x, m.y - back.y, m.letter) for m in right] == [(2 * unit, 0.5 * unit, "S")]
    assert [m.letter for m in back.marks if m.edge == "left"] == ["F"]
    assert (front.width, front.height) == (2 * unit, unit)


def test_every_card_once_at_min_length_front_above_back():
    text = "[define{f}]\n[if][get{score}]\n  [call(print)][get{score}][num{500}]\n[dedent]\n"
    sheet = card_sheet("example", text, unit=30)
    found = pieces(sheet)
    assert [p.card.text for p in found] == [
        "[define{f}]", "[if]", "[get{score}]", "[call(print)]", "[get{score}]", "[num{500}]", "[dedent]",
    ]
    assert [p.length for p in found] == [2] * 7
    # A card that is not a flip pair has an unlabelled back.
    get = found[2]
    assert (get.front.notation, get.back.notation) == ("[get{score}]", None)
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
        ("[str{500}]", "[num{500}]", "[str{500}]"),
        ("[num{7}]", "[num{7}]", "[str{7}]"),
        # Only handwriting carries over: printed text is the kit's.
        ("[num(0)]", "[num(0)]", "[str(…)]"),
        ("[bool(false)]", "[bool(true)]", "[bool(false)]"),
        ("[bool{false}]", "[bool{true}]", "[bool{false}]"),
        # Each operator card pairs the members at the same place on each side.
        ("[+]", "[+]", "[-]"),
        ("[/]", "[*]", "[/]"),
        ("[>=]", "[<=]", "[>=]"),
        ("[or]", "[and]", "[or]"),
        # A color card's back is another color, which the kit picks, so it
        # reads as an unnamed color.
        ("[color(yellow)]", "[color(yellow)]", "[color(…)]"),
    ],
)
def test_back_labels_carry_the_handwriting_over(card, front, back):
    (piece,) = pieces(card_sheet("example", card))
    assert (piece.front.notation, piece.back.notation) == (front, back)


@pytest.mark.parametrize(
    "card", ["[set{x}to]", "[get{x}]", "[define{f}]", "[call{f}]", "[getProp{p}]", "[optional{p}]", "[%]"]
)
def test_a_card_that_is_not_a_flip_pair_has_an_unlabelled_back(card):
    (piece,) = pieces(card_sheet("example", card))
    assert (piece.front.notation, piece.back.notation) == (card, None)


# The literal flip pair with a pocket on every edge, from both ends, half
# pockets too; and a block head, which is not a flip pair.
EVERY_EDGE = dict(
    literal={
        "top": [("left", "1/6", "N/-"), ("right", "1/2", "F/S")],
        "bottom": [("left", "5/6", "-/S")],
        "left": [("1/6", "S/N")],
        "right": [("1/2", "N/F"), ("5/6", "-/N")],
    },
    block_head={
        "top": [("left", "1/2", "S/F")],
        "bottom": [("right", "1/6", "N/-")],
        "left": [("5/6", "F/-")],
    },
)


def test_letters_are_the_layer_nearest_each_face():
    (head,) = pieces(card_sheet(arrangement(**EVERY_EDGE), "[repeat]"))
    assert head.front.notation == "[repeat]"
    # At 30 mm per U the positions sit 5, 15 and 25 mm into each U.
    assert marks(head.front) == [("bottom", 60 - 5, "N"), ("left", 25, "F"), ("top", 15, "S")]
    # Its back is unlabelled and shows the front's down layers.
    assert head.back.notation is None
    assert marks(head.back) == [("bottom", 15, "F"), ("left", 5, "–"), ("top", 60 - 5, "–")]


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
@pytest.mark.parametrize("unit", [30, 20])
def test_the_fold_mark_sits_between_pocket_positions(flip, unit):
    # Pockets at the two positions nearest the right end, on the edges
    # either side of the fold line, and on the right edge either side of
    # it. The fold mark sits midway between them, 1/3 U in from the right.
    near_right = [("right", "1/6", "N/-"), ("right", "1/2", "N/-")]
    edges = {"top": near_right, "bottom": near_right, "right": [("1/6", "N/-"), ("5/6", "N/-")]}
    classes = {"block_head": edges}
    (piece,) = pieces(card_sheet(arrangement(flip, **classes), "[repeat]", unit=unit))
    right = piece.front.x + piece.front.width
    assert piece.fold_x == pytest.approx(right - unit / 3)
    # No pocket on the fold line is nearer than 1/6 U along it.
    for m in piece.front.marks + piece.back.marks:
        if m.y == pytest.approx(piece.fold_y):
            assert abs(m.x - piece.fold_x) >= unit / 6 - 1e-9


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_back_letters_are_the_checkers_derived_up_layers(flip):
    arr = arrangement(flip, **EVERY_EDGE)
    sides = check(arr).sides
    for card, side in [("[num{1}]", "literal.num"), ("[str{1}]", "literal.str")]:
        (piece,) = pieces(card_sheet(arr, card))
        panel = piece.front if side == "literal.num" else piece.back
        expected = sorted(
            (edge, "–" if p.up == "-" else p.up) for edge, ps in sides[side].edges.items() for p in ps
        )
        assert sorted((m.edge, m.letter) for m in panel.marks) == expected


@pytest.mark.parametrize("flip, rotated, fold", [("top_bottom", False, "↕"), ("left_right", True, "↔")])
def test_back_folds_onto_front(flip, rotated, fold):
    sheet = card_sheet(arrangement(flip, **EVERY_EDGE), "[if][num{1}]", unit=25)
    for piece in pieces(sheet):
        assert piece.fold == fold
        assert piece.back.rotated is rotated and piece.front.rotated is False
        # Mirrored through the fold line, each back mark lands on a front mark.
        front = sorted((round(m.x, 6), round(m.y, 6)) for m in piece.front.marks)
        mirrored = sorted((round(m.x, 6), round(2 * piece.fold_y - m.y, 6)) for m in piece.back.marks)
        assert mirrored == front
        assert len(front) == len(set(front))


def test_program_text_above_its_cards_on_as_many_a4_pages_as_needed():
    # 30 cards, 2U at 30 mm, three to a row: more rows than a page holds.
    text = "// thirty cards\n" + "".join(f"[if][num{{{i}}}]\n" for i in range(15))
    sheet = card_sheet("example", text)
    first = sheet.pages[0]
    assert [line.text for line in first.text] == ["min lengths", *text.splitlines()]
    assert first.pieces[0].front.y > first.text[-1].y
    assert all((page.width, page.height) == (210, 297) for page in sheet.pages)
    assert len(sheet.pages) > 1 and all(page.pieces for page in sheet.pages)
    # In program order, across pages, each piece whole on one page.
    found = [p.card.text for p in pieces(sheet)]
    assert found == [card for i in range(15) for card in ("[if]", f"[num{{{i}}}]")]
    for page in sheet.pages:
        assert all(10 <= p.front.y and p.back.y + p.back.height <= 297 - 10 for p in page.pieces)


def test_unknown_card():
    with pytest.raises(ProgramError, match="unknown card"):
        card_sheet("example", "[nope]")


@pytest.mark.parametrize(
    "text, unit, paper, card, largest",
    [
        # 2U at 100 mm is 200 mm, over A4's 190 mm printable width; the first card names it.
        ("[num{1}]\n[if]", 100, "a4", "[num{1}]", "95"),
        # Letter is 195.9 mm wide inside its margins.
        ("[if]", 100, "letter", "[if]", "97.9"),
        # The longest card names the unit that fits the whole program.
        ("[if][num{1}]\n[dedent]\n[define{f}]", 96, "a4", "[if]", "95"),
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
    # 2U cards at 30 mm: a 190 mm wide printable area holds six U per row.
    text = "[if][get{score}]\n" * 4
    (page,) = card_sheet("example", text, unit=30).pages
    lengths = [[p.length for p in row] for row in rows(page)]
    assert lengths == [[2, 2, 2], [2, 2, 2], [2, 2]]
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
    text = "".join(f"[if][num{{{i}}}]\n" for i in range(20))
    sheet = card_sheet("example", text, paper=paper)
    assert len(sheet.pages) > 1
    for page in sheet.pages:
        ruler = page.ruler
        assert ruler.length == 50
        assert 10 <= ruler.x and ruler.x + ruler.length <= page.width - 10
        assert 10 <= ruler.y <= ruler.y + ruler.height <= page.height - 10
        assert all(p.back.y + p.back.height <= ruler.y for p in page.pieces)


def test_letter_paper_and_a4_by_default():
    text = "".join(f"[if][num{{{i}}}]\n" for i in range(20))
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
    # 2U cards at a unit that divides the 190 mm printable width exactly.
    text = "".join(f"[num{{{i}}}]" for i in range(per_row))
    (page,) = card_sheet("example", text, unit=190 / (2 * per_row)).pages
    assert [len(row) for row in rows(page)] == [per_row]


BUNDLED = ["first_sketch", "nested_blocks", "parameters", "receivers_and_groups", "illegal"]


def test_with_no_program_every_bundled_program_from_a_new_page():
    sheet = card_sheet("example")
    programs = {p.name: p for p in bundled_programs()}
    starts = [i for i, page in enumerate(sheet.pages) if i == 0 or page.program != sheet.pages[i - 1].program]
    assert [sheet.pages[i].program for i in starts] == BUNDLED
    for i in starts:
        page = sheet.pages[i]
        program = programs[page.program]
        heading, *text = [line.text for line in page.text]
        assert heading == f"{program.name} (min lengths)"
        note = ["these neighbours should not snap"] if program.name == "illegal" else []
        assert text == program.text.rstrip("\n").splitlines() + note
    # Every program's cards, in order, each on its own program's pages.
    for name in BUNDLED:
        found = [p.card.text for page in sheet.pages if page.program == name for p in page.pieces]
        strips = check_program("example", programs[name].text).program
        assert found == [card.text for strip in strips for line in strip for card in line.cards]


def test_a_bundled_program_by_name():
    sheet = card_sheet("example", "nested_blocks")
    assert {page.program for page in sheet.pages} == {"nested_blocks"}
    assert sheet.pages[0].text[0].text == "nested_blocks (min lengths)"


def test_an_unknown_program_name_lists_the_bundled_names():
    with pytest.raises(ValueError, match="no bundled program named 'nope'; expected one of " + ", ".join(BUNDLED)):
        card_sheet("example", "nope")


@pytest.mark.parametrize("draw", [1, 7, 20])
def test_a_draw_prints_each_card_at_its_length_in_checks_layout(draw):
    for program in bundled_programs():
        layouts = {layout.name: layout for layout in check_program("example", program.text).layouts}
        expected = [placed.length for placed in layouts[f"draw {draw}"].cards]
        sheet = card_sheet("example", program.name, draw=draw)
        found = [p for page in sheet.pages for p in page.pieces]
        assert [p.length for p in found] == expected
        assert all(p.front.width == p.length * 30 for p in found)
    assert len(set(expected)) > 1  # not all at one length


def test_without_a_draw_every_card_is_at_its_minimum_length():
    sides = check("example").sides
    sheet = card_sheet("example")
    assert all(p.length == sides[p.card.side].min_length for page in sheet.pages for p in page.pieces)


@pytest.mark.parametrize("draw, label", [(None, "min lengths"), (3, "draw 3, seed 0")])
def test_every_page_states_its_lengths(draw, label):
    sheet = card_sheet("example", draw=draw)
    assert len(sheet.pages) > len(BUNDLED)  # some program runs over a page
    for page in sheet.pages:
        assert page.lengths == label
        assert page.text[0].text == f"{page.program} ({label})"


def test_a_draw_below_one():
    with pytest.raises(ValueError, match="draw must be 1 or more"):
        card_sheet("example", draw=0)
