"""The public API: everything the CLI and the tests use."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from . import contacts as _contacts
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, load_arrangement, load_classes, load_rules


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
    grammar = load_rules(rule_data)
    classes = load_classes(class_data, grammar=grammar)
    longest_min = max(cls.min_length for cls in classes.values())
    if max_length < longest_min:
        raise ValueError(f"max_length {max_length} is shorter than the longest minimum card length {longest_min}U")
    loaded = load_arrangement(arrangement, max_length=max_length, classes=classes)
    all_sides = _contacts.sides(loaded, classes)
    found = _contacts.contacts(all_sides, grammar, max_length, loaded.flip)
    failures = [
        (c, label)
        for c in found
        for label in c.labels
        if label.priority == "must" and label.grade == "FAIL"
    ]
    return CheckResult(loaded, max_length, all_sides, found, failures)
