"""Checker for the Snapscript magnet arrangement."""

from .api import CheckResult, check
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, ArrangementError
from .physics import Pocket, PocketPair

__all__ = [
    "Arrangement",
    "ArrangementError",
    "CheckResult",
    "Contact",
    "Label",
    "Pocket",
    "PocketPair",
    "SideEdges",
    "check",
]
