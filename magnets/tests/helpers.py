"""Builders for hand-made arrangements and lookups into check results."""

import copy
from importlib import resources

import yaml
from hypothesis import strategies as st

from magnets import CheckResult, ContactGroup, check

SET_GET = {"set_get.set", "set_get.get"}


def bundled_classes():
    """The bundled card class data, as a mapping to change and pass as `class_data`."""
    return yaml.safe_load((resources.files("magnets") / "data" / "classes.yaml").read_text(encoding="utf-8"))


def _old_pairs():
    """The bundled classes with simple_head and get, define and call, set_prop
    and get_prop, and required and optional joined into flip pairs whose sides
    take different roles: set_get, define_call, prop and param. `[return]`
    is left out, so `[set{x}to]` pairs with `[get{x}]` on a front side named
    set, and so is `[root]`, so each back has its front's one member."""
    classes = bundled_classes()
    head = classes["simple_head"]
    del head["sides"]["head"]["[return]"]
    head["sides"] = {"set": head["sides"].pop("head")}
    pairs = {
        "set_get": ("simple_head", "get"),
        "define_call": ("define", "call"),
        "prop": ("set_prop", "get_prop"),
        "param": ("required", "optional"),
    }
    joined = {}
    for name, (front, back) in pairs.items():
        front, back = classes.pop(front), classes.pop(back)
        back["sides"] = {side: dict(list(members.items())[:1]) for side, members in back["sides"].items()}
        joined[name] = {**front, "flip_pair": True, "sides": {**front["sides"], **back["sides"]}}
    return {**joined, **classes}


# Toy class data that keeps flip pairs with different roles on each side, so
# the flip's physics and unavoidable leaks stay tested: the real grammar has
# none (ADR 0003).
TOY_PAIRS = _old_pairs()


def pair_classes():
    """A copy of TOY_PAIRS, to change and pass as `class_data`."""
    return copy.deepcopy(TOY_PAIRS)


def check_pairs(arrangement=None, **options):
    """`check` against the toy TOY_PAIRS class data, unless given other `class_data`."""
    options.setdefault("class_data", TOY_PAIRS)
    return check({} if arrangement is None else arrangement, **options)


def arrangement(flip="top_bottom", **classes):
    """An arrangement holding the given classes' fronts, e.g. `set_get={"top": [...]}`.

    Pockets are written as `(from, at, layers)` on top/bottom edges and
    `(at, layers)` on left/right edges.
    """
    return {"flip": flip, "classes": {name: _edges(edges) for name, edges in classes.items()}}


def set_get(flip="top_bottom", **edges):
    """An arrangement holding only the set_get class, with the given edges."""
    return arrangement(flip, set_get=edges)


def _edges(edges):
    authored = {}
    for edge, pockets in edges.items():
        if edge in ("top", "bottom"):
            authored[edge] = [{"from": f, "at": at, "layers": ly} for f, at, ly in pockets]
        else:
            authored[edge] = [{"at": at, "layers": ly} for at, ly in pockets]
    return authored


def stack(result: CheckResult, upper: str, lower: str, offset: float = 0) -> ContactGroup:
    """The vertical contact with `upper` over `lower` (side names like 'set')."""
    return over(result, f"set_get.{upper}", f"set_get.{lower}", offset)


def over(result: CheckResult, upper: str, lower: str, offset: float = 0) -> ContactGroup:
    """The vertical contact with `upper` over `lower` (sides like 'set_get.set'),
    where exactly one has this offset."""
    found = [
        c
        for c in result.groups
        if c.axis == "vertical" and c.a == upper and c.b == lower and c.offset == offset
    ]
    assert len(found) == 1, found
    return found[0]


def beside(result: CheckResult, left: str, right: str, offset: float = 0) -> ContactGroup:
    """The horizontal contact `[left][right]` (sides like 'set_get.set')."""
    found = [
        c
        for c in result.groups
        if c.axis == "horizontal" and c.a == left and c.b == right and c.offset == offset
    ]
    assert len(found) == 1, found
    return found[0]


LAYER_PAIRS = [f"{p}/{q}" for p in "NSF-" for q in "NSF-" if (p, q) != ("-", "-")]
ANCHORED = [(f, at) for f in ("left", "right") for at in (0.25, 0.5, 0.75)]


@st.composite
def top_bottom_pockets(draw):
    """Up to two pockets for a top or bottom edge with a 1U pocket reach, as `(from, at, layers)`.

    No two collide on a class 2U at its shortest: their distances add up to 1.5U at most.
    """
    places = draw(st.lists(st.sampled_from(ANCHORED), max_size=2, unique=True))
    return [(f, at, draw(st.sampled_from(LAYER_PAIRS))) for f, at in places]


@st.composite
def left_right_pockets(draw):
    """Up to three pockets for a left or right edge, as `(at, layers)`."""
    heights = draw(st.lists(st.sampled_from([0.25, 0.5, 0.75]), max_size=3, unique=True))
    return [(h, draw(st.sampled_from(LAYER_PAIRS))) for h in heights]
