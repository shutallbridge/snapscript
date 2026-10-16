"""Checker for the Snapscript magnet arrangement."""

from .api import CheckResult, ProgramResult, check, check_program
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, ArrangementError, BundledProgram, DataError, bundled_programs
from .physics import Pocket, PocketPair
from .programs import Card, Failure, Forbid, Info, Layout, Line, Placed, ProgramContact, ProgramError

__all__ = [
    "Arrangement",
    "ArrangementError",
    "BundledProgram",
    "Card",
    "CheckResult",
    "Contact",
    "DataError",
    "Failure",
    "Forbid",
    "Info",
    "Label",
    "Layout",
    "Line",
    "Placed",
    "Pocket",
    "PocketPair",
    "ProgramContact",
    "ProgramError",
    "ProgramResult",
    "SideEdges",
    "bundled_programs",
    "check",
    "check_program",
]
