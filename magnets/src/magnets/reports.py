"""Check results rendered as a per-contact CSV and a summary."""

import csv
import io
from collections import Counter
from fractions import Fraction

from .api import CheckResult
from .contacts import Contact, Label

KINDS = ("connect", "forbid", "coexist", "ungraded")
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
        *_listing("Must failures", result, result.must_failures),
        *_listing("Should-leaks", result, _leaks(result, "should")),
        *_listing("Nice-leaks", result, _leaks(result, "nice")),
        "VALID" if result.valid else "INVALID",
    ]
    return "\n".join(lines) + "\n"


def _leaks(result: CheckResult, priority: str) -> list[tuple[Contact, Label]]:
    return [
        (c, label)
        for c in result.contacts
        for label in c.labels
        if label.kind == "forbid" and label.priority == priority and label.grade == "leak"
    ]


def _listing(title: str, result: CheckResult, found: list[tuple[Contact, Label]]) -> list[str]:
    return [f"{title}: {len(found)}", *(f"  {_describe(result, c, label)}" for c, label in found), ""]


def _count_table(result: CheckResult) -> list[str]:
    # A contact with two labels counts once under each.
    counts = Counter((label.kind, c.result) for c in result.contacts for label in c.labels)
    width = max(len(r) for r in RESULTS)
    kind_width = max(len(k) for k in KINDS) + 1
    rows = [f"{'':<{kind_width}}" + "".join(f"{r:>{width + 2}}" for r in RESULTS)]
    for kind in KINDS:
        if any(counts[kind, r] for r in RESULTS):
            rows.append(f"{kind:<{kind_width}}" + "".join(f"{counts[kind, r]:>{width + 2}}" for r in RESULTS))
    return [f"  {row}" for row in rows]


def _describe(result: CheckResult, contact: Contact, label: Label) -> str:
    a = result.sides[contact.a].side.notation
    b = result.sides[contact.b].side.notation
    counts = f"attract {contact.attract}, repel {contact.repel}"
    if contact.axis == "horizontal":
        return f"{a} {b} @{_offset(contact.offset)}: {label.kind} {contact.result} ({counts})"
    # Top/bottom pockets can depend on length, so name the smallest length pair.
    lengths = "x".join(map(str, contact.lengths))
    return f"{a} over {b} @{_offset(contact.offset)}: {label.kind} {contact.result} ({counts}, lengths {lengths})"


def _offset(offset: Fraction) -> str:
    if offset == 0:
        return "0"
    number = str(int(offset)) if offset.denominator == 1 else str(float(offset))
    return number if offset < 0 else f"+{number}"
