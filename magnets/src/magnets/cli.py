"""The `magnets` command: argument parsing around the public API."""

import argparse
import sys
from pathlib import Path

from .api import check, check_program
from .data import ArrangementError, bundled_programs
from .reports import csv_text, program_report_text, program_status, summary_text


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
    check_cmd.add_argument("--max-length", type=int, default=6, help="longest card, in U (default: 6)")

    args = parser.parse_args(argv)
    try:
        result = check(args.arrangement, max_length=args.max_length)
    except ArrangementError as err:
        print(f"magnets: invalid arrangement: {err}", file=sys.stderr)
        return 2
    except ValueError as err:
        print(f"magnets: {err}", file=sys.stderr)
        return 2

    programs = [
        (program, check_program(result.arrangement, program.text, max_length=args.max_length))
        for program in bundled_programs()
    ]

    out = args.out or Path("out") / result.arrangement.name
    out.mkdir(parents=True, exist_ok=True)
    summary = summary_text(result)
    (out / "summary.txt").write_text(summary, encoding="utf-8")
    (out / "contacts.csv").write_text(csv_text(result), encoding="utf-8")
    (out / "programs.txt").write_text(program_report_text(programs), encoding="utf-8")
    print(summary, end="")
    print("\nPrograms:")
    for program, checked in programs:
        print(f"  {program_status(program, checked)}")
    print(f"\nWrote {out / 'summary.txt'}, {out / 'contacts.csv'} and {out / 'programs.txt'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
