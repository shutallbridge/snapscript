"""Check results rendered as a CSV of contact groups, a summary and a program
report; a card sheet rendered as printable HTML."""

import csv
import html
import io
from collections import Counter
from collections.abc import Callable, Sequence
from fractions import Fraction

import yaml

from .api import CheckResult, ProgramResult, SolveResult
from .contacts import ContactGroup, Label
from .data import Arrangement, BundledProgram
from .physics import Shape
from .programs import ProgramContact
from .sheet import CardSheet, Page, Panel, Piece, Ruler
from .solver import Requirement

# Rows of the kind x result table; unavoidable is the subset of forbid that
# no arrangement can block.
ROWS = ("connect", "forbid", "unavoidable", "coexist", "ungraded")
RESULTS = ("snap", "mixed", "nothing", "repel")
SHAPES: tuple[Shape, ...] = ("uniform", "half", "split")
CSV_COLUMNS = (
    "axis",
    "upper_or_left",
    "edge_a",
    "lower_or_right",
    "edge_b",
    "offset",
    "lengths",
    "count",
    "kind",
    "priority",
    "attract",
    "repel",
    "result",
    "grade",
    "unavoidable",
)


def csv_text(result: CheckResult) -> str:
    """One row per (contact group, label).

    Contact groups where no pockets line up are left out unless the label
    is connect: their result is "nothing" by construction.
    """
    out = io.StringIO()
    writer = csv.writer(out, lineterminator="\n")
    writer.writerow(CSV_COLUMNS)
    for group in result.groups:
        for label in group.labels:
            if not group.pairs and label.kind != "connect":
                continue
            writer.writerow(
                (
                    group.axis,
                    group.a,
                    group.edge_a,
                    group.b,
                    group.edge_b,
                    _offset(group.offset),
                    "x".join(map(str, group.lengths)),
                    group.count,
                    label.kind,
                    label.priority,
                    group.attract,
                    group.repel,
                    group.result,
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
        f"{len(result.groups)} contact groups, {sum(g.count for g in result.groups)} contacts",
        _pocket_line(arrangement),
        "",
        # A contact group holds `count` contacts with one geometry, named by
        # its smallest length pair. Under left_right a geometry can split
        # into two contact groups, unavoidable at some length pairs and not
        # others.
        "Contact groups by kind and result:",
        *_count_table(result, lambda c: 1),
        "",
        "Contacts by kind and result (one with two labels counts under each):",
        *_count_table(result, lambda c: c.count),
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
        # Low forbids cost nothing, and under left_right many are unavoidable.
        f"Unavoidable low-leaks (not listed): {len(unavoidable_low)}",
        "",
        "VALID" if result.valid else "INVALID",
    ]
    return "\n".join(lines) + "\n"


def _pocket_line(arrangement: Arrangement) -> str:
    """`Pockets: 41 (uniform 20, half 12, split 9)`, over every front: a
    back shares its front's pockets."""
    shapes = Counter(p.shape for edges in arrangement.fronts.values() for pockets in edges.values() for p in pockets)
    return f"Pockets: {shapes.total()} ({', '.join(f'{shape} {shapes[shape]}' for shape in SHAPES)})"


def _search_lines(search: SolveResult) -> list[str]:
    lines = [
        f"Search (goal {search.goal}): {_search_status(search)}",
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
    """The requirements that conflict, if the search proved there is no
    valid arrangement: `[num(…)] [get(x)] @0: connect`."""
    if search.status != "infeasible":
        return []
    if not search.conflicts:
        return ["Conflicting requirements: none found within the time limit"]
    return [
        f"Conflicting requirements: {len(search.conflicts)}",
        *(f"  {_requirement(r)}" for r in search.conflicts),
    ]


def _requirement(requirement: Requirement) -> str:
    a, b = requirement.cards
    between = " " if requirement.axis == "horizontal" else " over "
    return f"{a}{between}{b} @{_offset(requirement.offset)}: {requirement.kind}"


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


def _leaks(result: CheckResult) -> list[tuple[ContactGroup, Label]]:
    return [
        (c, label)
        for c in result.groups
        for label in c.labels
        if label.kind == "forbid" and label.grade == "leak"
    ]


def _avoidable_leaks(result: CheckResult, priority: str) -> list[tuple[ContactGroup, Label]]:
    return [(c, label) for c, label in _leaks(result) if label.priority == priority and not label.unavoidable]


def _unavoidable_leaks(result: CheckResult) -> list[tuple[ContactGroup, Label]]:
    return [(c, label) for c, label in _leaks(result) if label.unavoidable]


def _listing(
    title: str, result: CheckResult, found: list[tuple[ContactGroup, Label]], *, with_priority: bool = False
) -> list[str]:
    return [f"{title}: {len(found)}", *(f"  {_describe(result, c, label, with_priority)}" for c, label in found), ""]


def _count_table(result: CheckResult, weight: Callable[[ContactGroup], int]) -> list[str]:
    """Kind x result counts, each of `result.groups` counting `weight(group)`."""
    # A contact group with two labels counts once under each.
    counts: Counter[tuple[str, str]] = Counter()
    for c in result.groups:
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


def _describe(result: CheckResult, group: ContactGroup, label: Label, with_priority: bool = False) -> str:
    a = result.sides[group.a].side.notation
    b = result.sides[group.b].side.notation
    kind = f"{label.kind} {label.priority}" if with_priority else label.kind
    counts = f"attract {group.attract}, repel {group.repel}"
    if group.axis == "horizontal":
        return f"{a} {b} @{_offset(group.offset)}: {kind} {group.result} ({counts})"
    # Top/bottom pockets can depend on length, so name the smallest length pair.
    lengths = "x".join(map(str, group.lengths))
    return f"{a} over {b} @{_offset(group.offset)}: {kind} {group.result} ({counts}, lengths {lengths})"


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


# --- card sheet ------------------------------------------------------------

_LETTER_COLOURS = {"N": "#d62728", "S": "#1f5fbf", "F": "#888888"}
_OPPOSITE_EDGE = {"top": "bottom", "bottom": "top", "left": "right", "right": "left"}
_INWARD = {"top": (0, 1), "bottom": (0, -1), "left": (1, 0), "right": (-1, 0)}
_TICK = 3.0  # mm in from the edge, never over a neighbour's shared cut line
_LETTER_INSET = 4.5  # mm from the edge to the letter's centre
_SMALL = 3.5  # mm, the size of the program text, letters and fold mark


def cards_html(sheet: CardSheet) -> str:
    """The card sheet as one HTML file of SVG pages, to print at 100%."""
    pages = "\n".join(_page_svg(page) for page in sheet.pages)
    title = html.escape(f"{sheet.arrangement.name} cards")
    return (
        "<!doctype html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n"
        f"<title>{title}</title>\n"
        f"<style>@page {{ size: {sheet.paper} portrait; margin: 0 }} body {{ margin: 0 }} "
        "svg { display: block; break-after: page }</style>\n"
        f"</head>\n<body>\n{pages}\n</body>\n</html>\n"
    )


def _page_svg(page: Page) -> str:
    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{page.width:g}mm" height="{page.height:g}mm" '
        f'viewBox="0 0 {page.width:g} {page.height:g}">'
    ]
    for line in page.text:
        parts.append(
            f'<text x="{line.x:g}" y="{line.y + _SMALL:g}" font-family="monospace" font-size="{_SMALL:g}" '
            f'xml:space="preserve">{html.escape(line.text)}</text>'
        )
    for piece in page.pieces:
        parts += _piece_svg(piece)
    parts += _ruler_svg(page.ruler)
    parts.append("</svg>")
    return "\n".join(parts)


def _piece_svg(piece: Piece) -> list[str]:
    front, back = piece.front, piece.back
    right = front.x + front.width
    parts = [
        f'<rect x="{front.x:g}" y="{front.y:g}" width="{front.width:g}" '
        f'height="{front.height + back.height:g}" fill="none" stroke="black" stroke-width="0.3"/>',
        f'<line x1="{front.x:g}" y1="{piece.fold_y:g}" x2="{right:g}" y2="{piece.fold_y:g}" '
        'stroke="black" stroke-width="0.2" stroke-dasharray="2 1.5"/>',
        # On the fold line, inside the cut, clear of the nearest pocket (¼ U in).
        f'<text x="{right - 2.5:g}" y="{piece.fold_y:g}" font-size="{_SMALL:g}" text-anchor="middle" '
        f'dominant-baseline="central" stroke="white" stroke-width="0.8" paint-order="stroke">{piece.fold}</text>',
    ]
    for panel in (front, back):
        parts += _panel_svg(panel)
    return parts


def _panel_svg(panel: Panel) -> list[str]:
    parts = []
    if panel.notation is not None:
        # A monospace glyph is about 0.6 of its size wide; a long label shrinks
        # to fit the card, keeping clear of the letters.
        size = min(panel.height * 0.2, (panel.width - 4) / (0.6 * len(panel.notation)))
        cx, cy = panel.x + panel.width / 2, panel.y + panel.height / 2
        turn = f' transform="rotate(180 {cx:g} {cy:g})"' if panel.rotated else ""
        parts.append(
            f'<text x="{cx:g}" y="{cy:g}" font-family="monospace" font-size="{size:.2f}" text-anchor="middle" '
            f'dominant-baseline="central"{turn}>{html.escape(panel.notation)}</text>'
        )
    for mark in panel.marks:
        edge = _OPPOSITE_EDGE[mark.edge] if panel.rotated else mark.edge
        dx, dy = _INWARD[edge]
        # The tick runs in from the edge, perpendicular to it.
        parts.append(
            f'<line x1="{mark.x:g}" y1="{mark.y:g}" x2="{mark.x + dx * _TICK:g}" y2="{mark.y + dy * _TICK:g}" '
            'stroke="black" stroke-width="0.3"/>'
        )
        colour = _LETTER_COLOURS.get(mark.letter, "black")
        parts.append(
            f'<text x="{mark.x + dx * _LETTER_INSET:g}" y="{mark.y + dy * _LETTER_INSET:g}" font-family="sans-serif" '
            f'font-size="{_SMALL:g}" font-weight="bold" fill="{colour}" text-anchor="middle" '
            f'dominant-baseline="central">{mark.letter}</text>'
        )
    return parts


def _ruler_svg(ruler: Ruler) -> list[str]:
    """A bar with a tick every 10 mm, labelled to its right."""
    mid = ruler.y + ruler.height / 2
    parts = [
        f'<line x1="{ruler.x:g}" y1="{mid:g}" x2="{ruler.x + ruler.length:g}" y2="{mid:g}" '
        'stroke="black" stroke-width="0.3"/>'
    ]
    for mm in range(0, int(ruler.length) + 1, 10):
        half = 2.0 if mm in (0, ruler.length) else 1.0
        parts.append(
            f'<line x1="{ruler.x + mm:g}" y1="{mid - half:g}" x2="{ruler.x + mm:g}" y2="{mid + half:g}" '
            'stroke="black" stroke-width="0.3"/>'
        )
    parts.append(
        f'<text x="{ruler.x + ruler.length + 3:g}" y="{mid:g}" font-family="sans-serif" font-size="{_SMALL:g}" '
        f'dominant-baseline="central">{ruler.length:g} mm: if it measures otherwise, print at 100% scale</text>'
    )
    return parts
