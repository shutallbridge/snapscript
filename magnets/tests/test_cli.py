"""Smoke test: `magnets check` runs and writes its reports."""

import csv
import subprocess
import sys

import yaml

from helpers import SET_GET

MAGNETS = [sys.executable, "-m", "magnets.cli"]


COLUMNS = [
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
]


def read_csv(path):
    with path.open() as f:
        reader = csv.DictReader(f)
        return reader.fieldnames, list(reader)


def test_check_writes_summary_and_csv(tmp_path):
    out = tmp_path / "reports"
    run = subprocess.run(
        [*MAGNETS, "check", "example", "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    summary = (out / "summary.txt").read_text()
    assert summary in run.stdout
    # Only set_get's top and bottom edges have pockets, so every other connect fails.
    assert "\nINVALID\n" in summary

    columns, rows = read_csv(out / "contacts.csv")
    assert columns == COLUMNS
    stacks = [
        r
        for r in rows
        if r["axis"] == "vertical" and {r["upper_or_left"], r["lower_or_right"]} <= SET_GET
    ]
    assert len(stacks) == 4
    assert {(r["kind"], r["result"], r["grade"]) for r in stacks} == {("connect", "snap", "pass")}


def test_check_reports_horizontal_contacts(tmp_path):
    # set's right and left pockets; get's are derived by the top_bottom flip.
    toy = tmp_path / "toy.yaml"
    toy.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  set_get:\n"
        "    left: [{at: 0.5, layers: S/-}]\n"
        "    right: [{at: 0.5, layers: N/-}]\n"
    )
    out = tmp_path / "reports"
    run = subprocess.run(
        [*MAGNETS, "check", str(toy), "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    _, rows = read_csv(out / "contacts.csv")
    on_line = {
        (r["upper_or_left"], r["lower_or_right"]): (r["kind"], r["priority"], r["result"], r["grade"])
        for r in rows
        if r["axis"] == "horizontal"
        and r["offset"] == "0"
        and {r["upper_or_left"], r["lower_or_right"]} <= SET_GET
    }
    assert on_line == {
        # [set][set]: open -> head. N/- meets S/- and snaps.
        ("set_get.set", "set_get.set"): ("forbid", "should", "snap", "leak"),
        # [get][get]: value -> value. -/N meets -/S.
        ("set_get.get", "set_get.get"): ("connect", "must", "snap", "pass"),
        # [set][get]: open -> value. N/- meets -/S: nothing faces.
        ("set_get.set", "set_get.get"): ("connect", "must", "nothing", "FAIL"),
        # [get][set]: value -> head. -/N meets S/-.
        ("set_get.get", "set_get.set"): ("forbid", "should", "nothing", "weak"),
    }
    row = next(r for r in rows if (r["upper_or_left"], r["lower_or_right"]) == ("set_get.set", "set_get.set"))
    assert (row["edge_a"], row["edge_b"], row["lengths"], row["count"]) == ("right", "left", "1x1", "36")
    assert row["unavoidable"] == "True"

    assert "[get(x)] [get(x)] @0" not in run.stdout
    assert "  [set(x)to] [get(x)] @0: connect nothing" in run.stdout
    # [set(x)to][set(x)to] snaps exactly like [get(x)][get(x)], which must
    # snap: no arrangement can block it.
    assert "Avoidable should-leaks: 0\n" in run.stdout
    unavoidable = run.stdout.split("Unavoidable should- and nice-leaks: 1\n")[1]
    assert unavoidable.startswith("  [set(x)to] [set(x)to] @0: forbid should snap (attract 1, repel 0)\n")


def test_check_rejects_a_bad_arrangement(tmp_path):
    bad = tmp_path / "bad.yaml"
    bad.write_text("flip: sideways\n")
    run = subprocess.run([*MAGNETS, "check", str(bad)], capture_output=True, text=True)
    assert run.returncode == 2
    assert "unknown flip" in run.stderr


def test_check_lists_must_failures_in_notation(tmp_path):
    nn = tmp_path / "nn.yaml"
    nn.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  set_get:\n"
        "    top: [{from: left, at: 0.25, layers: N/N}]\n"
        "    bottom: [{from: left, at: 0.25, layers: F/S}]\n"
    )
    run = subprocess.run(
        [*MAGNETS, "check", str(nn), "--out", str(tmp_path / "reports")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "[get(x)] over [set(x)to] @0: connect repel" in run.stdout
    assert "\nINVALID\n" in run.stdout


def test_check_reports_vertical_contacts(tmp_path):
    # num's top and bottom repel each other; set's bottom snaps to define's top.
    toy = tmp_path / "toy.yaml"
    toy.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  literal:\n"
        "    top: [{from: left, at: 0.25, layers: N/-}]\n"
        "    bottom: [{from: left, at: 0.25, layers: N/-}]\n"
        "  set_get:\n"
        "    bottom: [{from: left, at: 0.25, layers: N/-}]\n"
        "  define_call:\n"
        "    top: [{from: left, at: 0.25, layers: S/-}]\n"
    )
    out = tmp_path / "reports"
    run = subprocess.run(
        [*MAGNETS, "check", str(toy), "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    _, rows = read_csv(out / "contacts.csv")
    num_over_num = [
        (r["edge_a"], r["edge_b"], r["lengths"], r["count"], r["kind"], r["priority"], r["result"], r["grade"])
        for r in rows
        if r["axis"] == "vertical"
        and (r["upper_or_left"], r["lower_or_right"], r["offset"]) == ("literal.num", "literal.num", "0")
    ]
    # One row per label.
    assert num_over_num == [
        ("bottom", "top", "1x1", "36", "coexist", "must", "repel", "FAIL"),
        ("bottom", "top", "1x1", "36", "forbid", "should", "repel", "strong"),
    ]
    # Contact groups where no pockets line up have no row unless they are connect.
    assert not any(
        r["axis"] == "vertical" and (r["upper_or_left"], r["lower_or_right"]) == ("literal.num", "literal.num")
        and r["offset"] != "0"
        for r in rows
    )

    summary = (out / "summary.txt").read_text()
    table = summary.split("Contacts by kind and result")[1].split("\n\n")[0].splitlines()[1:]
    assert [row.split()[0] for row in table[1:]] == ["connect", "forbid", "unavoidable", "coexist", "ungraded"]
    # Unavoidable forbids are a subset of the forbids.
    forbid, unavoidable = ([int(n) for n in row.split()[1:]] for row in table[2:4])
    assert all(u <= f for u, f in zip(unavoidable, forbid)) and sum(unavoidable) > 0
    assert "  [num(…)] over [num(…)] @0: coexist repel (attract 0, repel 1, lengths 1x1)\n" in summary
    # num's bottom N/- snaps to define's top S/- too.
    nice_leaks = summary.split("Avoidable nice-leaks: 1\n")[1].split("\n\n")[0]
    assert nice_leaks.splitlines() == [
        "  [num(…)] over [define(f)] @0: forbid snap (attract 1, repel 0, lengths 1x1)",
    ]
    # [set(x)to] over [define(f)] snaps exactly like [call(f)] over [get(x)],
    # which must snap.
    unavoidable_leaks = summary.split("Unavoidable should- and nice-leaks: ")[1].split("\n\n")[0].splitlines()
    assert "  [set(x)to] over [define(f)] @0: forbid nice snap (attract 1, repel 0, lengths 1x1)" in unavoidable_leaks
    assert summary.endswith("\nINVALID\n")
    assert summary in run.stdout


def test_check_writes_the_program_report(tmp_path):
    out = tmp_path / "reports"
    run = subprocess.run(
        [*MAGNETS, "check", "example", "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    report = (out / "programs.txt").read_text()
    assert report.startswith(
        "Programs checked against example (flip top_bottom), each in 21 layouts: every card at its\n"
        "minimum length, then 20 draws of random lengths up to 6U (seed 0).\n"
    )
    sections = report.split("\n\n")[1:]
    titles = [s.splitlines()[0] for s in sections]
    assert titles[:4] == [
        "first_sketch (legal): FAIL in 21 of 21 layouts",
        "nested_blocks (legal): FAIL in 21 of 21 layouts",
        "parameters (legal): FAIL in 21 of 21 layouts",
        "receivers_and_groups (legal): FAIL in 21 of 21 layouts",
    ]
    assert titles[4].startswith("illegal (illegal): ") and titles[4].endswith(" forbid contacts in 21 layouts")
    # The example only designs set_get's top and bottom edges.
    first_sketch = sections[0].splitlines()
    assert "  line 5 [call:p5.createCanvas] [num(500)] @0: connect nothing, should snap (21 of 21 layouts)" in first_sketch
    assert not any("[set(x)to] over [set(y)to]" in line for line in first_sketch)
    illegal = sections[4].splitlines()
    assert "  line 6 [if] over line 7 [dedent] @0: forbid nice weak (21 of 21 layouts)" in illegal
    assert "  line 10 [set(y)to] over line 11 [define(inner)] @0: forbid nice weak, unavoidable (21 of 21 layouts)" in illegal
    assert "  line 3 [(] [)] @0: forbid should weak (21 of 21 layouts)" in illegal
    # stdout has each program's status after the summary.
    assert "\nINVALID\n\nPrograms:\n  first_sketch (legal): FAIL in 21 of 21 layouts\n" in run.stdout
    assert "programs.txt" in run.stdout


def test_search_writes_an_arrangement_that_check_accepts(tmp_path):
    found = tmp_path / "found.yaml"
    classes = "set_get,literal,call_printed,operator"
    run = subprocess.run(
        [*MAGNETS, "search", "--flip", "top_bottom", "--classes", classes, "--time-limit", "2", "--workers", "1",
         "--out", str(found)],
        capture_output=True,
        text=True,
        check=True,
    )
    # The arrangement, and next to it the checker's reports on it.
    assert found.is_file()
    summary = (tmp_path / "found" / "summary.txt").read_text()
    assert (tmp_path / "found" / "contacts.csv").is_file()
    assert summary in run.stdout
    assert summary.startswith("Arrangement: found (flip top_bottom, lengths up to 6U)\n")
    status = summary.split("Search: ")[1].splitlines()[0]
    assert status.startswith(("optimal", "feasible")) and "objective" in status and "bound" in status
    assert "classes set_get, literal, call_printed, operator; seed 0, 1 worker, time limit 2s" in summary
    assert summary.endswith("\nVALID\n")

    checked = subprocess.run(
        [*MAGNETS, "check", str(found), "--classes", classes, "--out", str(tmp_path / "rechecked")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert (tmp_path / "rechecked" / "summary.txt").read_text().endswith("\nVALID\n")
    # The bundled programs use classes outside the search.
    assert not (tmp_path / "rechecked" / "programs.txt").exists()
    assert "programs.txt" not in checked.stdout


def test_an_infeasible_search_names_the_conflict_and_writes_the_fewest_failures(tmp_path):
    # Nothing on the right of a [num] can snap if its right edge is empty,
    # nor, under left_right, on the left of a [str], whose left edge it is.
    pin = tmp_path / "pin.yaml"
    pin.write_text("flip: left_right\nclasses:\n  literal:\n    right: []\n")
    found = tmp_path / "found.yaml"
    run = subprocess.run(
        [*MAGNETS, "search", "--flip", "left_right", "--classes", "set_get,literal", "--pin", str(pin),
         "--time-limit", "5", "--workers", "1", "--out", str(found)],
        capture_output=True,
        text=True,
        check=False,
    )
    # It writes an arrangement, but not a valid one.
    assert run.returncode == 1
    summary = (tmp_path / "found" / "summary.txt").read_text()
    assert summary in run.stdout
    assert summary.split("Search: ")[1].startswith("infeasible in ")
    assert "\n  Fewest must failures (optimal): " in summary
    listed = summary.split("  Conflicting requirements: ")[1].splitlines()
    conflicts = listed[1 : 1 + int(listed[0])]
    assert conflicts and all(line.startswith("    ") and line.endswith(" @0: connect") for line in conflicts)
    assert all(line.startswith("    [num(…)] ") or " [str(…)] @0" in line for line in conflicts)
    assert summary.endswith("\nINVALID\n")
    # The fewest-failures arrangement keeps the pinned empty edge.
    assert "right" not in yaml.safe_load(found.read_text())["classes"]["literal"]
