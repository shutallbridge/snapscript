"""Check results rendered as a per-contact CSV, a summary and a program report."""

import csv
import io
from collections import Counter
from collections.abc import Callable, Sequence
from fractions import Fraction

import yaml

from .api import CheckResult, ProgramResult, SolveResult
from .contacts import Contact, Label
from .data import Arrangement, BundledProgram
from .programs import ProgramContact
from .solver import MustContact

# Rows of the kind x result table; unavoidable is the subset of forbid that
# no arrangement can block.
ROWS = ("connect", "forbid", "unavoidable", "coexist", "ungraded")
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


def summary_text(result: CheckResult, search: SolveResult | None = None) -> str:
    """The summary of a check, and of the search that found the arrangement
    if there was one."""
    arrangement = result.arrangement
    unavoidable = _unavoidable_leaks(result)
    unavoidable_low = [(c, label) for c, label in unavoidable if label.priority == "low"]
    lines = [
        f"Arrangement: {arrangement.name} (flip {arrangement.flip}, lengths up to {result.max_length}U)",
        *([] if search is None else _search_lines(search)),
        f"{len(result.contacts)} rows, {sum(c.collapsed for c in result.contacts)} contacts",
        "",
        # A row groups `collapsed` contacts with one geometry, named by its
        # smallest length pair. Under left_right a geometry can split into
        # two rows, unavoidable at some length pairs and not others.
        "Rows by kind and result (a row groups contacts with one geometry):",
        *_count_table(result, lambda c: 1),
        "",
        "Contacts by kind and result (one with two labels counts under each):",
        *_count_table(result, lambda c: c.collapsed),
        "",
        *_listing("Must failures", result, result.must_failures),
        *_listing("Avoidable should-leaks", result, _avoidable_leaks(result, "should")),
        *_listing("Avoidable nice-leaks", result, _avoidable_leaks(result, "nice")),
        # Unavoidable leaks mix should and nice, so each names its own.
        *_listing(
            "Unavoidable should- and nice-leaks",
            result,
            [(c, label) for c, label in unavoidable if label.priority != "low"],
            with_priority=True,
        ),
        # Low forbids are never scored, and under left_right many are unavoidable.
        f"Unavoidable low-leaks (not listed): {len(unavoidable_low)}",
        "",
        "VALID" if result.valid else "INVALID",
    ]
    return "\n".join(lines) + "\n"


def _search_lines(search: SolveResult) -> list[str]:
    lines = [
        f"Search: {_search_status(search)}",
        f"  classes {', '.join(search.classes)}; seed {search.seed}, "
        f"{search.workers} worker{'s' if search.workers != 1 else ''}, time limit {search.time_limit:g}s",
    ]
    if search.status == "infeasible" and search.objective is not None:
        failing = sum(search.must_failures.values())
        lines.append(
            f"  Fewest must failures ({search.fewest_status}): {failing} contacts, "
            f"objective {_cost(search.objective)}"
        )
    return lines + [f"  {line}" for line in conflict_lines(search)]


def _search_status(search: SolveResult) -> str:
    """`optimal, objective 6108.35, bound 6108.35, in 3.2s`, or for no valid
    arrangement `infeasible in 3.2s: no valid arrangement`."""
    if search.status == "infeasible":
        return f"infeasible in {search.wall_time:.1f}s: no valid arrangement"
    found = "" if search.objective is None else f", objective {_cost(search.objective)}, bound {_cost(search.bound)}"
    return f"{search.status}{found}, in {search.wall_time:.1f}s"


def conflict_lines(search: SolveResult) -> list[str]:
    """The must contacts that conflict, if the search proved there is no
    valid arrangement: `[num(…)] [get(x)] @0: connect`."""
    if search.status != "infeasible":
        return []
    if not search.conflicts:
        return ["Conflicting must contacts: none found within the time limit"]
    return [f"Conflicting must contacts: {len(search.conflicts)}", *(f"  {_must(m)}" for m in search.conflicts)]


def _must(must: MustContact) -> str:
    a, b = must.cards
    between = " " if must.axis == "horizontal" else " over "
    return f"{a}{between}{b} @{_offset(must.offset)}: {must.kind}"


def _cost(cost: Fraction | None) -> str:
    return "none" if cost is None else f"{float(cost):.3f}".rstrip("0").rstrip(".")


def arrangement_text(arrangement: Arrangement, search: SolveResult) -> str:
    """An arrangement found by a search, as YAML, headed by how it was found."""
    header = [
        f"# Found by `magnets search`, lengths up to {search.max_length}U.",
        *(f"# {line.strip()}" for line in _search_lines(search)),
    ]
    body = yaml.safe_dump(arrangement.to_dict(), sort_keys=False, default_flow_style=None, width=120)
    return "\n".join(header) + "\n" + body


def _leaks(result: CheckResult) -> list[tuple[Contact, Label]]:
    return [
        (c, label)
        for c in result.contacts
        for label in c.labels
        if label.kind == "forbid" and label.grade == "leak"
    ]


def _avoidable_leaks(result: CheckResult, priority: str) -> list[tuple[Contact, Label]]:
    return [(c, label) for c, label in _leaks(result) if label.priority == priority and not label.unavoidable]


def _unavoidable_leaks(result: CheckResult) -> list[tuple[Contact, Label]]:
    return [(c, label) for c, label in _leaks(result) if label.unavoidable]


def _listing(
    title: str, result: CheckResult, found: list[tuple[Contact, Label]], *, with_priority: bool = False
) -> list[str]:
    return [f"{title}: {len(found)}", *(f"  {_describe(result, c, label, with_priority)}" for c, label in found), ""]


def _count_table(result: CheckResult, weight: Callable[[Contact], int]) -> list[str]:
    """Kind x result counts, each of `result.contacts` counting `weight(contact)`."""
    # A contact with two labels counts once under each.
    counts: Counter[tuple[str, str]] = Counter()
    for c in result.contacts:
        for label in c.labels:
            counts[label.kind, c.result] += weight(c)
            if label.unavoidable:
                counts["unavoidable", c.result] += weight(c)
    width = max(max(len(r) for r in RESULTS), len(str(max(counts.values(), default=0))))
    # Room for the unavoidable row's indent under forbid, plus a space.
    kind_width = max(len(k) for k in ROWS) + 3
    rows = [f"{'':<{kind_width}}" + "".join(f"{r:>{width + 2}}" for r in RESULTS)]
    for kind in ROWS:
        if any(counts[kind, r] for r in RESULTS):
            name = f"  {kind}" if kind == "unavoidable" else kind
            rows.append(f"{name:<{kind_width}}" + "".join(f"{counts[kind, r]:>{width + 2}}" for r in RESULTS))
    return [f"  {row}" for row in rows]


def _describe(result: CheckResult, contact: Contact, label: Label, with_priority: bool = False) -> str:
    a = result.sides[contact.a].side.notation
    b = result.sides[contact.b].side.notation
    kind = f"{label.kind} {label.priority}" if with_priority else label.kind
    counts = f"attract {contact.attract}, repel {contact.repel}"
    if contact.axis == "horizontal":
        return f"{a} {b} @{_offset(contact.offset)}: {kind} {contact.result} ({counts})"
    # Top/bottom pockets can depend on length, so name the smallest length pair.
    lengths = "x".join(map(str, contact.lengths))
    return f"{a} over {b} @{_offset(contact.offset)}: {kind} {contact.result} ({counts}, lengths {lengths})"


def _offset(offset: Fraction) -> str:
    if offset == 0:
        return "0"
    number = str(int(offset)) if offset.denominator == 1 else str(float(offset))
    return number if offset < 0 else f"+{number}"


def program_report_text(checked: Sequence[tuple[BundledProgram, ProgramResult]]) -> str:
    """Each program's pass/fail with reasons if it is legal, or every forbid
    contact with its grade if not.

    A contact is named by its cards and their source lines, and listed once
    with the number of layouts it occurs in.
    """
    first = checked[0][1]
    count = len(first.layouts)
    lines = [
        f"Programs checked against {first.arrangement.name} (flip {first.arrangement.flip}), "
        f"each in {count} layouts: every card at its",
        f"minimum length, then {count - 1} draws of random lengths up to {first.max_length}U (seed {first.seed}).",
    ]
    for program, result in checked:
        lines.append("")
        lines.append(program_status(program, result))
        if program.legal:
            reasons = [(f.layout, f.contact, f"{_labels(f.contact)}, {f.reason}") for f in result.failures]
            lines += _grouped(reasons, count)
            notes = [(i.layout, i.contact, f"ungraded {i.contact.contact.result}") for i in result.info]
            lines += [f"  info: {line[2:]}" for line in _grouped(notes, count)]
        else:
            lines += _grouped(_forbid_lines(result), count)
    return "\n".join(lines) + "\n"


def program_status(program: BundledProgram, result: ProgramResult) -> str:
    """One line: a legal program's PASS or FAIL, or an illegal program's
    forbid contact count."""
    count = len(result.layouts)
    if not program.legal:
        return f"{program.name} (illegal): {len(_grouped(_forbid_lines(result), count))} forbid contacts in {count} layouts"
    if result.passed:
        return f"{program.name} (legal): PASS"
    failed = len({f.layout for f in result.failures})
    return f"{program.name} (legal): FAIL in {failed} of {count} layouts"


def _forbid_lines(result: ProgramResult) -> list[tuple[str, ProgramContact, str]]:
    found = []
    for f in result.forbids:
        unavoidable = ", unavoidable" if f.label.unavoidable else ""
        found.append((f.layout, f.contact, f"forbid {f.label.priority} {f.label.grade}{unavoidable}"))
    return found


def _grouped(found: list[tuple[str, ProgramContact, str]], count: int) -> list[str]:
    """Each distinct (contact, what) once, in program order, with how many
    layouts it occurs in."""
    # line -> (sort key, layouts)
    seen: dict[str, tuple[tuple, set[str]]] = {}
    for layout, pc, what in found:
        a, b = pc.a.card, pc.b.card
        key = (a.line, a.index, b.line, b.index, pc.contact.offset)
        seen.setdefault(f"{_where(pc)}: {what}", (key, set()))[1].add(layout)
    ordered = sorted(seen.items(), key=lambda item: item[1][0])
    return [f"  {line} ({len(layouts)} of {count} layouts)" for line, (_, layouts) in ordered]


def _where(pc: ProgramContact) -> str:
    """`line 3 [set(x)to] [num(1)] @0` or `line 2 [if] over line 3 [dedent] @0`."""
    a, b, offset = pc.a.card, pc.b.card, _offset(pc.contact.offset)
    if pc.contact.axis == "horizontal":
        return f"line {a.line} {a.text} {b.text} @{offset}"
    return f"line {a.line} {a.text} over line {b.line} {b.text} @{offset}"


def _labels(pc: ProgramContact) -> str:
    kinds = "+".join(label.kind for label in pc.contact.labels)
    return f"{kinds} {pc.contact.result}"
