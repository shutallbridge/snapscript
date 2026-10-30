"""The public API: everything the CLI and the tests use."""

import re
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field, replace
from fractions import Fraction
from pathlib import Path
from typing import Any

from . import contacts as _contacts
from . import programs as _programs
from . import sheet as _sheet
from . import solver as _solver
from .contacts import ContactGroup, Label, SideEdges
from .blueprint import BasePart, Tolerances
from .data import (
    Arrangement,
    CardClass,
    Rules,
    bundled_programs,
    load_arrangement,
    load_classes,
    load_pinned,
    load_rules,
    mentioned_classes,
)
from .physics import FLIPS
from .programs import Failure, Forbid, Info, Layout, Strip
from .sheet import CardSheet, Paper
from .solver import Requirement


@dataclass(frozen=True)
class CheckResult:
    """Every contact of an arrangement, graded against the grammar, in
    contact groups."""

    arrangement: Arrangement
    max_length: int
    sides: Mapping[str, SideEdges]  # "class.side" -> pockets, backs derived
    groups: list[ContactGroup]
    must_failures: list[tuple[ContactGroup, Label]]

    @property
    def valid(self) -> bool:
        return not self.must_failures


def check(
    arrangement: str | Path | Mapping | Arrangement,
    *,
    max_length: int = 6,
    classes: Sequence[str] | None = None,
    class_data: str | Path | Mapping | None = None,
    rule_data: str | Path | Mapping | None = None,
) -> CheckResult:
    """Grade every contact of an arrangement.

    `arrangement` is a bundled arrangement's name (e.g. "example"), a path
    to a YAML file, a mapping in the YAML's shape, or a loaded arrangement.
    `classes`, if given, names the only card classes to grade, as for a
    search restricted to them; the arrangement may not mention others.
    `class_data` and `rule_data` replace the bundled card classes and
    grammar rules, as a path to a YAML file or a mapping in its shape.
    Raises `DataError` for malformed class or rule data, `ArrangementError`
    if no physical card could have the arrangement, and `ValueError` if
    `max_length` is shorter than some card's minimum or `classes` names an
    unknown class.
    """
    grammar, _, loaded, all_sides = _load(arrangement, max_length, class_data, rule_data, classes)
    found = _contacts.contacts(all_sides, grammar, max_length, loaded.flip)
    failures = [
        (c, label)
        for c in found
        for label in c.labels
        if label.priority == "must" and label.grade == "FAIL"
    ]
    return CheckResult(loaded, max_length, all_sides, found, failures)


@dataclass(frozen=True)
class ProgramResult:
    """A program laid out on the table, and its contacts graded.

    `failures` is what keeps the program from holding together, if it is
    legal. `forbids` is every forbid contact it contains, which is what an
    illegal program is judged by. `info` is every ungraded contact.
    `magnets` is how many magnets its cards hold, to size a kit by.
    """

    arrangement: Arrangement
    max_length: int
    seed: int
    program: tuple[Strip, ...]
    layouts: tuple[Layout, ...]
    failures: tuple[Failure, ...]
    forbids: tuple[Forbid, ...]
    info: tuple[Info, ...]
    magnets: int

    @property
    def passed(self) -> bool:
        return not self.failures


def check_program(
    arrangement: str | Path | Mapping | Arrangement,
    program_text: str,
    *,
    lengths: Sequence[int] | None = None,
    seed: int = 0,
    draws: int = 20,
    max_length: int = 6,
    class_data: str | Path | Mapping | None = None,
    rule_data: str | Path | Mapping | None = None,
) -> ProgramResult:
    """Lay a program in spec notation out on the table and grade its contacts.

    The program is laid out once with every card at its minimum length,
    then `draws` times with lengths drawn at random up to `max_length` from
    `seed`; or, if `lengths` gives every card's length in reading order,
    only at those. `arrangement`, `class_data` and `rule_data` are as for
    `check`. Raises `ProgramError` for a program that can't be read, such
    as an unknown card, and `ValueError` for bad `lengths`.
    """
    grammar, classes, loaded, all_sides = _load(arrangement, max_length, class_data, rule_data)
    strips = _programs.parse(program_text, classes)
    owners = {side.name: name for name, cls in classes.items() for side in cls.sides}
    found = _programs.layouts(
        strips, all_sides, grammar, loaded.flip, lengths=lengths, seed=seed, draws=draws, max_length=max_length
    )
    return ProgramResult(
        arrangement=loaded,
        max_length=max_length,
        seed=seed,
        program=strips,
        layouts=tuple(found),
        failures=tuple(_programs.failures(found)),
        forbids=tuple(_programs.forbids(found)),
        info=tuple(_programs.info(found)),
        magnets=sum(loaded.magnets(owners[card.side]) for card in _programs.all_cards(strips)),
    )


def card_sheet(
    arrangement: str | Path | Mapping | Arrangement,
    program: str | None = None,
    *,
    draw: int | None = None,
    seed: int = 0,
    unit: float = 30,
    paper: Paper = "a4",
    max_length: int = 6,
    class_data: str | Path | Mapping | None = None,
    rule_data: str | Path | Mapping | None = None,
) -> CardSheet:
    """A paper prototype of programs' cards, to print, cut out and fold.

    `program` is a bundled program's name, a program text in spec notation,
    or None for every bundled program, one after another. Each program
    starts a new page, headed by its name and the lengths used, then its
    text; an illegal bundled program's cards are headed "these neighbours
    should not snap". Every card is one piece, at its minimum length, or
    with `draw` at its length in `check_program`'s "draw N" layout from
    `seed` up to `max_length`: its class's front on the upper panel, its
    back below, upright under `top_bottom` and rotated 180° under
    `left_right`, each panel showing every pocket's layer nearest that
    face. Pieces are packed in program order into rows edge to edge, so
    neighbours share cut lines, and every page has a 50 mm ruler. `unit` is
    the size of a U in mm; every position is in mm on a portrait `paper`
    page, `"a4"` or `"letter"`. `arrangement`, `class_data` and `rule_data`
    are as for `check`. Raises `ProgramError` for a program that can't be
    read, and `ValueError` for an unknown program name, a `draw` below 1,
    an unknown paper or a `unit` too big for a piece to fit on a page,
    naming the card and the largest unit that fits.
    """
    if draw is not None and draw < 1:
        raise ValueError(f"draw must be 1 or more, not {draw}")
    _, classes, loaded, all_sides = _load(arrangement, max_length, class_data, rule_data)
    bundled = {p.name: p for p in bundled_programs()}
    if program is None:
        chosen = [(p.name, p.text, p.legal) for p in bundled.values()]
    elif program in bundled:
        chosen = [(program, bundled[program].text, bundled[program].legal)]
    elif re.fullmatch(r"\w+", program):
        raise ValueError(f"no bundled program named {program!r}; expected one of {', '.join(bundled)}")
    else:
        chosen = [(None, program, True)]
    sections = []
    for name, text, legal in chosen:
        strips = _programs.parse(text, classes)
        minimum = [all_sides[card.side].min_length for card in _programs.all_cards(strips)]
        # Every draw before it too, so the random lengths match check_program's.
        lengths = minimum if draw is None else _programs.drawn_lengths(minimum, max_length, seed, draw)[-1]
        note = None if legal else "these neighbours should not snap"
        sections.append(_sheet.Section(name, text, strips, tuple(lengths), note))
    label = "min lengths" if draw is None else f"draw {draw}, seed {seed}"
    return _sheet.card_sheet(loaded, classes, all_sides, sections, label, unit, paper)


def bases(
    arrangement: str | Path | Mapping | Arrangement,
    *,
    tolerances: Tolerances = Tolerances(),
    classes: Sequence[str] | None = None,
    max_length: int = 6,
) -> list[BasePart]:
    """The printed parts of the cards' bases, built from an arrangement:
    one frame per card class and length, from the class's minimum length up
    to `max_length`, in class order; then, for each length of those, a core,
    a front face and, if a flip pair has that length, a back face.

    A frame has a bore for each magnet of its class's front and solid wall
    everywhere else; a flip pair's is double-sided, and every other class's
    single-sided, with its back built in. The core and faces don't depend on
    the arrangement. `classes` names the classes to build; by default, those
    the arrangement names. `arrangement` is as for `check`. Needs build123d,
    the `bases` extra. Raises `ArrangementError` for an invalid arrangement
    and `ValueError` for an unknown class or a `max_length` shorter than a
    class's minimum.
    """
    from . import parts as _parts

    every = load_classes(grammar=load_rules())
    loaded = load_arrangement(arrangement, max_length=max_length, classes=every)
    if classes is None:
        classes = mentioned_classes(arrangement, classes=every)
    unknown = [name for name in classes if name not in every]
    if unknown or not classes:
        raise ValueError(f"unknown card class(es): {', '.join(unknown)}" if unknown else "no card classes given")
    chosen = [cls for name, cls in every.items() if name in classes]
    too_short = [cls.name for cls in chosen if cls.min_length > max_length]
    if too_short:
        raise ValueError(f"max_length {max_length} is shorter than the minimum length of {', '.join(too_short)}")
    frames = [
        _parts.frame(cls.name, cls.id, loaded.fronts[cls.name], n, cls.flip_pair, tolerances)
        for cls in chosen
        for n in range(cls.min_length, max_length + 1)
    ]
    shared = []
    for n in range(min(cls.min_length for cls in chosen), max_length + 1):
        shared += [_parts.core(n, tolerances), _parts.face(n, tolerances, front=True)]
        if any(cls.flip_pair and cls.min_length <= n for cls in chosen):
            shared.append(_parts.face(n, tolerances, front=False))
    return frames + shared


def assemblies(parts: Sequence[BasePart]) -> dict[tuple[str, int], Any]:
    """Each card's base assembled from `bases`'s parts, by (class, length):
    a build123d Compound of the frame, the core and the front face of its
    length and, for a flip pair, the back face, each where it sits in the
    card and labelled by its kind. The Compound is labelled by the frame's
    name, as in "01-get-2u". Needs build123d, the `bases` extra.
    """
    from . import parts as _parts

    every = load_classes(grammar=load_rules())
    shared = {(p.kind, p.length): p for p in parts if p.kind != "frame"}
    found = {}
    for frame in parts:
        if frame.card_class is None:
            continue
        kinds = ("core", "front-face", "back-face") if every[frame.card_class].flip_pair else ("core", "front-face")
        card = [frame, *(shared[kind, frame.length] for kind in kinds)]
        found[frame.card_class, frame.length] = _parts.assembly(card, frame.name)
    return found


@dataclass(frozen=True)
class SolveResult:
    """The best arrangement a search found, re-graded by the checker.

    `status` is optimal (proven best), feasible (the best found within the
    time limit), infeasible (proven to have no valid arrangement) or unknown
    (nothing found within the time limit). `objective` and `bound` are in
    cost units: a should-leak contact costs 10, a nice-leak 1, a magnet
    0.01. `arrangement` and `check` are None if nothing was found.

    If infeasible, `conflicts` names requirements that can't all hold
    (enough to make it infeasible, not always the fewest), and `arrangement`
    is the one with the fewest must failures, then the least cost;
    `fewest_status` says whether that is proven (optimal), the best found
    (feasible) or not found (unknown). `must_failures` counts its failing
    contacts per requirement, as the solver grades it; `check` grades it
    again. `objective` is then its cost, and there is no `bound`.
    """

    flip: str
    goal: str
    classes: tuple[str, ...]
    max_length: int
    seed: int
    time_limit: float
    workers: int
    status: str
    objective: Fraction | None
    bound: Fraction | None
    wall_time: float
    arrangement: Arrangement | None
    check: CheckResult | None
    conflicts: tuple[Requirement, ...] = ()
    must_failures: Mapping[Requirement, int] = field(default_factory=dict)
    fewest_status: str | None = None


def solve(
    flip: str,
    *,
    goal: str = "no_snap",
    pinned: str | Path | Mapping | Arrangement | None = None,
    classes: Sequence[str] | None = None,
    seed: int = 0,
    time_limit: float = 60,
    workers: int = 8,
    max_length: int = 6,
    class_data: str | Path | Mapping | None = None,
    rule_data: str | Path | Mapping | None = None,
    split: bool = True,
) -> SolveResult:
    """Search with CP-SAT for the best arrangement under `flip`.

    Every connect contact must snap and every coexist contact must not
    repel. Among those arrangements the search minimises, over every
    forbid contact that isn't unavoidable, its priority weight times its
    grade's penalty, plus 0.01 per magnet (a half pocket holds one, a
    uniform or split pocket two). The penalties depend on the search
    `goal`: under "no_snap", the default, it is enough that illegal
    neighbours don't snap (leak 1, partial 0.5, weak and strong 0); under
    "repel" the search also tries to push them apart (weak 0.2), with
    about twice the magnets. Objectives found with different goals can't
    be compared; `check` grades the same way for both.
    `pinned`, an arrangement as for `check` with the same flip, fixes every
    edge it mentions, even an empty one (`right: []`); a loaded arrangement
    fixes every edge. Like any arrangement checked with `classes`, it may
    only mention those classes. The search designs the rest. `classes`, if given,
    restricts the search, and the check of its result, to those card
    classes. `class_data` and `rule_data` are as for `check`. The search
    stops after `time_limit` seconds; with one worker that is CP-SAT's
    deterministic time, roughly seconds, so a seed repeats its result
    exactly, even when the search stops before it proves the result
    optimal. Left/right and top/bottom edges never face each other, so the
    two halves are solved as independent models; `split=False` solves them
    as one, which finds the same optimum. Raises `ArrangementError` for a
    malformed pinned arrangement or one with another flip.
    """
    if flip not in FLIPS:
        raise ValueError(f"unknown flip {flip!r}; expected one of {', '.join(FLIPS)}")
    if goal not in _solver.GOALS:
        raise ValueError(f"unknown goal {goal!r}; expected one of {', '.join(_solver.GOALS)}")
    grammar, selected = _classes(max_length, class_data, rule_data, classes)
    pins = None if pinned is None else load_pinned(pinned, flip=flip, max_length=max_length, classes=selected)
    found = _solver.solve(
        flip,
        grammar,
        selected,
        goal=goal,
        max_length=max_length,
        seed=seed,
        time_limit=time_limit,
        workers=workers,
        pinned=pins,
        split=split,
    )
    regraded = None
    if found.arrangement is not None:
        loaded = load_arrangement(found.arrangement, max_length=max_length, classes=selected)
        regraded = check(
            replace(loaded, name="search"),
            max_length=max_length,
            classes=list(selected),
            class_data=class_data,
            rule_data=rule_data,
        )
    return SolveResult(
        flip=flip,
        goal=goal,
        classes=tuple(selected),
        max_length=max_length,
        seed=seed,
        time_limit=time_limit,
        workers=workers,
        status=found.status,
        objective=found.objective,
        bound=found.bound,
        wall_time=found.wall_time,
        arrangement=regraded.arrangement if regraded else None,
        check=regraded,
        conflicts=found.conflicts,
        must_failures=found.must_failures,
        fewest_status=found.fewest_status,
    )


def _load(
    arrangement: str | Path | Mapping | Arrangement,
    max_length: int,
    class_data: str | Path | Mapping | None,
    rule_data: str | Path | Mapping | None,
    only: Sequence[str] | None = None,
) -> tuple[Rules, Mapping[str, CardClass], Arrangement, dict[str, SideEdges]]:
    grammar, classes = _classes(max_length, class_data, rule_data, only)
    loaded = load_arrangement(arrangement, max_length=max_length, classes=classes)
    return grammar, classes, loaded, _contacts.sides(loaded, classes)


def _classes(
    max_length: int,
    class_data: str | Path | Mapping | None,
    rule_data: str | Path | Mapping | None,
    only: Sequence[str] | None,
) -> tuple[Rules, dict[str, CardClass]]:
    """The grammar, and its card classes, only those named in `only` if given."""
    grammar = load_rules(rule_data)
    classes = dict(load_classes(class_data, grammar=grammar))
    # Any class can head the next line, so a restricted check keeps the full classes' shortest line head.
    grammar = grammar.for_classes(classes)
    if only is not None:
        unknown = [name for name in only if name not in classes]
        if unknown or not only:
            raise ValueError(f"unknown card class(es): {', '.join(unknown)}" if unknown else "no card classes given")
        classes = {name: cls for name, cls in classes.items() if name in only}
    longest_min = max(cls.min_length for cls in classes.values())
    if max_length < longest_min:
        raise ValueError(f"max_length {max_length} is shorter than the longest minimum card length {longest_min}U")
    return grammar, classes
