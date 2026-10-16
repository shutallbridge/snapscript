"""The public API: everything the CLI and the tests use."""

from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from pathlib import Path

from . import contacts as _contacts
from . import programs as _programs
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, CardClass, Rules, load_arrangement, load_classes, load_rules
from .programs import Failure, Forbid, Info, Layout, Strip


@dataclass(frozen=True)
class CheckResult:
    """Every contact of an arrangement, graded against the grammar."""

    arrangement: Arrangement
    max_length: int
    sides: Mapping[str, SideEdges]  # "class.side" -> pockets, backs derived
    contacts: list[Contact]
    must_failures: list[tuple[Contact, Label]]

    @property
    def valid(self) -> bool:
        return not self.must_failures


def check(
    arrangement: str | Path | Mapping | Arrangement,
    *,
    max_length: int = 6,
    class_data: str | Path | Mapping | None = None,
    rule_data: str | Path | Mapping | None = None,
) -> CheckResult:
    """Grade every contact of an arrangement.

    `arrangement` is a bundled arrangement's name (e.g. "example"), a path
    to a YAML file, a mapping in the YAML's shape, or a loaded arrangement.
    `class_data` and `rule_data` replace the bundled card classes and
    grammar rules, as a path to a YAML file or a mapping in its shape.
    Raises `DataError` for malformed class or rule data, `ArrangementError`
    if no physical card could have the arrangement, and `ValueError` if
    `max_length` is shorter than some card's minimum.
    """
    grammar, _, loaded, all_sides = _load(arrangement, max_length, class_data, rule_data)
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
    """

    arrangement: Arrangement
    max_length: int
    seed: int
    program: tuple[Strip, ...]
    layouts: tuple[Layout, ...]
    failures: tuple[Failure, ...]
    forbids: tuple[Forbid, ...]
    info: tuple[Info, ...]

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
    )


def _load(
    arrangement: str | Path | Mapping | Arrangement,
    max_length: int,
    class_data: str | Path | Mapping | None,
    rule_data: str | Path | Mapping | None,
) -> tuple[Rules, Mapping[str, CardClass], Arrangement, dict[str, SideEdges]]:
    grammar = load_rules(rule_data)
    classes = load_classes(class_data, grammar=grammar)
    longest_min = max(cls.min_length for cls in classes.values())
    if max_length < longest_min:
        raise ValueError(f"max_length {max_length} is shorter than the longest minimum card length {longest_min}U")
    loaded = load_arrangement(arrangement, max_length=max_length, classes=classes)
    return grammar, classes, loaded, _contacts.sides(loaded, classes)
