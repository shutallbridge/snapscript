"""Card classes, grammar rules and arrangements, loaded from YAML and validated."""

from dataclasses import dataclass
from fractions import Fraction
from functools import cache
from importlib import resources
from pathlib import Path
from typing import Any, Mapping

import math

import yaml

from .physics import EDGES, FLIPS, LAYERS, LEFT_RIGHT_EDGES, Edges, Pocket

MAX_POCKETS = {"top": 2, "bottom": 2, "left": 3, "right": 3}
HEIGHTS = (Fraction(1, 4), Fraction(1, 2), Fraction(3, 4))


class ArrangementError(ValueError):
    """A magnet arrangement that no physical card could have."""


@dataclass(frozen=True)
class Side:
    """One printed face of a card class, with its edge roles."""

    name: str  # "class.side", e.g. "set_get.set"
    notation: str
    roles: Mapping[str, str]  # edge -> role


@dataclass(frozen=True)
class CardClass:
    name: str
    min_length: int
    sides: tuple[Side, ...]  # front first; a flip pair's back second

    @property
    def front(self) -> Side:
        return self.sides[0]


@dataclass(frozen=True)
class VerticalRule:
    upper: str
    lower: str
    offset: Fraction
    verdict: str


@dataclass(frozen=True)
class Rules:
    vertical: tuple[VerticalRule, ...]


@dataclass(frozen=True)
class Arrangement:
    """A magnet arrangement: the flip and every class's front edges."""

    name: str
    flip: str
    fronts: Mapping[str, Edges]  # class -> edge -> pockets

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


@cache
def card_classes() -> Mapping[str, CardClass]:
    raw = _read_yaml(_data() / "classes.yaml")
    return {
        name: CardClass(
            name=name,
            min_length=spec["min_length"],
            sides=tuple(
                Side(
                    name=f"{name}.{side}",
                    notation=s["notation"],
                    roles={edge: s[edge] for edge in EDGES},
                )
                for side, s in spec["sides"].items()
            ),
        )
        for name, spec in raw.items()
    }


@cache
def rules() -> Rules:
    raw = _read_yaml(_data() / "rules.yaml")
    return Rules(
        vertical=tuple(
            VerticalRule(r["upper"], r["lower"], Fraction(r["offset"]), r["verdict"])
            for r in raw["vertical"]
        )
    )


def load_arrangement(source: str | Path | Mapping | Arrangement, *, max_length: int) -> Arrangement:
    """Load and validate an arrangement.

    `source` is a bundled arrangement's name, a path to a YAML file, a
    mapping in the YAML's shape, or an already loaded arrangement.
    """
    if isinstance(source, Arrangement):
        raw, name = source.to_dict(), source.name
    elif isinstance(source, Mapping):
        raw, name = source, "<mapping>"
    else:
        path = Path(source)
        bundled = _data() / "arrangements" / f"{source}.yaml"
        if path.is_file():
            raw, name = _read_arrangement(path), path.stem
        elif path.suffix.lower() in (".yaml", ".yml"):
            raise ArrangementError(f"arrangement file not found: {path}")
        elif bundled.is_file():
            raw, name = _read_arrangement(bundled), str(source)
        else:
            raise ArrangementError(f"no arrangement file or bundled arrangement named {source!r}")
    return _parse(raw, name, max_length)


def _read_arrangement(source) -> Any:
    try:
        return _read_yaml(source)
    except yaml.YAMLError as err:
        raise ArrangementError(f"{source} is not valid YAML: {err}") from err


def _parse(raw: Any, name: str, max_length: int) -> Arrangement:
    if not isinstance(raw, Mapping):
        raise ArrangementError("an arrangement must be a mapping with `flip` and `classes`")
    _no_extra_keys(raw, {"flip", "classes"}, "the arrangement")
    flip = raw.get("flip", "top_bottom")
    if flip not in FLIPS:
        raise ArrangementError(f"unknown flip {flip!r}; expected one of {', '.join(FLIPS)}")
    authored = raw.get("classes") or {}
    if not isinstance(authored, Mapping):
        raise ArrangementError("`classes` must map class names to their edges")
    known = card_classes()
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
            raise ArrangementError(f"unknown card class {cls_name!r}")
    return Arrangement(name=name, flip=flip, fronts=fronts)


def _no_extra_keys(raw: Mapping, allowed: set[str], where: str) -> None:
    extra = sorted(str(k) for k in raw if k not in allowed)
    if extra:
        raise ArrangementError(f"{where}: unknown key(s) {', '.join(extra)}")


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
        if at not in HEIGHTS:
            raise ArrangementError(f"{where}: at {_u(at)} must be 0.25, 0.5 or 0.75 (U from the top edge)")
        return Pocket(edge=edge, anchor=None, at=at, layers=layers, index=index)
    _no_extra_keys(raw, {"from", "at", "layers"}, where)
    anchor = raw.get("from")
    if anchor not in ("left", "right"):
        raise ArrangementError(f"{where}: `from` must be left or right, not {anchor!r}")
    if (at * 4).denominator != 1 or at.denominator == 1:
        raise ArrangementError(
            f"{where}: at {_u(at)} is off the grid; positions sit at 1/4, 1/2 and 3/4 of a U, "
            "never on a cell boundary"
        )
    if not 0 < at < cls.min_length:
        raise ArrangementError(
            f"{where}: at {_u(at)} is outside the card at its minimum length {cls.min_length}U"
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
    if isinstance(raw, bool) or not isinstance(raw, (int, float)) or not math.isfinite(raw):
        raise ArrangementError(f"{where}: `at` must be a number, not {raw!r}")
    return Fraction(str(raw))


def _check_collision(where: str, p: Pocket, q: Pocket, min_length: int, max_length: int) -> None:
    if p.anchor == q.anchor:
        if p.at == q.at:
            raise ArrangementError(f"{where}: two pockets at the same position {_anchored(p)}")
        return
    if p.anchor is None or q.anchor is None:
        return
    length = p.at + q.at
    if length.denominator == 1 and min_length <= length <= max_length:
        raise ArrangementError(
            f"{where}: pockets {_anchored(p)} and {_anchored(q)} collide on a card {_u(length)}U long"
        )


def _anchored(p: Pocket) -> str:
    return f"at {_u(p.at)}" if p.anchor is None else f"{{from: {p.anchor}, at: {_u(p.at)}}}"


def _u(x: Fraction) -> str:
    return str(int(x)) if x.denominator == 1 else str(float(x))
