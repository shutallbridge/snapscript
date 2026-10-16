"""Checker for the Snapscript magnet arrangement."""

from .api import CheckResult, check
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, ArrangementError, DataError
from .physics import Pocket, PocketPair

__all__ = [
    "Arrangement",
    "ArrangementError",
    "CheckResult",
    "Contact",
    "DataError",
    "Label",
    "Pocket",
    "PocketPair",
    "SideEdges",
    "check",
]
