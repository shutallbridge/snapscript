"""The `magnets` command: argument parsing around the public API."""

import argparse
import re
import sys
from dataclasses import replace
from pathlib import Path

from .api import CheckResult, SolveResult, bases, card_sheet, check, check_program, solve
from .blueprint import Tolerances
from .data import ArrangementError, bundled_programs
from .physics import FLIPS
from .reports import arrangement_text, cards_html, conflict_lines, csv_text, program_report_text, program_status, summary_text
from .sheet import PAPERS
from .solver import GOALS


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="magnets", description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)

    check_cmd = commands.add_parser("check", help="grade every contact of an arrangement")
    check_cmd.add_argument(
        "arrangement",
        nargs="?",
        default="example",
        help="an arrangement YAML file, or a bundled arrangement's name (default: example)",
    )
    check_cmd.add_argument("--out", type=Path, help="report directory (default: out/<arrangement>)")
    _common(check_cmd, "grade only these card classes")

    search_cmd = commands.add_parser("search", help="search with CP-SAT for the best arrangement")
    search_cmd.add_argument("--flip", choices=FLIPS, required=True, help="how flip pairs turn over")
    search_cmd.add_argument(
        "--goal",
        choices=GOALS,
        default="no_snap",
        help="what a forbid must do: only not snap, or repel (default: no_snap)",
    )
    search_cmd.add_argument("--seed", type=int, default=0, help="random seed (default: 0)")
    search_cmd.add_argument(
        "--time-limit",
        type=float,
        default=60,
        help="seconds to search; with one worker, deterministic time, so a seed repeats (default: 60)",
    )
    search_cmd.add_argument("--workers", type=int, default=8, help="parallel search workers (default: 8)")
    search_cmd.add_argument(
        "--pin",
        help="an arrangement YAML file, or a bundled arrangement's name, whose edges the search keeps as they are",
    )
    search_cmd.add_argument(
        "--out",
        type=Path,
        help="arrangement file to write; reports go next to it (default: out/search_<flip>_<goal>.yaml)",
    )
    _common(search_cmd, "search only these card classes")

    print_cmd = commands.add_parser("print", help="print programs' cards as paper pieces to cut out and fold")
    print_cmd.add_argument("arrangement", help="an arrangement YAML file, or a bundled arrangement's name")
    print_cmd.add_argument(
        "--program",
        help="a program file in spec notation, or a bundled program's name (default: every bundled program)",
    )
    print_cmd.add_argument(
        "--seed",
        type=int,
        help="print each card at its length in check's draw N layout (default: every card at its minimum length)",
    )
    print_cmd.add_argument("--max-length", type=int, default=6, help="longest card, in U (default: 6)")
    print_cmd.add_argument("--unit", type=float, default=30, help="the size of a U, in mm (default: 30)")
    print_cmd.add_argument("--paper", choices=PAPERS, default="a4", help="paper size (default: a4)")
    print_cmd.add_argument("--out", type=Path, help="HTML file to write (default: out/<arrangement>/cards.html)")

    bases_cmd = commands.add_parser("bases", help="build a printable frame for every card class and length")
    bases_cmd.add_argument("arrangement", help="an arrangement YAML file, or a bundled arrangement's name")
    bases_cmd.add_argument(
        "--out", type=Path, help="directory to write frames/ to (default: out/<arrangement>/bases)"
    )
    defaults = Tolerances()
    for name, what in [
        ("slide_clearance", "gap between parts that slide together"),
        ("sheet_clearance", "room for the paper sheet"),
        ("magnet_clearance", "gap around a magnet in its bore"),
        ("magnet_depth_clearance", "how far a magnet can move front to back"),
    ]:
        bases_cmd.add_argument(
            f"--{name.replace('_', '-')}",
            dest=name,
            type=float,
            default=getattr(defaults, name),
            help=f"{what}, in mm per side (default: {getattr(defaults, name)})",
        )
    _common(bases_cmd, "build only these card classes", "every class the arrangement names")

    args = parser.parse_args(argv)
    classes = args.classes.split(",") if getattr(args, "classes", None) else None
    try:
        if args.command == "print":
            return _print(args)
        if args.command == "bases":
            return _bases(args, classes)
        if args.command == "check":
            result = check(args.arrangement, max_length=args.max_length, classes=classes)
            return _write_reports(result, args.out or Path("out") / result.arrangement.name, classes)
        return _search(args, classes)
    except ArrangementError as err:
        print(f"magnets: invalid arrangement: {err}", file=sys.stderr)
        return 2
    except ValueError as err:
        print(f"magnets: {err}", file=sys.stderr)
        return 2


def _common(command: argparse.ArgumentParser, classes_help: str, every: str = "every class") -> None:
    command.add_argument("--max-length", type=int, default=6, help="longest card, in U (default: 6)")
    command.add_argument("--classes", help=f"{classes_help}, comma-separated (default: {every})")


def _bases(args: argparse.Namespace, classes: list[str] | None) -> int:
    tolerances = Tolerances(
        slide_clearance=args.slide_clearance,
        sheet_clearance=args.sheet_clearance,
        magnet_clearance=args.magnet_clearance,
        magnet_depth_clearance=args.magnet_depth_clearance,
    )
    try:
        parts = bases(args.arrangement, tolerances=tolerances, classes=classes, max_length=args.max_length)
    except ModuleNotFoundError as err:
        if err.name != "build123d":
            raise
        print("magnets: bases needs build123d: install magnets with its `bases` extra", file=sys.stderr)
        return 1
    from build123d import export_stl

    out = args.out or Path("out") / Path(args.arrangement).stem / "bases"
    frames = out / "frames"
    frames.mkdir(parents=True, exist_ok=True)
    for part in parts:
        export_stl(part.solid, str(frames / f"{part.card_class}-{part.length}u.stl"))
    print(f"Wrote {len(parts)} frames to {frames}")
    return 0


def _print(args: argparse.Namespace) -> int:
    if args.seed is not None and args.seed < 1:
        raise ValueError(f"--seed names one of check's draws, 1 or more, not {args.seed}")
    program = args.program
    if program is not None:
        path = Path(program)
        # A name is tried as a bundled program when it isn't a file.
        if path.is_file():
            program = path.read_text(encoding="utf-8")
        elif not re.fullmatch(r"\w+", program):
            raise ValueError(f"program file not found: {path}")
    sheet = card_sheet(
        args.arrangement, program, draw=args.seed, unit=args.unit, paper=args.paper, max_length=args.max_length
    )
    out = args.out or Path("out") / sheet.arrangement.name / "cards.html"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(cards_html(sheet), encoding="utf-8")
    count = sum(len(page.pieces) for page in sheet.pages)
    print(f"Wrote {out}: {count} cards on {len(sheet.pages)} page(s); print at 100% scale")
    return 0


def _search(args: argparse.Namespace, classes: list[str] | None) -> int:
    result = solve(
        args.flip,
        goal=args.goal,
        pinned=args.pin,
        classes=classes,
        seed=args.seed,
        time_limit=args.time_limit,
        workers=args.workers,
        max_length=args.max_length,
    )
    if result.check is None:
        print(f"magnets: search {result.status} after {result.wall_time:.1f}s: no arrangement found", file=sys.stderr)
        for line in conflict_lines(result):
            print(f"  {line}", file=sys.stderr)
        return 1
    out = args.out or Path("out") / f"search_{args.flip}_{args.goal}.yaml"
    # Named after its file, as `magnets check` would name it.
    checked = replace(result.check, arrangement=replace(result.check.arrangement, name=out.stem))
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(arrangement_text(checked.arrangement, result), encoding="utf-8")
    print(f"Wrote {out}\n")
    _write_reports(checked, out.with_suffix(""), classes, result)
    # 0 only for a valid arrangement: an infeasible search still writes the
    # one with the fewest must failures.
    return 0 if result.status in ("optimal", "feasible") else 1


def _write_reports(
    result: CheckResult, out: Path, classes: list[str] | None, search: SolveResult | None = None
) -> int:
    out.mkdir(parents=True, exist_ok=True)
    summary = summary_text(result, search)
    written = [out / "summary.txt", out / "contacts.csv"]
    (out / "summary.txt").write_text(summary, encoding="utf-8")
    (out / "contacts.csv").write_text(csv_text(result), encoding="utf-8")
    print(summary, end="")
    # The bundled programs use every class.
    if classes is None:
        programs = [
            (program, check_program(result.arrangement, program.text, max_length=result.max_length))
            for program in bundled_programs()
        ]
        (out / "programs.txt").write_text(program_report_text(programs), encoding="utf-8")
        written.append(out / "programs.txt")
        print("\nPrograms:")
        for program, checked in programs:
            print(f"  {program_status(program, checked)}")
    print(f"\nWrote {', '.join(map(str, written[:-1]))} and {written[-1]}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
