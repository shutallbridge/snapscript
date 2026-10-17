"""Checker and CP-SAT solver for the Snapscript magnet arrangement."""

from .api import CheckResult, ProgramResult, SolveResult, check, check_program, solve
from .contacts import ContactGroup, Label, SideEdges
from .data import Arrangement, ArrangementError, BundledProgram, DataError, bundled_programs
from .physics import Pocket, PocketPair
from .programs import Card, Failure, Forbid, Info, Layout, Line, Placed, ProgramContact, ProgramError
from .solver import Requirement

__all__ = [
    "Arrangement",
    "ArrangementError",
    "BundledProgram",
    "Card",
    "CheckResult",
    "ContactGroup",
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
    "Requirement",
    "SideEdges",
    "SolveResult",
    "bundled_programs",
    "check",
    "check_program",
    "solve",
]
