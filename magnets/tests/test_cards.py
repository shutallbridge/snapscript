"""Card texts resolve to exactly one class side."""

import re
from pathlib import Path

import pytest

from magnets import ProgramError, check, check_program

# Every card text in OVERVIEW_SPEC.md, by the class side it belongs to.
SPEC_CARDS = {
    "set.set": [
        "[set()to]", "[set(a)to]", "[set(b)to]", "[set(count)to]", "[set(empty)to]", "[set(f)to]",
        "[set(frame Count)to]", "[set(framecount)to]", "[set(frameCount)to]", "[set(n)to]", "[set(scores)to]",
        "[set(user)to]", "[set(width)to]", "[set(x)to]", "[set(y)to]", "[set(helper)to]", "[return]",
    ],
    "get.get": [
        "[get(a)]", "[get(app)]", "[get(b)]", "[get(count)]", "[get(done)]", "[get(helper)]", "[get(i)]",
        "[get(message)]", "[get(n)]", "[get(p5)]", "[get(s)]", "[get(score)]", "[get(scores)]",
        "[get(shapes.unit)]", "[get(shapes)]", "[get(title)]", "[get(user)]", "[get(width)]", "[get(x)]",
        "[get(y)]", "[get(empty)]", "[get(name)]", "[get(ready)]",
    ],
    "define.define": [
        "[define(…)]", "[define(a)]", "[define(b)]", "[define(draw)]", "[define(drawCircle)]", "[define(foo)]",
        "[define(greet)]", "[define(helper)]", "[define(setup)]", "[define(star)]", "[define(blob)]",
        "[define(dot)]", "[define(double)]", "[define(f)]", "[define(g)]", "[define(h)]", "[define(p5)]",
        "[define(print)]", "[define(show)]",
    ],
    "call.call": [
        "[call(circle)]", "[call(f)]", "[call(foo)]", "[call(greet)]", "[call(helper)]", "[call(p5.circle)]",
        "[call(double)]", "[call(run)]",
    ],
    "set_prop.set_prop": [
        "[setProp(…)to]", "[setProp(frameCount)to]", "[setProp(label)to]", "[setProp(message)to]", "[setProp(p)to]",
    ],
    "get_prop.get_prop": [
        "[getProp(…)]", "[getProp(b)]", "[getProp(greet)]", "[getProp(items)]", "[getProp(message)]",
        "[getProp(missing)]", "[getProp(name)]", "[getProp(p)]", "[getProp(unit)]", "[getProp(user)]",
    ],
    "required.required": [
        "[required(b)]", "[required(color)]", "[required(d)]", "[required(g)]", "[required(height)]",
        "[required(message)]", "[required(r)]", "[required(width)]", "[required(x)]", "[required(y)]",
        "[required(c)]", "[required(n)]", "[required(program)]", "[required(ready)]",
    ],
    "optional.optional": [
        "[optional(max)]", "[optional(min)]", "[optional(suffix)]", "[optional(title)]", "[optional(size)]",
    ],
    "literal.num": [
        "[num(-1)]", "[num(.5)]", "[num()]", "[num(…)]", "[num(0.5)]", "[num(0)]", "[num(1 000)]", "[num(1)]",
        "[num(10)]", "[num(100)]", "[num(1e5)]", "[num(2)]", "[num(20)]", "[num(25)]", "[num(3)]", "[num(30)]",
        "[num(4)]", "[num(40)]", "[num(5.)]", "[num(5)]", "[num(500)]", "[num(2.5)]", "[num(9)]",
    ],
    "literal.str": [
        "[str(__hi)]", "[str(_)]", "[str()]", "[str(…)]", "[str(Ada)]", "[str(hello world)]", "[str(hello_world)]",
        "[str(hello)]", "[str(hi)]", "[str(Mx)]", "[str(round_one)]", "[str(score)]", "[str(Welcome_user!)]",
        "[str(you_win)]", "[str(1)]", "[str(ab)]", "[str(anon)]", "[str(cd)]", "[str(done)]",
    ],
    "bool.true": ["[bool:true]"],
    "bool.false": ["[bool:false]"],
    "call_printed.call": [
        "[call:…]", "[call:append]", "[call:b]", "[call:dict]", "[call:f]", "[call:g]", "[call:getAt]",
        "[call:greet]", "[call:h]", "[call:len]", "[call:list]", "[call:p5.background]", "[call:p5.circle]",
        "[call:p5.createCanvas]", "[call:p5.random]", "[call:pop]", "[call:print]", "[call:random]", "[call:range]",
        "[call:setAt]", "[call:shapes.star]", "[call:star]", "[call:p5.circel]",
    ],
    "receiver_printed.receiver": ["[get:p5.frameCount]", "[root]"],
    "color.front": ["[color:midnightblue]", "[color:purple]", "[color:notacolour]", "[color:…]"],
    "none.none": ["[none]"],
    "block_head.head": ["[for(…)in]", "[for(i)in]", "[for(s)in]", "[for(x)in]", "[if]", "[repeat]"],
    "dedent.dedent": ["[dedent]"],
    "on.on": ["[on:…]", "[on:load]", "[on:stop]"],
    "operator.front": ["[*]", "[+]", "[<]", "[<=]", "[==]", "[and]"],
    "operator.back": ["[-]", "[/]", "[>]", "[>=]", "[!=]", "[or]"],
    "modulo.modulo": ["[%]"],
    "not.not": ["[not]"],
    "open_paren.open": ["[(]"],
    "close_paren.close": ["[)]"],
    "import.import": [
        "[import(./p5.snap)as(p5)]", "[import(./shapes.snap)]", "[import(./shapes.snap)as(shapes)]",
        "[import(…)as(…)]", "[import(http://snapscript.s12.space/mods/p5.snap)as(p5)]",
        "[import(./missing.snap)as(m)]",
    ],
    "extern.extern": [
        "[extern(…)]", "[extern(circle)]", "[extern(createCanvas)]", "[extern(fill)]", "[extern(random)]",
        "[extern(run)]",
    ],
    "global.global": [
        "[global(…)]", "[global(count)]", "[global(frameCount)]", "[global(x)]", "[global(mid)]", "[global(r)]",
        "[global(scores)]", "[global(speed)]", "[global(title)]", "[global(user)]",
    ],
}

# Bracketed text in the spec that is prose shorthand, not a card.
PROSE = {"[…]", "[define]", "[on:]"}

SPEC = Path(__file__).parents[2] / "OVERVIEW_SPEC.md"


def sides_of(cards):
    """The class side each card resolves to, one card per strip."""
    result = check_program("example", "\n\n".join(cards), draws=0)
    return [card.side for strip in result.program for line in strip for card in line.cards]


def test_the_list_holds_every_card_in_the_spec():
    # When the spec gains a card, add it to SPEC_CARDS.
    found = set(re.findall(r"\[[^\[\]]*\]", SPEC.read_text(encoding="utf-8"))) - PROSE
    listed = [card for cards in SPEC_CARDS.values() for card in cards]
    assert sorted(listed) == sorted(found)


@pytest.mark.parametrize("side", SPEC_CARDS)
def test_every_spec_card_resolves_to_its_side(side):
    assert sides_of(SPEC_CARDS[side]) == [side] * len(SPEC_CARDS[side])


def test_every_class_member_resolves_to_its_own_side():
    # A flip pair's back may share its front's pattern, as `[color:…]` does;
    # such a member resolves to the front.
    members = {}
    for name, s in check({}).sides.items():
        for m in s.side.members:
            members.setdefault(m, name)
    assert sides_of(list(members)) == list(members.values())


@pytest.mark.parametrize("card", ["[color:yellow]", "[color:midnightblue]", "[color:purple]", "[color:…]"])
def test_a_colour_resolves_to_the_front_of_its_flip_pair(card):
    assert sides_of([card]) == ["color.front"]


@pytest.mark.parametrize(
    "card, side",
    [
        ("[get(x)]", "get.get"),
        ("[get:x]", "receiver_printed.receiver"),
        ("[call(f)]", "call.call"),
        ("[call:f]", "call_printed.call"),
        ("[import(https://a.b/c.snap)as(c)]", "import.import"),
        ("[import(https://a.b/c.snap)]", "import.import"),
    ],
)
def test_overlapping_patterns_resolve_apart(card, side):
    assert sides_of([card]) == [side]


@pytest.mark.parametrize("card", ["[foo]", "[get]", "[call:]", "[num(1)(2)]", "[setx)to]", "[if ]"])
def test_an_unknown_card_is_a_clear_error(card):
    with pytest.raises(ProgramError) as err:
        check_program("example", f"[define(f)]\n[call:print]{card}")
    assert str(err.value) == f"line 2: unknown card {card}: it matches no card class"


def test_a_card_matching_two_sides_is_a_clear_error():
    line = {"left": "head", "right": "end", "top": "line", "bottom": "line"}
    classes = {
        "printed": {"min_length": 1, "pocket_reach": 1, "sides": {"call": {"[call:…]": line}}},
        "print": {"min_length": 1, "pocket_reach": 1, "sides": {"print": {"[call:print]": line}}},
    }
    with pytest.raises(ProgramError) as err:
        check_program({}, "[call:print]", class_data=classes)
    assert str(err.value) == "line 1: card [call:print] matches more than one class: printed.call, print.print"
