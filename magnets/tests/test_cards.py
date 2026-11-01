"""Card texts resolve to exactly one class side."""

import re
from pathlib import Path

import pytest

from magnets import ProgramError, check, check_program

# Every card text in REFERENCE.md and README.md, by the class side it belongs to.
SPEC_CARDS = {
    "simple_head.head": [
        "[return]", "[set{a}to]", "[set{b}to]", "[set{count}to]", "[set{empty}to]", "[set{frame Count}to]",
        "[set{frameCount}to]", "[set{framecount}to]", "[set{f}to]", "[set{helper}to]", "[set{n}to]", "[set{pi}to]", "[set{scores}to]",
        "[set{user}to]", "[set{width}to]", "[set{x}to]", "[set{y}to]", "[set{}to]",
    ],
    "get.get": [
        "[get(p5.frameCount)]", "[get(pi)]", "[get(x)]", "[get(y)]", "[get{app}]", "[get{a}]", "[get{b}]", "[get{c}]", "[get{count}]",
        "[get{done}]", "[get{empty}]", "[get{helper}]", "[get{i}]", "[get{message}]", "[get{name}]", "[get{n}]",
        "[get{p5}]", "[get{ready}]", "[get{scores}]", "[get{score}]", "[get{shapes.unit}]", "[get{shapes}]", "[get{s}]",
        "[get{title}]", "[get{user}]", "[get{width}]", "[get{x}]", "[get{y}]", "[root]",
    ],
    "define.define": [
        "[define(setup)]", "[define(star)]", "[define{a}]", "[define{blob}]", "[define{b}]", "[define{dot}]",
        "[define{double}]", "[define{drawCircle}]", "[define{draw}]", "[define{foo}]", "[define{f}]", "[define{greet}]",
        "[define{g}]", "[define{helper}]", "[define{h}]", "[define{p5}]", "[define{print}]", "[define{setup}]",
        "[define{show}]", "[define{…}]",
    ],
    "call.call": [
        "[call(abs)]", "[call(append)]", "[call(circle)]", "[call(cos)]", "[call(dict)]", "[call(getAt)]",
        "[call(len)]", "[call(list)]", "[call(max)]", "[call(min)]", "[call(p5.background)]", "[call(p5.circle)]",
        "[call(p5.createCanvas)]", "[call(pop)]", "[call(print)]", "[call(random)]", "[call(range)]", "[call(round)]",
        "[call(run)]", "[call(setAt)]", "[call(sin)]", "[call(sqrt)]", "[call(…)]", "[call{b}]", "[call{double}]",
        "[call{foo}]", "[call{f}]", "[call{greet}]", "[call{g}]", "[call{helper}]", "[call{h}]", "[call{p5.circel}]",
        "[call{p5.circle}]", "[call{random}]", "[call{shapes.star}]", "[call{star}]",
    ],
    "set_prop.set_prop": [
        "[setProp{frameCount}to]", "[setProp{label}to]", "[setProp{message}to]", "[setProp{p}to]", "[setProp{…}to]",
    ],
    "get_prop.get_prop": [
        "[getProp{b}]", "[getProp{greet}]", "[getProp{items}]", "[getProp{message}]", "[getProp{missing}]",
        "[getProp{name}]", "[getProp{p}]", "[getProp{unit}]", "[getProp{user}]", "[getProp{…}]",
    ],
    "required.required": [
        "[required(angle)]", "[required(b)]", "[required(c)]", "[required(color)]", "[required(d)]", "[required(g)]",
        "[required(height)]", "[required(program)]", "[required(r)]", "[required(width)]", "[required(x)]",
        "[required(x1)]", "[required(x2)]", "[required(y)]", "[required(y1)]", "[required(y2)]",
        "[required{message}]", "[required{n}]", "[required{ready}]",
    ],
    "optional.optional": [
        "[optional{size}]", "[optional{suffix}]", "[optional{title}]",
    ],
    "literal.num": [
        "[num(0)]", "[num(5)]", "[num{-1}]", "[num{-2.5}]", "[num{-5}]", "[num{.5}]", "[num{0.5}]", "[num{0}]", "[num{1 000}]",
        "[num{100}]", "[num{10}]", "[num{16}]", "[num{180}]", "[num{1e5}]", "[num{1}]", "[num{2.4}]", "[num{2.5}]", "[num{20}]", "[num{25}]", "[num{2}]",
        "[num{30}]", "[num{3}]", "[num{40}]", "[num{4}]", "[num{5.}]", "[num{500}]", "[num{5}]", "[num{90}]", "[num{9}]", "[num{}]",
        "[num{…}]",
    ],
    "literal.str": [
        "[str{1}]", "[str{Ada}]", "[str{Mx}]", "[str{Welcome_user!}]", "[str{__hi}]", "[str{_}]", "[str{a}]",
        "[str{ab}]", "[str{anon}]", "[str{b}]", "[str{cd}]", "[str{close}]", "[str{done}]", "[str{hello world}]",
        "[str{hello_world}]", "[str{hello}]", "[str{hi}]", "[str{lose}]", "[str{neither}]", "[str{round_one}]",
        "[str{score}]", "[str{wait}]", "[str{win}]", "[str{you_win}]", "[str{}]", "[str{…}]",
    ],
    "bool.true": ["[bool(true)]"],
    "bool.false": ["[bool(false)]"],
    "color.front": ["[color(midnightblue)]", "[color(notacolor)]", "[color(purple)]", "[color(…)]"],
    "none.none": ["[none]"],
    "block_head.head": ["[for{i}in]", "[for{s}in]", "[for{x}in]", "[for{…}in]", "[if]", "[repeat]"],
    "elif.elif": ["[elif]"],
    "else.else": ["[else]"],
    "dedent.dedent": ["[dedent]"],
    "on.on": ["[on(load)]", "[on(stop)]", "[on(…)]"],
    "operator.front": ["[*]", "[+]", "[<=]", "[<]", "[==]", "[and]"],
    "operator.back": ["[!=]", "[-]", "[/]", "[>=]", "[>]", "[or]"],
    "modulo.modulo": ["[%]"],
    "not.not": ["[not]"],
    "open_paren.open": ["[(]"],
    "close_paren.close": ["[)]"],
    "import.import": [
        "[import(./missing.snap)as(m)]", "[import(./shapes.snap)]", "[import(./shapes.snap)as(shapes)]",
        "[import(snapscript-p5)]", "[import(snapscript-p5)as(p5)]", "[import(…)as(…)]",
    ],
    "extern.extern": [
        "[extern(circle)]", "[extern(createCanvas)]", "[extern(dist)]", "[extern(fill)]", "[extern(rotate)]",
        "[extern(run)]", "[extern(…)]",
    ],
    "global.global": [
        "[global(frameCount)]", "[global{count}]", "[global{mid}]", "[global{r}]", "[global{scores}]",
        "[global{speed}]", "[global{title}]", "[global{user}]", "[global{x}]", "[global{…}]",
    ],
}

# Bracketed text in the spec that is prose shorthand, not a card.
PROSE = {"[…]", "[define]"}

SPECS = [Path(__file__).parents[2] / name for name in ("REFERENCE.md", "README.md")]


def sides_of(cards):
    """The class side each card resolves to, one card per strip."""
    result = check_program("example", "\n\n".join(cards), draws=0)
    return [card.side for strip in result.program for line in strip for card in line.cards]


def test_the_list_holds_every_card_in_the_spec():
    # When the spec gains a card, add it to SPEC_CARDS.
    found = {card for spec in SPECS for card in re.findall(r"\[[^\[\]]*\]", spec.read_text(encoding="utf-8"))} - PROSE
    listed = [card for cards in SPEC_CARDS.values() for card in cards]
    assert sorted(listed) == sorted(found)


@pytest.mark.parametrize("side", SPEC_CARDS)
def test_every_spec_card_resolves_to_its_side(side):
    assert sides_of(SPEC_CARDS[side]) == [side] * len(SPEC_CARDS[side])


def test_every_class_member_resolves_to_its_own_side():
    # A flip pair's back may share its front's pattern, as `[color(…)]` does;
    # such a member resolves to the front.
    members = {}
    for name, s in check({}).sides.items():
        for m in s.side.members:
            members.setdefault(m, name)
    assert sides_of(list(members)) == list(members.values())


@pytest.mark.parametrize("card", ["[color(yellow)]", "[color(midnightblue)]", "[color(purple)]", "[color(…)]"])
def test_a_color_resolves_to_the_front_of_its_flip_pair(card):
    assert sides_of([card]) == ["color.front"]


@pytest.mark.parametrize(
    "card, side",
    [
        ("[import(snapscript-p5)as(p5)]", "import.import"),
        ("[import(snapscript-p5)]", "import.import"),
        ("[import(https://a.b/c.snap)as(c)]", "import.import"),
        ("[import(https://a.b/c.snap)]", "import.import"),
    ],
)
def test_an_import_names_a_package_or_a_url(card, side):
    assert sides_of([card]) == [side]


@pytest.mark.parametrize(
    "printed, handwritten, side",
    [
        ("[define(setup)]", "[define{setup}]", "define.define"),
        ("[call(p5.circle)]", "[call{f}]", "call.call"),
        ("[get(p5.frameCount)]", "[get{x}]", "get.get"),
        ("[required(x)]", "[required{x}]", "required.required"),
        ("[num(0)]", "[num{0}]", "literal.num"),
        ("[set(x)to]", "[set{x}to]", "simple_head.head"),
        ("[on(load)]", "[on{load}]", "on.on"),
        ("[import(a)as(b)]", "[import{a}as{b}]", "import.import"),
        # The card's own text, too, reads the same in either bracket.
        ("[bool(true)]", "[bool{true}]", "bool.true"),
    ],
)
def test_a_card_resolves_to_its_class_whichever_bracket_it_uses(printed, handwritten, side):
    # A printed card and the same card handwritten mean the same thing, so
    # they share one card design: one class, one set of magnets.
    assert sides_of([printed, handwritten]) == [side, side]


@pytest.mark.parametrize(
    "card",
    [
        "[foo]", "[get]", "[call(f)(g)]", "[num{1}{2}]", "[setx}to]", "[if ]", "[get(x}]", "[import(a)as{b}]",
        "[call:print]", "[get:x]", "[bool:true]", "[color:red]", "[on:load]",
    ],
)
def test_an_unknown_card_is_a_clear_error(card):
    with pytest.raises(ProgramError) as err:
        check_program("example", f"[define{{f}}]\n[call(print)]{card}")
    assert str(err.value) == f"line 2: unknown card {card}: it matches no card class"


def test_a_card_matching_two_sides_is_a_clear_error():
    line = {"left": "head", "right": "end", "top": "line", "bottom": "line"}
    classes = {
        "any": {"id": 0, "min_length": 1, "pocket_reach": 1, "sides": {"call": {"[call(…)]": line}}},
        "print": {"id": 1, "min_length": 1, "pocket_reach": 1, "sides": {"print": {"[call(print)]": line}}},
    }
    with pytest.raises(ProgramError) as err:
        check_program({}, "[call(print)]", class_data=classes)
    assert str(err.value) == "line 1: card [call(print)] matches more than one class: any.call, print.print"
