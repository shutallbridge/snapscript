"""Checker and CP-SAT solver for the Snapscript magnet arrangement."""

from .api import CheckResult, ProgramResult, SolveResult, check, check_program, solve
from .contacts import Contact, Label, SideEdges
from .data import Arrangement, ArrangementError, BundledProgram, DataError, bundled_programs
from .physics import Pocket, PocketPair
from .programs import Card, Failure, Forbid, Info, Layout, Line, Placed, ProgramContact, ProgramError
from .solver import MustContact

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
    "MustContact",
    "Placed",
    "Pocket",
    "PocketPair",
    "ProgramContact",
    "ProgramError",
    "ProgramResult",
    "SideEdges",
    "SolveResult",
    "bundled_programs",
    "check",
    "check_program",
    "solve",
]
