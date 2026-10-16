"""Check results rendered as a per-contact CSV and a summary."""

import csv
import io
from collections import Counter
from fractions import Fraction

from .api import CheckResult
from .contacts import Contact, Label

KINDS = ("connect", "forbid", "coexist")
RESULTS = ("snap", "mixed", "nothing", "repel")
CSV_COLUMNS = (
    "axis",
    "upper_or_left",
    "edge_a",
    "lower_or_right",
    "edge_b",
    "offset",
    "lengths",
    "collapsed",
    "kind",
    "priority",
    "attract",
    "repel",
    "result",
    "grade",
    "unavoidable",
)


def csv_text(result: CheckResult) -> str:
    """One row per (contact, label).

    Rows where no pockets line up and the label isn't connect are left out:
    their result is "nothing" by construction.
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for contact in result.contacts:
        for label in contact.labels:
            if not contact.pairs and label.kind != "connect":
                continue
            writer.writerow(
                (
                    contact.axis,
                    contact.a,
                    contact.edge_a,
                    contact.b,
                    contact.edge_b,
                    _offset(contact.offset),
                    "x".join(map(str, contact.lengths)),
                    contact.collapsed,
                    label.kind,
                    label.priority,
                    contact.attract,
                    contact.repel,
                    contact.result,
                    label.grade,
                    label.unavoidable,
                )
            )
    return out.getvalue()


def summary_text(result: CheckResult) -> str:
    arrangement = result.arrangement
    lines = [
        f"Arrangement: {arrangement.name} (flip {arrangement.flip}, lengths up to {result.max_length}U)",
        "",
        "Contacts by kind and result:",
        *_count_table(result),
        "",
        f"Must failures: {len(result.must_failures)}",
        *(f"  {_describe(result, c, label)}" for c, label in result.must_failures),
        "",
        "VALID" if result.valid else "INVALID",
    ]
    return "\n".join(lines) + "\n"


def _count_table(result: CheckResult) -> list[str]:
    # A contact with two labels counts once under each.
    counts = Counter((label.kind, c.result) for c in result.contacts for label in c.labels)
    width = max(len(r) for r in RESULTS)
    rows = [f"{'':<8}" + "".join(f"{r:>{width + 2}}" for r in RESULTS)]
    for kind in KINDS:
        if any(counts[kind, r] for r in RESULTS):
            rows.append(f"{kind:<8}" + "".join(f"{counts[kind, r]:>{width + 2}}" for r in RESULTS))
    return [f"  {row}" for row in rows]


def _describe(result: CheckResult, contact: Contact, label: Label) -> str:
    a = result.sides[contact.a].side.notation
    b = result.sides[contact.b].side.notation
    joint = " over " if contact.axis == "vertical" else ""
    return (
        f"{a}{joint}{b} @{_offset(contact.offset)}: {label.kind} {contact.result} "
        f"(attract {contact.attract}, repel {contact.repel})"
    )


def _offset(offset: Fraction) -> str:
    if offset == 0:
        return "0"
    number = str(int(offset)) if offset.denominator == 1 else str(float(offset))
    return number if offset < 0 else f"+{number}"
