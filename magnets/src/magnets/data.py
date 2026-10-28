"""Card classes, grammar rules and arrangements, loaded from YAML and validated."""

from dataclasses import dataclass, replace
from fractions import Fraction
from functools import cache
from importlib import resources
from pathlib import Path
from typing import Any, Mapping

import math
import re

import yaml

from .physics import EDGES, FLIPS, LAYERS, LEFT_RIGHT_EDGES, POSITIONS, Edges, Pocket, on_grid, u_text

MAX_POCKETS = {"top": 2, "bottom": 2, "left": 3, "right": 3}


class ArrangementError(ValueError):
    """A magnet arrangement that no physical card could have."""


class DataError(ValueError):
    """Card class or grammar rule data that is malformed or contradicts itself."""


@dataclass(frozen=True)
class Side:
    """One printed face of a card class, with its edge roles."""

    name: str  # "class.side", e.g. "literal.num"
    members: tuple[str, ...]  # every card on this side, in notation
    roles: Mapping[str, str]  # edge -> role

    @property
    def notation(self) -> str:
        """The first member, which names the side in reports."""
        return self.members[0]

    def matches(self, card: str) -> bool:
        """Whether a card's notation text is one of this side's members."""
        return any(_match(card, m) for m in self.members)


# In a member's notation, anything in `{…}` stands for handwriting and a
# `(…)` for printed or typed text; other text in `()`, such as `[bool(true)]`'s,
# is the card's own. A card matches whichever bracket it uses, as long as
# every bracket on it is the same: `[get{x}]` matches `[get{score}]` and
# `[get(p5.frameCount)]`, but not `[get(score}]`, and `[bool(true)]` matches
# `[bool{true}]`. Bracketed text holds no brackets, so `[import(…)]` never
# matches `[import(…)as(…)]`.
_BRACKETED = re.compile(r"\{([^{}]*)\}|\(([^()]*)\)")
_TEXT = r"[^(){}\[\]]*"
_BRACKETS = {"handwritten": ("{", "}"), "printed": ("(", ")")}


def _written(found: re.Match) -> str | None:
    """The member's own text in a bracket, or None where the card's text goes."""
    own = found.group(2)
    return None if own is None or own == "…" else own


@cache
def _member_patterns(member: str) -> dict[str, re.Pattern]:
    """The member's pattern for a handwritten card and for a printed one."""
    patterns = {}
    for form, (opening, closing) in _BRACKETS.items():
        parts, last = [], 0
        for found in _BRACKETED.finditer(member):
            own = _written(found)
            inner = f"({_TEXT})" if own is None else re.escape(own)
            parts += [re.escape(member[last : found.start()] + opening), inner, re.escape(closing)]
            last = found.end()
        patterns[form] = re.compile("".join(parts) + re.escape(member[last:]))
    return patterns


def _match(card: str, member: str) -> tuple[str, re.Match] | None:
    """The card's form, handwritten or printed, and the text it holds where
    the member takes one, if the card is this member."""
    return next(
        ((form, found) for form, pattern in _member_patterns(member).items() if (found := pattern.fullmatch(card))),
        None,
    )


def carry_over(card: str, side: Side, other: Side) -> str:
    """The card as written on `other`, the other side of the same card, in
    the card's bracket: the member at the same place on `other`, filled with
    the card's handwriting, in order. `[str{500}]` on literal's front is
    `[num{500}]`, and `[/]` on operator's is `[*]`. Printed text is the kit's,
    not carried over: `[color(yellow)]`'s back is `[color(…)]`, a color the
    kit picks."""
    place, (form, match) = next((i, matched) for i, m in enumerate(side.members) if (matched := _match(card, m)))
    opening, closing = _BRACKETS[form]
    handwriting = list(match.groups()) if form == "handwritten" else []
    filled, last = [], 0
    target = other.members[place]
    for found in _BRACKETED.finditer(target):
        own = _written(found)
        text = own if own is not None else handwriting.pop(0) if handwriting else "…"
        filled += [target[last : found.start()], opening, text, closing]
        last = found.end()
    return "".join(filled) + target[last:]


def matching_sides(card: str, classes: Mapping[str, "CardClass"]) -> list[Side]:
    """The side of each class the card's notation text belongs to: a text
    that matches both sides of a flip pair, such as `[color(yellow)]`, takes
    the front."""
    return [side for cls in classes.values() if (side := next((s for s in cls.sides if s.matches(card)), None))]


@dataclass(frozen=True)
class CardClass:
    name: str
    min_length: int  # the shortest card, in U
    pocket_reach: int  # a top or bottom pocket sits less than this from its end, in U
    sides: tuple[Side, ...]  # front first; a flip pair's back second

    @property
    def front(self) -> Side:
        return self.sides[0]


@dataclass(frozen=True)
class HorizontalRules:
    connect: Mapping[str, frozenset[str]]  # right role -> left roles it connects to at offset 0
    forbid: str  # priority of every other pair at offset 0
    off_line: str  # priority at any other offset


@dataclass(frozen=True)
class PriorityRule:
    """A forbid priority for the vertical pairs it matches; None matches any."""

    upper: str | None
    lower: str | None
    offset: Fraction | None
    priority: str

    def matches(self, upper: str, lower: str, offset: Fraction) -> bool:
        return (
            self.upper in (None, upper)
            and self.lower in (None, lower)
            and self.offset in (None, offset)
        )


@dataclass(frozen=True)
class Coexist:
    never: frozenset[str]  # facing roles (bottom or top) that never coexist
    line_heads: frozenset[str]  # top roles of a card that can head a line
    not_inline: frozenset[str]  # left roles of a card that cannot sit inline
    indents: frozenset[str]  # bottom roles whose next line head sits 1U right
    outdents: frozenset[str]  # top roles of a line head that sits 1U left of the line above
    shortest_head: int | None = None  # U: the shortest class that can head a line; set by `for_classes`
    shortest_block: int | None = None  # U: the shortest class whose bottom role indents, if any

    def for_classes(self, classes: Mapping[str, "CardClass"]) -> "Coexist":
        """This rule, knowing how short the line heads of `classes` can be."""
        sides = [(cls.min_length, side) for cls in classes.values() for side in cls.sides]
        heads = [length for length, side in sides if side.roles["top"] in self.line_heads]
        blocks = [length for length, side in sides if side.roles["bottom"] in self.indents]
        return replace(self, shortest_head=min(heads, default=1), shortest_block=min(blocks, default=None))

    def applies(self, upper: Side, lower: Side, offset: Fraction) -> bool:
        """Whether a legal program can put `upper` over `lower` at `offset`.

        The next line head sits in the same column, 1U right after a block
        head, or 1U left only for a [dedent], which has no inline cards. An
        inline card sits at least `shortest_head` right of its line head, so
        a line head meets an inline card below only at +`shortest_head` or
        more (1U more after a block head). An inline card meets a line head
        below at -`shortest_head` or less; if its own line head is a block
        head, the next line is indented, so at 1 - `shortest_block` or less.
        It meets a [dedent] 1U further left. Two inline cards meet at any
        offset. Connect pairs are left out by the caller.
        """
        if self.shortest_head is None:
            raise ValueError("coexist needs the card classes' lengths: fit the rules with `for_classes`")
        bottom, top = upper.roles["bottom"], lower.roles["top"]
        if offset.denominator != 1 or bottom in self.never or top in self.never:
            return False
        upper_can_head, lower_can_head = (s.roles["top"] in self.line_heads for s in (upper, lower))
        upper_inline, lower_inline = (s.roles["left"] not in self.not_inline for s in (upper, lower))
        return (
            (upper_can_head and lower_inline and offset >= self.shortest_head + (bottom in self.indents))
            or (upper_inline and lower_can_head and offset <= self._most_right_head_below(top, self.shortest_head))
            or (upper_inline and lower_inline)
        )

    def _most_right_head_below(self, top: str, shortest_head: int) -> int:
        """The largest offset at which a line head below, with this top role,
        meets an inline card above."""
        if top in self.outdents:
            return -shortest_head - 1
        if self.shortest_block is None:
            return -shortest_head
        return max(-shortest_head, 1 - self.shortest_block)


@dataclass(frozen=True)
class VerticalRules:
    offsets: frozenset[Fraction]  # the meaningful offsets
    connect: frozenset[tuple[str, str, Fraction]]  # (upper bottom, lower top, offset)
    priorities: tuple[PriorityRule, ...]
    forbid: str  # priority of every other pair at a meaningful offset
    off_line: str  # priority at any other offset
    ungraded: frozenset[str]  # facing roles (bottom or top) that are not graded
    coexist: Coexist

    def verdict(self, upper: str, lower: str, offset: Fraction) -> tuple[str, str]:
        """(kind, priority) for an upper bottom role over a lower top role,
        before coexist."""
        if upper in self.ungraded or lower in self.ungraded:
            return "ungraded", "info"
        if (upper, lower, offset) in self.connect:
            return "connect", "must"
        if offset not in self.offsets:
            return "forbid", self.off_line
        for rule in self.priorities:
            if rule.matches(upper, lower, offset):
                return "forbid", rule.priority
        return "forbid", self.forbid


@dataclass(frozen=True)
class Rules:
    roles: Mapping[str, tuple[str, ...]]  # edge -> its roles
    priorities: Mapping[str, int]  # forbid priority -> weight
    horizontal: HorizontalRules
    vertical: VerticalRules

    def for_classes(self, classes: Mapping[str, "CardClass"]) -> "Rules":
        """These rules, with coexist knowing how short the line heads of `classes` can be."""
        coexist = self.vertical.coexist.for_classes(classes)
        return replace(self, vertical=replace(self.vertical, coexist=coexist))


@dataclass(frozen=True)
class Arrangement:
    """A magnet arrangement: the flip and every class's front edges."""

    name: str
    flip: str
    fronts: Mapping[str, Edges]  # class -> edge -> pockets

    def magnets(self, name: str) -> int:
        """The magnets in one card of a class: its back shares its front's."""
        return sum(p.magnets for pockets in self.fronts.get(name, {}).values() for p in pockets)

    def to_dict(self) -> dict:
        classes = {
            cls: {edge: [p.to_dict() for p in pockets] for edge, pockets in edges.items() if pockets}
            for cls, edges in self.fronts.items()
        }
        return {"flip": self.flip, "classes": classes}


def _data():
    return resources.files("magnets") / "data"


def _read_yaml(source) -> Any:
    with source.open(encoding="utf-8") as f:
        return yaml.safe_load(f)


def load_rules(source: str | Path | Mapping | None = None) -> Rules:
    """The grammar rules: the bundled ones, or from a YAML file or mapping."""
    if source is None:
        return _bundled_rules()
    return _parse_rules(_read_data(source, "rules"))


def load_classes(source: str | Path | Mapping | None = None, *, grammar: Rules) -> Mapping[str, CardClass]:
    """The card classes, their roles checked against `grammar`: the bundled
    classes, or from a YAML file or mapping."""
    if source is not None:
        return _parse_classes(_read_data(source, "classes"), grammar)
    if grammar is _bundled_rules():
        return _bundled_classes()
    return _parse_classes(_bundled("classes"), grammar)


@cache
def _bundled_rules() -> Rules:
    return _parse_rules(_bundled("rules"))


@cache
def _bundled_classes() -> Mapping[str, CardClass]:
    return _parse_classes(_bundled("classes"), _bundled_rules())


def _bundled(name: str) -> Any:
    return _read_yaml(_data() / f"{name}.yaml")


def _read_data(source: str | Path | Mapping, what: str) -> Any:
    if isinstance(source, Mapping):
        return source
    path = Path(source)
    if not path.is_file():
        raise DataError(f"{what} file not found: {path}")
    try:
        return _read_yaml(path)
    except yaml.YAMLError as err:
        raise DataError(f"{path} is not valid YAML: {err}") from err


def _parse_rules(raw: Any) -> Rules:
    if not isinstance(raw, Mapping):
        raise DataError("rules must be a mapping with `roles`, `priorities`, `horizontal` and `vertical`")
    _no_extra_keys(raw, {"roles", "priorities", "horizontal", "vertical"}, "rules", DataError)
    roles = _parse_roles(raw.get("roles"))
    priorities = raw.get("priorities")
    if not isinstance(priorities, Mapping) or not all(_is_whole(w) and w >= 0 for w in priorities.values()):
        raise DataError("rules: `priorities` must map each forbid priority to a whole-number weight")
    return Rules(
        roles=roles,
        priorities=dict(priorities),
        horizontal=_parse_horizontal(raw.get("horizontal"), roles, priorities),
        vertical=_parse_vertical(raw.get("vertical"), roles, priorities),
    )


def _parse_roles(raw: Any) -> dict[str, tuple[str, ...]]:
    if not isinstance(raw, Mapping):
        raise DataError("rules: `roles` must map each edge to its roles")
    _no_extra_keys(raw, set(EDGES), "rules: roles", DataError)
    roles = {}
    for edge in EDGES:
        listed = raw.get(edge)
        if not isinstance(listed, list) or not listed or len(set(listed)) != len(listed):
            raise DataError(f"rules: roles.{edge} must be a list of distinct roles")
        roles[edge] = tuple(str(r) for r in listed)
    return roles


def _parse_horizontal(raw: Any, roles: Mapping[str, tuple[str, ...]], priorities: Mapping) -> HorizontalRules:
    where = "rules: horizontal"
    if not isinstance(raw, Mapping):
        raise DataError(f"{where} must be a mapping with `connect`, `forbid` and `off_line`")
    _no_extra_keys(raw, {"connect", "forbid", "off_line"}, where, DataError)
    connect = raw.get("connect")
    if not isinstance(connect, Mapping):
        raise DataError(f"{where}.connect must map each right role to the left roles it connects to")
    _no_extra_keys(connect, set(roles["right"]), f"{where}.connect", DataError)
    parsed = {}
    for right in roles["right"]:
        if right not in connect:
            raise DataError(f"{where}.connect: right role {right!r} is missing")
        lefts = connect[right] or []
        if not isinstance(lefts, list):
            raise DataError(f"{where}.connect.{right}: expected a list of left roles, not {lefts!r}")
        unknown = [left for left in lefts if left not in roles["left"]]
        if unknown:
            raise DataError(f"{where}.connect.{right}: unknown left role(s) {unknown}")
        parsed[right] = frozenset(lefts)
    for key in ("forbid", "off_line"):
        if raw.get(key) not in priorities:
            raise DataError(f"{where}.{key}: priority {raw.get(key)!r} is not one of {', '.join(priorities)}")
    return HorizontalRules(connect=parsed, forbid=raw["forbid"], off_line=raw["off_line"])


def _parse_vertical(raw: Any, roles: Mapping[str, tuple[str, ...]], priorities: Mapping) -> VerticalRules:
    where = "rules: vertical"
    keys = {"offsets", "connect", "priorities", "forbid", "off_line", "ungraded", "coexist"}
    if not isinstance(raw, Mapping):
        raise DataError(f"{where} must be a mapping with {', '.join(f'`{k}`' for k in sorted(keys))}")
    _no_extra_keys(raw, keys, where, DataError)
    facing = set(roles["bottom"]) | set(roles["top"])
    offsets = raw.get("offsets")
    if not isinstance(offsets, list) or not offsets or not all(_is_whole(d) for d in offsets):
        raise DataError(f"{where}.offsets must be a list of whole-U offsets")
    offsets = frozenset(Fraction(d) for d in offsets)
    for key in ("forbid", "off_line"):
        if raw.get(key) not in priorities:
            raise DataError(f"{where}.{key}: priority {raw.get(key)!r} is not one of {', '.join(priorities)}")
    ungraded = _role_list(raw.get("ungraded") or [], facing, f"{where}.ungraded")

    connect = set()
    for r in _rule_list(raw.get("connect"), {"upper", "lower", "offset"}, f"{where}.connect"):
        rule = _vertical_pair(r, roles, offsets, f"{where}.connect", required=True)
        if rule[0] in ungraded or rule[1] in ungraded:
            raise DataError(f"{where}.connect: {dict(r)} names an ungraded role")
        connect.add(rule)

    rules = []
    for r in _rule_list(raw.get("priorities") or [], {"upper", "lower", "offset", "priority"}, f"{where}.priorities"):
        upper, lower, offset = _vertical_pair(r, roles, offsets, f"{where}.priorities", required=False)
        if r.get("priority") not in priorities:
            raise DataError(
                f"{where}.priorities: {dict(r)}: priority {r.get('priority')!r} is not one of {', '.join(priorities)}"
            )
        rules.append(PriorityRule(upper, lower, offset, r["priority"]))
    # Every pair at a meaningful offset resolves to exactly one verdict.
    for upper in roles["bottom"]:
        for lower in roles["top"]:
            if upper in ungraded or lower in ungraded:
                continue
            for offset in sorted(offsets):
                matched = [r for r in rules if r.matches(upper, lower, offset)]
                if (upper, lower, offset) in connect and matched:
                    raise DataError(f"{where}: {upper} over {lower} @{u_text(offset)} is both connect and forbid")
                if len(matched) > 1:
                    raise DataError(f"{where}.priorities: {upper} over {lower} @{u_text(offset)} matches more than one rule")

    coexist = raw.get("coexist")
    coexist_keys = {"never", "line_heads", "not_inline", "indents", "outdents"}
    if not isinstance(coexist, Mapping):
        raise DataError(f"{where}.coexist must be a mapping with {', '.join(f'`{k}`' for k in sorted(coexist_keys))}")
    _no_extra_keys(coexist, coexist_keys, f"{where}.coexist", DataError)
    return VerticalRules(
        offsets=offsets,
        connect=frozenset(connect),
        priorities=tuple(rules),
        forbid=raw["forbid"],
        off_line=raw["off_line"],
        ungraded=ungraded,
        coexist=Coexist(
            never=_role_list(coexist.get("never") or [], facing, f"{where}.coexist.never"),
            line_heads=_role_list(coexist.get("line_heads") or [], set(roles["top"]), f"{where}.coexist.line_heads"),
            not_inline=_role_list(coexist.get("not_inline") or [], set(roles["left"]), f"{where}.coexist.not_inline"),
            indents=_role_list(coexist.get("indents") or [], set(roles["bottom"]), f"{where}.coexist.indents"),
            outdents=_role_list(coexist.get("outdents") or [], set(roles["top"]), f"{where}.coexist.outdents"),
        ),
    )


def _rule_list(raw: Any, keys: set[str], where: str) -> list[Mapping]:
    if not isinstance(raw, list) or not all(isinstance(r, Mapping) for r in raw):
        raise DataError(f"{where} must be a list of rules")
    for r in raw:
        _no_extra_keys(r, keys, f"{where}: {dict(r)}", DataError)
    return raw


def _vertical_pair(
    r: Mapping, roles: Mapping[str, tuple[str, ...]], offsets: frozenset[Fraction], where: str, *, required: bool
) -> tuple:
    for key, edge in (("upper", "bottom"), ("lower", "top")):
        if (required or key in r) and r.get(key) not in roles[edge]:
            raise DataError(f"{where}: {dict(r)}: {key} {r.get(key)!r} is not one of the {edge} roles")
    if required or "offset" in r:
        if not _is_whole(r.get("offset")) or Fraction(r["offset"]) not in offsets:
            raise DataError(f"{where}: {dict(r)}: offset {r.get('offset')!r} is not one of the vertical offsets")
    offset = Fraction(r["offset"]) if "offset" in r else None
    return r.get("upper"), r.get("lower"), offset


def _role_list(raw: Any, known: set[str], where: str) -> frozenset[str]:
    if not isinstance(raw, list) or any(role not in known for role in raw):
        raise DataError(f"{where} must be a list of roles from: {', '.join(sorted(known))}")
    return frozenset(raw)


def _is_whole(x: Any) -> bool:
    return isinstance(x, int) and not isinstance(x, bool)


def _parse_classes(raw: Any, grammar: Rules) -> dict[str, CardClass]:
    if not isinstance(raw, Mapping) or not raw:
        raise DataError("card classes must be a mapping of class names to classes")
    classes = {str(name): _parse_class(str(name), spec, grammar) for name, spec in raw.items()}
    # A member may be on both sides of one flip pair, as `[color(…)]` is, but
    # not in two classes.
    owners: dict[str, tuple[str, str]] = {}  # member -> (class, side) it is first on
    for cls in classes.values():
        for side in cls.sides:
            for member in side.members:
                owner, first = owners.setdefault(member, (cls.name, side.name))
                if owner != cls.name:
                    raise DataError(f"{member} is a member of both {first} and {side.name}")
    return classes


def _parse_class(name: str, spec: Any, grammar: Rules) -> CardClass:
    if not isinstance(spec, Mapping):
        raise DataError(f"{name}: expected a mapping with `min_length`, `pocket_reach` and `sides`")
    _no_extra_keys(spec, {"min_length", "pocket_reach", "flip_pair", "sides"}, name, DataError)
    min_length = _whole_u(spec.get("min_length"), 1, None)
    if min_length is None:
        raise DataError(f"{name}: `min_length` must be a whole number of U, at least 1")
    reach = _whole_u(spec.get("pocket_reach"), 1, min_length)
    if reach is None:
        raise DataError(f"{name}: `pocket_reach` must be a whole number of U, from 1 to `min_length` {min_length}")
    flip_pair = spec.get("flip_pair", False)
    if not isinstance(flip_pair, bool):
        raise DataError(f"{name}: `flip_pair` must be true or false")
    sides = spec.get("sides")
    if not isinstance(sides, Mapping):
        raise DataError(f"{name}: `sides` must map side names to their members")
    if flip_pair and len(sides) != 2:
        raise DataError(f"{name}: a flip pair defines two sides (front and back), not {len(sides)}")
    if not flip_pair and len(sides) != 1:
        raise DataError(f"{name}: a class that is not a flip pair defines one side, not {len(sides)}")
    parsed = tuple(_parse_side(f"{name}.{side}", members, grammar) for side, members in sides.items())
    if flip_pair and len(parsed[0].members) != len(parsed[1].members):
        front, back = sides
        raise DataError(
            f"{name}: a flip pair's sides pair their members in order, but {front} has "
            f"{len(parsed[0].members)} and {back} has {len(parsed[1].members)}"
        )
    return CardClass(name=name, min_length=min_length, pocket_reach=reach, sides=parsed)


def _whole_u(raw: Any, least: int, most: int | None) -> int | None:
    """`raw` if it is a whole number of U from `least` to `most`, else None."""
    if isinstance(raw, bool) or not isinstance(raw, int) or raw < least or (most is not None and raw > most):
        return None
    return raw


def _parse_side(name: str, raw: Any, grammar: Rules) -> Side:
    if not isinstance(raw, Mapping) or not raw:
        raise DataError(f"{name}: expected a mapping of member cards (in notation) to their roles")
    for card in raw:
        if not re.fullmatch(r"\[[^\[\]]+\]", str(card)):
            raise DataError(f"{name}: member {card!r} is not a card in notation, like [get{{x}}]")
    members = {str(card): _parse_member_roles(f"{name} {card}", roles, grammar) for card, roles in raw.items()}
    (first, roles), *others = members.items()
    for card, other in others:
        for edge in EDGES:
            if other[edge] != roles[edge]:
                raise DataError(
                    f"{name}: members disagree on roles: {first} has {edge} {roles[edge]}, "
                    f"{card} has {edge} {other[edge]}"
                )
    return Side(name=name, members=tuple(members), roles=roles)


def _parse_member_roles(where: str, raw: Any, grammar: Rules) -> dict[str, str]:
    if not isinstance(raw, Mapping):
        raise DataError(f"{where}: expected a mapping of edges to roles")
    _no_extra_keys(raw, set(EDGES), where, DataError)
    roles = {}
    for edge in EDGES:
        role = raw.get(edge)
        if role not in grammar.roles[edge]:
            raise DataError(
                f"{where}: {edge} role {role!r} is not one of {', '.join(grammar.roles[edge])}"
            )
        roles[edge] = role
    return roles


def load_arrangement(
    source: str | Path | Mapping | Arrangement,
    *,
    max_length: int,
    classes: Mapping[str, CardClass],
) -> Arrangement:
    """Load and validate an arrangement.

    `source` is a bundled arrangement's name, a path to a YAML file, a
    mapping in the YAML's shape, or an already loaded arrangement.
    """
    raw, name = _arrangement_source(source)
    return _parse(raw, name, max_length, classes)


def load_pinned(
    source: str | Path | Mapping | Arrangement,
    *,
    flip: str,
    max_length: int,
    classes: Mapping[str, CardClass],
) -> dict[tuple[str, str], tuple[Pocket, ...]]:
    """The edges an arrangement pins, as (class, edge) -> its pockets.

    An arrangement pins every edge it mentions, even with no pockets
    (`right: []`); a loaded arrangement pins every edge of its classes.
    `source` is as for `load_arrangement`; its flip must be `flip`, the
    flip of the search it is pinned in.
    """
    raw, name = _arrangement_source(source)
    loaded = _parse(raw, name, max_length, classes)
    if loaded.flip != flip:
        raise ArrangementError(f"{name} has flip {loaded.flip}, but the search is for {flip}")
    if isinstance(source, Arrangement):
        mentioned = [(cls, edge) for cls in source.fronts for edge in EDGES]
    else:
        mentioned = [(cls, edge) for cls, edges in (raw.get("classes") or {}).items() for edge in edges or {}]
    return {(cls, edge): loaded.fronts[cls][edge] for cls, edge in mentioned}


def _arrangement_source(source: str | Path | Mapping | Arrangement) -> tuple[Any, str]:
    """An arrangement's raw YAML content and its name."""
    if isinstance(source, Arrangement):
        return source.to_dict(), source.name
    if isinstance(source, Mapping):
        return source, "<mapping>"
    path = Path(source)
    bundled = _data() / "arrangements" / f"{source}.yaml"
    if path.is_file():
        return _read_arrangement(path), path.stem
    if path.suffix.lower() in (".yaml", ".yml"):
        raise ArrangementError(f"arrangement file not found: {path}")
    if bundled.is_file():
        return _read_arrangement(bundled), str(source)
    raise ArrangementError(f"no arrangement file or bundled arrangement named {source!r}")


def _read_arrangement(source) -> Any:
    try:
        return _read_yaml(source)
    except yaml.YAMLError as err:
        raise ArrangementError(f"{source} is not valid YAML: {err}") from err


def _parse(raw: Any, name: str, max_length: int, known: Mapping[str, CardClass]) -> Arrangement:
    if not isinstance(raw, Mapping):
        raise ArrangementError("an arrangement must be a mapping with `flip` and `classes`")
    _no_extra_keys(raw, {"flip", "classes"}, "the arrangement")
    flip = raw.get("flip", "top_bottom")
    if flip not in FLIPS:
        raise ArrangementError(f"unknown flip {flip!r}; expected one of {', '.join(FLIPS)}")
    authored = raw.get("classes") or {}
    if not isinstance(authored, Mapping):
        raise ArrangementError("`classes` must map class names to their edges")
    fronts: dict[str, Edges] = {}
    for cls_name in known:
        edges = authored.get(cls_name) or {}
        if not isinstance(edges, Mapping):
            raise ArrangementError(f"{cls_name}: expected a mapping of edges to pockets")
        _no_extra_keys(edges, set(EDGES), cls_name)
        cls = known[cls_name]
        fronts[cls_name] = {
            edge: _edge(cls, edge, edges.get(edge) or [], max_length) for edge in EDGES
        }
    for cls_name in authored:
        if cls_name not in known:
            raise ArrangementError(f"unknown card class {cls_name!r}; expected one of {', '.join(known)}")
    return Arrangement(name=name, flip=flip, fronts=fronts)


def _no_extra_keys(
    raw: Mapping, allowed: set[str], where: str, error: type[ValueError] = ArrangementError
) -> None:
    extra = sorted(str(k) for k in raw if k not in allowed)
    if extra:
        raise error(f"{where}: unknown key(s) {', '.join(extra)}")


def _edge(cls: CardClass, edge: str, raw: Any, max_length: int) -> tuple[Pocket, ...]:
    where = f"{cls.name} {edge}"
    if not isinstance(raw, list):
        raise ArrangementError(f"{where}: expected a list of pockets")
    if len(raw) > MAX_POCKETS[edge]:
        raise ArrangementError(
            f"{where}: {len(raw)} pockets, but a {edge} edge holds at most {MAX_POCKETS[edge]}"
        )
    pockets = tuple(_pocket(cls, edge, i, p) for i, p in enumerate(raw))
    for i, p in enumerate(pockets):
        for q in pockets[i + 1 :]:
            _check_collision(where, p, q, cls.min_length, max_length)
    return pockets


def _pocket(cls: CardClass, edge: str, index: int, raw: Any) -> Pocket:
    where = f"{cls.name} {edge} pocket {index + 1}"
    if not isinstance(raw, Mapping):
        raise ArrangementError(f"{where}: expected a mapping with `at` and `layers`")
    layers = _layers(where, raw.get("layers"))
    at = _fraction(where, raw.get("at"))
    if edge in LEFT_RIGHT_EDGES:
        _no_extra_keys(raw, {"at", "layers"}, where)
        if at not in POSITIONS:
            raise ArrangementError(f"{where}: at {u_text(at)} must be {_positions_text()} (U from the top edge)")
        return Pocket(edge=edge, anchor=None, at=at, layers=layers, index=index)
    _no_extra_keys(raw, {"from", "at", "layers"}, where)
    anchor = raw.get("from")
    if anchor not in ("left", "right"):
        raise ArrangementError(f"{where}: `from` must be left or right, not {anchor!r}")
    if not on_grid(at):
        raise ArrangementError(
            f"{where}: at {u_text(at)} is off the grid; positions sit at {_positions_text()} of each U, "
            "never on a cell boundary"
        )
    if not 0 < at < cls.pocket_reach:
        raise ArrangementError(
            f"{where}: at {u_text(at)} is beyond its pocket reach {cls.pocket_reach}U from the {anchor} end"
        )
    return Pocket(edge=edge, anchor=anchor, at=at, layers=layers, index=index)


def _layers(where: str, raw: Any) -> str:
    parts = raw.split("/") if isinstance(raw, str) else []
    if len(parts) != 2 or any(part not in LAYERS for part in parts):
        raise ArrangementError(
            f"{where}: layers {raw!r} must be P/Q with each layer one of {' '.join(LAYERS)}"
        )
    if raw == "-/-":
        raise ArrangementError(f"{where}: layers -/- is no pocket; leave the pocket out")
    return raw


def _fraction(where: str, raw: Any) -> Fraction:
    """`at` as written: a number, or a fraction like `1/6` (YAML reads it as text)."""
    if isinstance(raw, Fraction):
        return raw
    try:
        if isinstance(raw, str):
            return Fraction(raw)
        if not isinstance(raw, bool) and isinstance(raw, (int, float)) and math.isfinite(raw):
            return Fraction(str(raw))
    except (ValueError, ZeroDivisionError):
        pass
    raise ArrangementError(f"{where}: `at` must be a number or a fraction like 1/6, not {raw!r}")


def _check_collision(where: str, p: Pocket, q: Pocket, min_length: int, max_length: int) -> None:
    if p.anchor == q.anchor:
        if p.at == q.at:
            raise ArrangementError(f"{where}: two pockets at the same position {_anchored(p)}")
        return
    length = collision_length(p, q, min_length, max_length)
    if length is not None:
        raise ArrangementError(
            f"{where}: pockets {_anchored(p)} and {_anchored(q)} collide on a card {u_text(length)}U long"
        )


def collision_length(p: Pocket, q: Pocket, min_length: int, max_length: int) -> Fraction | None:
    """The card length at which a `from: left` and a `from: right` pocket on
    one top or bottom edge share a position, if the card can have it."""
    if p.anchor is None or q.anchor is None or p.anchor == q.anchor:
        return None
    length = p.at + q.at
    if length.denominator == 1 and min_length <= length <= max_length:
        return length
    return None


def _anchored(p: Pocket) -> str:
    return f"at {u_text(p.at)}" if p.anchor is None else f"{{from: {p.anchor}, at: {u_text(p.at)}}}"


def _positions_text() -> str:
    """The positions within a U, listed as `a, b or c`."""
    *rest, last = (u_text(at) for at in POSITIONS)
    return f"{', '.join(rest)} or {last}"


@dataclass(frozen=True)
class BundledProgram:
    """A test program shipped with the tool, in spec notation."""

    name: str
    legal: bool
    text: str


@cache
def bundled_programs() -> tuple[BundledProgram, ...]:
    """The bundled test programs, in file order."""
    raw = _bundled("programs")
    if not isinstance(raw, Mapping) or not raw:
        raise DataError("programs must be a mapping of program names to programs")
    programs = []
    for name, spec in raw.items():
        if not isinstance(spec, Mapping):
            raise DataError(f"program {name}: expected a mapping with `legal` and `text`")
        _no_extra_keys(spec, {"legal", "text"}, f"program {name}", DataError)
        if not isinstance(spec.get("legal"), bool) or not isinstance(spec.get("text"), str):
            raise DataError(f"program {name}: `legal` must be true or false and `text` a string")
        programs.append(BundledProgram(str(name), spec["legal"], spec["text"]))
    return tuple(programs)
