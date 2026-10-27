"""Whole programs in spec notation, laid out on the table and checked."""

import copy

import pytest

from helpers import arrangement
from magnets import ProgramError, bundled_programs, check_program


def line_heads(layout):
    """(source line, x, row) of every line head in a layout."""
    return [(p.card.line, p.x, p.line_index) for p in layout.cards if p.card.index == 0]


def where(pc):
    """A program contact as (axis, (line, card), (line, card), offset)."""
    return (pc.contact.axis, (pc.a.card.line, pc.a.card.text), (pc.b.card.line, pc.b.card.text), pc.contact.offset)


# --- parsing ---------------------------------------------------------------


def test_every_bundled_program_parses_and_every_card_resolves():
    programs = bundled_programs()
    assert [p.name for p in programs] == [
        "first_sketch",
        "nested_blocks",
        "parameters",
        "receivers_and_groups",
        "illegal",
    ]
    assert [p.legal for p in programs] == [True, True, True, True, False]
    for program in programs:
        result = check_program("example", program.text)
        cards = [card for strip in result.program for line in strip for card in line.cards]
        assert cards and all(card.side for card in cards), program.name


def test_lines_strips_and_comments():
    text = (
        "// a comment line\n"
        "[import(http://a.b/p5.snap)as(p5)]   // a URL is not a comment\n"
        "\n"
        "\n"
        "[define{f}]\n"
        "// a comment inside a strip doesn't split it\n"
        "[set{x}to][num{1}]\n"
    )
    result = check_program("example", text, draws=0)
    first, second = result.program
    assert [(line.number, line.depth, [c.text for c in line.cards]) for line in first] == [
        (2, 0, ["[import(http://a.b/p5.snap)as(p5)]"]),
    ]
    assert [(line.number, [c.text for c in line.cards]) for line in second] == [
        (5, ["[define{f}]"]),
        (7, ["[set{x}to]", "[num{1}]"]),
    ]
    assert [(c.index, c.side) for c in second[1].cards] == [(0, "simple_head.head"), (1, "literal.num")]


def test_contacts_only_happen_within_a_strip():
    result = check_program("example", "[define{f}]\n[call(print)]\n\n[define{g}]\n[call(print)]", draws=0)
    [layout] = result.layouts
    assert {(pc.a.card.line, pc.b.card.line) for pc in layout.contacts} == {(1, 2), (4, 5)}


@pytest.mark.parametrize(
    "text, message",
    [
        ("[define{f}]\n [call(print)]", "line 2: indentation must be two spaces per depth, not 1"),
        ("[define{f}]\n\t[call(print)]", "line 2: indent with spaces, not tabs"),
        ("[define{f}]\n[call(print)] hello", "line 2: unexpected text 'hello'; only cards and // comments"),
        ("[define{f}]\n[call(print)]/* no */", "line 2: unexpected text '/* no */'; only cards and // comments"),
        ("[define{f}]\n[call(print)][num{1}", "line 2: card '[num{1}' is not closed with ]"),
        ("// nothing\n\n", "the program has no cards"),
    ],
)
def test_malformed_programs_are_rejected(text, message):
    with pytest.raises(ProgramError) as err:
        check_program("example", text)
    assert str(err.value) == message


# --- layout ----------------------------------------------------------------

NESTED = next(p for p in bundled_programs() if p.name == "nested_blocks").text


def test_nested_blocks_line_heads_sit_at_their_depth():
    [layout] = check_program("example", NESTED, draws=0).layouts
    assert line_heads(layout) == [
        (3, 0, 0),  # [define{draw}]
        (4, 0, 1),  # [for{i}in]
        (5, 1, 2),  #   [if]
        (6, 2, 3),  #     [call(print)]
        (7, 1, 4),  #   [dedent]
        (8, 0, 5),  # [dedent]
        (9, 0, 6),  # [repeat]
        (10, 1, 7),  #   [call(print)]
        (11, 0, 8),  # [dedent]
    ]


def test_nested_blocks_intended_column_contacts():
    [layout] = check_program("example", NESTED, draws=0).layouts
    intended = [(pc.a.card.text, pc.b.card.text, pc.contact.offset) for pc in layout.contacts if pc.intended]
    assert intended == [
        ("[define{draw}]", "[for{i}in]", 0),
        ("[for{i}in]", "[if]", 1),
        ("[if]", "[call(print)]", 1),
        ("[call(print)]", "[dedent]", -1),
        ("[dedent]", "[dedent]", -1),
        ("[dedent]", "[repeat]", 0),
        ("[repeat]", "[call(print)]", 1),
        ("[call(print)]", "[dedent]", -1),
    ]
    for pc in layout.contacts:
        if pc.intended:
            assert [label.kind for label in pc.contact.labels] == ["connect"]


def test_inline_cards_follow_their_line_head_at_their_lengths():
    text = "[define{f}]\n[for{i}in][call(range)][num{3}]\n  [call(print)][get{i}]\n[dedent]"
    [layout] = check_program("example", text, lengths=[2, 3, 2, 2, 3, 4, 2]).layouts
    assert [(p.card.text, p.x, p.length) for p in layout.cards] == [
        ("[define{f}]", 0, 2),
        ("[for{i}in]", 0, 3),
        ("[call(range)]", 3, 2),
        ("[num{3}]", 5, 2),
        ("[call(print)]", 1, 3),
        ("[get{i}]", 4, 4),
        ("[dedent]", 0, 2),
    ]
    vertical = {where(pc)[1:] for pc in layout.contacts if pc.contact.axis == "vertical"}
    assert vertical == {
        ((1, "[define{f}]"), (2, "[for{i}in]"), 0),
        # for spans 0..3, range 3..5, num 5..7; print 1..4, get(i) 4..8.
        ((2, "[for{i}in]"), (3, "[call(print)]"), 1),
        ((2, "[call(range)]"), (3, "[call(print)]"), -2),
        ((2, "[call(range)]"), (3, "[get{i}]"), 1),
        ((2, "[num{3}]"), (3, "[get{i}]"), -1),
        # dedent spans 0..2.
        ((3, "[call(print)]"), (4, "[dedent]"), -1),
    }
    lengths = {(where(pc)[1:]): pc.contact.lengths for pc in layout.contacts}
    assert lengths[(2, "[call(range)]"), (3, "[get{i}]"), 1] == (2, 4)


@pytest.mark.parametrize(
    "lengths, message",
    [
        ([1, 1], "lengths: 2 given for 3 cards"),
        ([2, 2, 1], "lengths: [dedent] on line 3 is at least 2U long, not 1"),
        ([2, 2, 7], "lengths: [dedent] on line 3 is longer than max_length 6U"),
    ],
)
def test_given_lengths_are_checked(lengths, message):
    with pytest.raises(ValueError) as err:
        check_program("example", "[define{f}]\n[call(print)]\n[dedent]", lengths=lengths)
    assert str(err.value) == message


def test_min_lengths_then_seeded_draws():
    result = check_program("example", NESTED, seed=7)
    assert [layout.name for layout in result.layouts] == ["min lengths", *(f"draw {i}" for i in range(1, 21))]
    minimum, *draws = result.layouts
    assert [p.length for p in minimum.cards] == [2] * len(minimum.cards)
    for layout in draws:
        assert all(m.length <= p.length <= 6 for m, p in zip(minimum.cards, layout.cards))
    assert len({tuple(p.length for p in layout.cards) for layout in draws}) > 1


def lengths_of(result):
    return [[p.length for p in layout.cards] for layout in result.layouts]


def test_the_same_seed_gives_the_same_lengths():
    assert lengths_of(check_program("example", NESTED, seed=3)) == lengths_of(check_program("example", NESTED, seed=3))
    assert lengths_of(check_program("example", NESTED, seed=3)) != lengths_of(check_program("example", NESTED, seed=4))
    assert lengths_of(check_program("example", NESTED, seed=3, draws=5)) == lengths_of(
        check_program("example", NESTED, seed=3)
    )[:6]


def test_draws_stay_within_max_length():
    result = check_program("example", NESTED, max_length=3, draws=50)
    assert {p.length for layout in result.layouts for p in layout.cards} == {2, 3}


# --- legal programs ----------------------------------------------------------

# simple_head over simple_head, get over simple_head, simple_head over get
# and get over get all snap (the toy set_get example's top and bottom, with
# get's edges as its flipped back), define's bottom snaps to simple_head's
# top, and simple_head's right edge snaps to a num's left edge.
TOY = arrangement(
    simple_head={
        "top": [("left", 0.25, "F/N")],
        "bottom": [("left", 0.25, "F/S")],
        "left": [(0.5, "S/-")],
        "right": [(0.5, "N/-")],
    },
    get={
        "top": [("left", 0.25, "S/F")],
        "bottom": [("left", 0.25, "N/F")],
        "left": [(0.5, "-/S")],
        "right": [(0.5, "-/N")],
    },
    define={"bottom": [("left", 0.25, "F/S")]},
    literal={"left": [(0.5, "S/-")]},
)


def test_a_legal_program_passes_when_every_contact_holds():
    result = check_program(TOY, "[define{f}]\n[set{x}to][num{1}]\n[set{y}to][num{2}]")
    assert result.passed, result.failures
    assert not result.failures


def test_a_neighbour_pair_that_does_not_snap_fails_naming_the_contact():
    # simple_head's right edge N/- meets get's left edge -/S: nothing faces.
    result = check_program(TOY, "[define{f}]\n[set{x}to][get{y}]")
    assert not result.passed
    assert {(where(f.contact), f.reason) for f in result.failures} == {
        (("horizontal", (2, "[set{x}to]"), (2, "[get{y}]"), 0), "should snap"),
    }
    assert {f.layout for f in result.failures} == {layout.name for layout in result.layouts}
    [failure, *_] = result.failures
    assert failure.contact.contact.result == "nothing"


def test_an_intended_column_contact_that_does_not_snap_fails():
    # Nothing on [call(print)]'s top: [define{f}] over it is a connect with no pockets.
    result = check_program(TOY, "[define{f}]\n[call(print)]", draws=0)
    assert [(where(f.contact), f.reason) for f in result.failures] == [
        (("vertical", (1, "[define{f}]"), (2, "[call(print)]"), 0), "should snap"),
    ]


def test_cards_that_push_apart_between_lines_fail():
    # num's top and bottom repel: num over num must coexist but pushes apart.
    toy = copy.deepcopy(TOY)
    toy["classes"]["literal"]["top"] = [{"from": "left", "at": 0.25, "layers": "N/-"}]
    toy["classes"]["literal"]["bottom"] = [{"from": "left", "at": 0.25, "layers": "N/-"}]
    result = check_program(toy, "[define{f}]\n[set{x}to][num{1}]\n[set{y}to][num{2}]", draws=0)
    [failure] = result.failures
    assert where(failure.contact) == ("vertical", (2, "[num{1}]"), (3, "[num{2}]"), 0)
    assert failure.reason == "pushes apart"
    assert failure.contact.contact.result == "repel"


def test_ungraded_contacts_are_info_only():
    # [global] has free top and bottom edges: what it does is not graded.
    toy = arrangement(**{"global": {"bottom": [("left", 0.25, "N/-")]}, "simple_head": {"top": [("left", 0.25, "N/-")]}})
    result = check_program(toy, "[global{n}][num{0}]\n[set{x}to][num{1}]", draws=0)
    assert not any(f.contact.contact.axis == "vertical" for f in result.failures)
    assert [(where(i.contact), i.contact.contact.result) for i in result.info] == [
        (("vertical", (1, "[global{n}]"), (2, "[set{x}to]"), 0), "repel"),
    ]


# --- illegal programs --------------------------------------------------------

ILLEGAL = next(p for p in bundled_programs() if p.name == "illegal").text


def test_the_illegal_program_lists_its_forbid_contacts_with_grades():
    # [(][)] snaps, and so does [if] over [dedent]; nothing else has pockets.
    # At minimum lengths only the five forbidden constructs touch.
    toy = arrangement(
        open_paren={"right": [(0.5, "N/-")]},
        close_paren={"left": [(0.5, "S/-")]},
        block_head={"bottom": [("left", 0.25, "N/-")]},
        dedent={"top": [("left", 0.25, "S/-")]},
    )
    result = check_program(toy, ILLEGAL, draws=0)
    found = {
        (*where(f.contact), f.label.priority, f.label.grade, f.label.unavoidable)
        for f in result.forbids
    }
    assert found == {
        ("horizontal", (3, "[(]"), (3, "[)]"), 0, "should", "leak", False),
        ("vertical", (6, "[if]"), (7, "[dedent]"), 0, "nice", "leak", False),
        ("vertical", (10, "[set{y}to]"), (11, "[define{inner}]"), 0, "nice", "weak", False),
        ("horizontal", (13, "[optional{a}]"), (13, "[required{b}]"), 0, "should", "weak", False),
        ("vertical", (15, "[define{e}]"), (16, "[color(red)]"), 0, "should", "weak", False),
    }
    assert {f.layout for f in result.forbids} == {"min lengths"}


def test_forbids_are_found_in_every_layout():
    result = check_program("example", ILLEGAL, seed=1)
    for layout in result.layouts:
        targeted = {where(f.contact) for f in result.forbids if f.layout == layout.name and f.contact.a.card.index == 0}
        assert ("vertical", (6, "[if]"), (7, "[dedent]"), 0) in targeted
        assert ("vertical", (10, "[set{y}to]"), (11, "[define{inner}]"), 0) in targeted


def test_legal_bundled_programs_agree_with_the_grammar():
    # In every layout of a legal program, neighbours and intended column
    # contacts are connect, and every other contact is connect (an inline
    # [call(…)] over another at 0), coexist or ungraded: never forbid alone.
    # The grammar allows everything a legal program puts on the table.
    for program in bundled_programs():
        if not program.legal:
            continue
        for layout in check_program("example", program.text).layouts:
            for pc in layout.contacts:
                kinds = {label.kind for label in pc.contact.labels}
                if pc.contact.axis == "horizontal" or pc.intended:
                    assert kinds == {"connect"}, (program.name, layout.name, where(pc))
                else:
                    assert kinds & {"connect", "coexist", "ungraded"}, (program.name, layout.name, where(pc))
