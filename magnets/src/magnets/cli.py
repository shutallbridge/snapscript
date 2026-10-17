"""The `magnets` command: argument parsing around the public API."""

import argparse
import sys
from dataclasses import replace
from pathlib import Path

from .api import CheckResult, SolveResult, check, check_program, solve
from .data import ArrangementError, bundled_programs
from .physics import FLIPS
from .reports import arrangement_text, conflict_lines, csv_text, program_report_text, program_status, summary_text


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
        "--out", type=Path, help="arrangement file to write; reports go next to it (default: out/search_<flip>.yaml)"
    )
    _common(search_cmd, "search only these card classes")

    args = parser.parse_args(argv)
    classes = args.classes.split(",") if args.classes else None
    try:
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


def _common(command: argparse.ArgumentParser, classes_help: str) -> None:
    command.add_argument("--max-length", type=int, default=6, help="longest card, in U (default: 6)")
    command.add_argument("--classes", help=f"{classes_help}, comma-separated (default: every class)")


def _search(args: argparse.Namespace, classes: list[str] | None) -> int:
    result = solve(
        args.flip,
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
    out = args.out or Path("out") / f"search_{args.flip}.yaml"
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
