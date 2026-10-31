"""Checker and CP-SAT solver for the Snapscript magnet arrangement."""

from .api import AssemblyPage, CheckResult, ProgramResult, SolveResult, assemblies, assembly_page, bases, card_sheet, check, check_program, solve
from .assembly import AssemblyFrame, WallPosition
from .blueprint import BasePart, Tolerances
from .contacts import ContactGroup, Label, SideEdges
from .data import Arrangement, ArrangementError, BundledProgram, DataError, bundled_programs
from .physics import Pocket, PocketPair
from .programs import Card, Failure, Forbid, Info, Layout, Line, Placed, ProgramContact, ProgramError
from .sheet import CardSheet, Mark, Page, Panel, Piece, Ruler, TextLine
from .solver import Requirement

__all__ = [
    "Arrangement",
    "ArrangementError",
    "AssemblyFrame",
    "AssemblyPage",
    "BasePart",
    "BundledProgram",
    "Card",
    "CardSheet",
    "CheckResult",
    "ContactGroup",
    "DataError",
    "Failure",
    "Forbid",
    "Info",
    "Label",
    "Layout",
    "Line",
    "Mark",
    "Page",
    "Panel",
    "Piece",
    "Placed",
    "Pocket",
    "PocketPair",
    "ProgramContact",
    "ProgramError",
    "ProgramResult",
    "Requirement",
    "Ruler",
    "SideEdges",
    "SolveResult",
    "TextLine",
    "Tolerances",
    "WallPosition",
    "assemblies",
    "assembly_page",
    "bases",
    "bundled_programs",
    "card_sheet",
    "check",
    "check_program",
    "solve",
]
