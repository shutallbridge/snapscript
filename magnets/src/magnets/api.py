"""The public API: everything the CLI and the tests use."""

from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path

from . import contacts as _contacts
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, card_classes, load_arrangement, rules


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


def check(arrangement: str | Path | Mapping | Arrangement, *, max_length: int = 6) -> CheckResult:
    """Grade every contact of an arrangement.

    `arrangement` is a bundled arrangement's name (e.g. "example"), a path
    to a YAML file, a mapping in the YAML's shape, or a loaded arrangement.
    Raises `ArrangementError` if no physical card could have it, and
    `ValueError` if `max_length` is shorter than some card's minimum.
    """
    longest_min = max(cls.min_length for cls in card_classes().values())
    if max_length < longest_min:
        raise ValueError(f"max_length {max_length} is shorter than the longest minimum card length {longest_min}U")
    loaded = load_arrangement(arrangement, max_length=max_length)
    all_sides = _contacts.sides(loaded, card_classes())
    found = _contacts.contacts(all_sides, rules(), max_length)
    failures = [
        (c, label)
        for c in found
        for label in c.labels
        if label.priority == "must" and label.grade == "FAIL"
    ]
    return CheckResult(loaded, max_length, all_sides, found, failures)
