"""Smoke test: `magnets check` runs and writes its reports."""

import csv
import re
import subprocess
import sys

import pytest
import yaml

SET_AND_GET = {"simple_head.head", "get.get"}

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
    # Only simple_head's, get's and literal's edges have pockets, so every other connect fails.
    assert "\nINVALID\n" in summary

    columns, rows = read_csv(out / "contacts.csv")
    assert columns == COLUMNS
    stacks = [
        r
        for r in rows
        if r["axis"] == "vertical" and {r["upper_or_left"], r["lower_or_right"]} <= SET_AND_GET
    ]
    assert len(stacks) == 4
    assert {(r["kind"], r["result"], r["grade"]) for r in stacks} == {("connect", "snap", "pass")}


def test_check_reports_horizontal_contacts(tmp_path):
    # simple_head's right and left pockets, and get's in the other layer.
    toy = tmp_path / "toy.yaml"
    toy.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  simple_head:\n"
        "    left: [{at: 1/2, layers: S/-}]\n"
        "    right: [{at: 1/2, layers: N/-}]\n"
        "  get:\n"
        "    left: [{at: 1/2, layers: -/S}]\n"
        "    right: [{at: 1/2, layers: -/N}]\n"
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
        and {r["upper_or_left"], r["lower_or_right"]} <= SET_AND_GET
    }
    assert on_line == {
        # [set][set]: open -> head. N/- meets S/- and snaps.
        ("simple_head.head", "simple_head.head"): ("forbid", "should", "snap", "leak"),
        # [get][get]: value -> value. -/N meets -/S.
        ("get.get", "get.get"): ("connect", "must", "snap", "pass"),
        # [set][get]: open -> value. N/- meets -/S: nothing faces.
        ("simple_head.head", "get.get"): ("connect", "must", "nothing", "FAIL"),
        # [get][set]: value -> head. -/N meets S/-.
        ("get.get", "simple_head.head"): ("forbid", "should", "nothing", "weak"),
    }
    row = next(r for r in rows if (r["upper_or_left"], r["lower_or_right"]) == ("simple_head.head", "simple_head.head"))
    assert (row["edge_a"], row["edge_b"], row["lengths"], row["count"]) == ("right", "left", "2x2", "25")
    assert row["unavoidable"] == "False"

    assert "[get{x}] [get{x}] @0" not in run.stdout
    assert "  [set{x}to] [get{x}] @0: connect nothing" in run.stdout
    # [set{x}to] and [get{x}] are separate cards, so [set{x}to][set{x}to] is not tied to
    # [get{x}][get{x}]: its leak is avoidable.
    leaks = run.stdout.split("Avoidable should-leaks: 1\n")[1]
    assert leaks.startswith("  [set{x}to] [set{x}to] @0: forbid snap (attract 1, repel 0)\n")
    assert "Unavoidable should- and nice-leaks: 0\n" in run.stdout


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
        "  simple_head:\n"
        "    top: [{from: left, at: 1/6, layers: N/N}]\n"
        "    bottom: [{from: left, at: 1/6, layers: N/N}]\n"
    )
    run = subprocess.run(
        [*MAGNETS, "check", str(nn), "--out", str(tmp_path / "reports")],
        capture_output=True,
        text=True,
        check=True,
    )
    assert "[set{x}to] over [set{x}to] @0: connect repel" in run.stdout
    assert "\nINVALID\n" in run.stdout


def test_check_reports_vertical_contacts(tmp_path):
    # num's top and bottom repel each other; simple_head's bottom snaps to define's top.
    toy = tmp_path / "toy.yaml"
    toy.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  literal:\n"
        "    top: [{from: left, at: 1/6, layers: N/-}]\n"
        "    bottom: [{from: left, at: 1/6, layers: N/-}]\n"
        "  simple_head:\n"
        "    bottom: [{from: left, at: 1/6, layers: N/-}]\n"
        "  define:\n"
        "    top: [{from: left, at: 1/6, layers: S/-}]\n"
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
        ("bottom", "top", "2x2", "25", "coexist", "must", "repel", "FAIL"),
        ("bottom", "top", "2x2", "25", "forbid", "should", "repel", "strong"),
    ]
    # Contact groups where no pockets line up have no row unless they are connect.
    assert not any(
        r["axis"] == "vertical" and (r["upper_or_left"], r["lower_or_right"]) == ("literal.num", "literal.num")
        and r["offset"] != "0"
        for r in rows
    )

    summary = (out / "summary.txt").read_text()
    table = summary.split("Contacts by kind and result")[1].split("\n\n")[0].splitlines()[1:]
    # The bundled flip pairs take the same roles on both sides: nothing is
    # unavoidable, and a row of zeros is left out.
    assert [row.split()[0] for row in table[1:]] == ["connect", "forbid", "coexist", "ungraded"]
    assert "  [num{…}] over [num{…}] @0: coexist repel (attract 0, repel 1, lengths 2x2)\n" in summary
    # num's and simple_head's bottom N/- snap to define's top S/-.
    nice_leaks = summary.split("Avoidable nice-leaks: 2\n")[1].split("\n\n")[0]
    assert sorted(nice_leaks.splitlines()) == [
        "  [num{…}] over [define{f}] @0: forbid snap (attract 1, repel 0, lengths 2x2)",
        "  [set{x}to] over [define{f}] @0: forbid snap (attract 1, repel 0, lengths 2x2)",
    ]
    assert "Unavoidable should- and nice-leaks: 0\n" in summary
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
    # Two [set{x}to], two [get{x}] and seven [num] at 4 magnets each.
    assert titles[0] == "first_sketch (legal): FAIL in 21 of 21 layouts, 44 magnets"
    for title, name in zip(titles[1:4], ("nested_blocks", "parameters", "receivers_and_groups")):
        assert re.fullmatch(rf"{name} \(legal\): FAIL in 21 of 21 layouts, \d+ magnets", title)
    assert titles[4].startswith("illegal (illegal): ") and titles[4].endswith(" forbid contacts in 21 layouts")
    # The example only designs simple_head's, get's and literal's edges.
    first_sketch = sections[0].splitlines()
    assert "  line 5 [call(p5.createCanvas)] [num{500}] @0: connect nothing, should snap (21 of 21 layouts)" in first_sketch
    assert not any("[set{x}to] over [set{y}to]" in line for line in first_sketch)
    illegal = sections[4].splitlines()
    assert "  line 6 [if] over line 7 [dedent] @0: forbid nice weak (21 of 21 layouts)" in illegal
    assert "  line 10 [set{y}to] over line 11 [define{inner}] @0: forbid nice weak (21 of 21 layouts)" in illegal
    assert "  line 3 [(] [)] @0: forbid should weak (21 of 21 layouts)" in illegal
    # stdout has each program's status after the summary.
    assert "\nINVALID\n\nPrograms:\n  first_sketch (legal): FAIL in 21 of 21 layouts, 44 magnets\n" in run.stdout
    assert "programs.txt" in run.stdout


def test_search_writes_an_arrangement_that_check_accepts(tmp_path):
    found = tmp_path / "found.yaml"
    classes = "simple_head,get,call,literal,operator"
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
    status = summary.split("Search (goal no_snap): ")[1].splitlines()[0]
    assert status.startswith(("optimal", "feasible")) and "objective" in status and "bound" in status
    assert "classes simple_head, get, call, literal, operator; seed 0, 1 worker, time limit 2s" in summary
    assert summary.endswith("\nVALID\n")
    # The arrangement's header copies the search lines, goal and all.
    assert found.read_text().startswith(
        "# Found by `magnets search`, lengths up to 6U.\n# Search (goal no_snap): "
    )
    # Positions are written as exact fractions, which YAML reads as text.
    written = [
        pocket["at"]
        for edges in yaml.safe_load(found.read_text())["classes"].values()
        for pockets in edges.values()
        for pocket in pockets
    ]
    assert written and set(written) <= {"1/6", "1/2", "5/6", "7/6", "3/2", "11/6"}
    assert "0.16" not in found.read_text() and "0.83" not in found.read_text()

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
        [*MAGNETS, "search", "--flip", "left_right", "--classes", "simple_head,literal", "--pin", str(pin),
         "--time-limit", "5", "--workers", "1", "--out", str(found)],
        capture_output=True,
        text=True,
        check=False,
    )
    # It writes an arrangement, but not a valid one.
    assert run.returncode == 1
    summary = (tmp_path / "found" / "summary.txt").read_text()
    assert summary in run.stdout
    assert summary.split("Search (goal no_snap): ")[1].startswith("infeasible in ")
    assert "\n# Search (goal no_snap): infeasible in " in found.read_text()
    assert "\n  Fewest must failures (optimal): " in summary
    listed = summary.split("  Conflicting requirements: ")[1].splitlines()
    conflicts = listed[1 : 1 + int(listed[0])]
    assert conflicts and all(line.startswith("    ") and line.endswith(" @0: connect") for line in conflicts)
    assert all(line.startswith("    [num{…}] ") or " [str{…}] @0" in line for line in conflicts)
    assert summary.endswith("\nINVALID\n")
    # The fewest-failures arrangement keeps the pinned empty edge.
    assert "right" not in yaml.safe_load(found.read_text())["classes"]["literal"]


def test_search_names_its_default_output_after_the_flip_and_goal(tmp_path):
    run = subprocess.run(
        [*MAGNETS, "search", "--flip", "left_right", "--goal", "no_snap", "--classes", "simple_head,literal",
         "--time-limit", "2", "--workers", "1"],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    out = tmp_path / "out"
    assert (out / "search_left_right_no_snap.yaml").is_file()
    assert (out / "search_left_right_no_snap" / "summary.txt").is_file()
    assert (out / "search_left_right_no_snap" / "contacts.csv").is_file()
    assert "Wrote out/search_left_right_no_snap.yaml" in run.stdout


def test_search_defaults_to_the_no_snap_goal(tmp_path):
    subprocess.run(
        [*MAGNETS, "search", "--flip", "left_right", "--classes", "simple_head,literal", "--time-limit", "2",
         "--workers", "1"],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    summary = (tmp_path / "out" / "search_left_right_no_snap" / "summary.txt").read_text()
    assert "\nSearch (goal no_snap): " in summary


def test_search_rejects_an_unknown_goal():
    run = subprocess.run([*MAGNETS, "search", "--flip", "top_bottom", "--goal", "push"], capture_output=True, text=True, check=False)
    assert run.returncode == 2
    assert "invalid choice: 'push'" in run.stderr


def test_print_writes_the_cards_as_html(tmp_path):
    program = tmp_path / "prog.txt"
    program.write_text("// two cards\n[set{score}to][num{500}]\n")
    run = subprocess.run(
        [*MAGNETS, "print", "example", "--program", str(program)],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    html = (tmp_path / "out" / "example" / "cards.html").read_text()
    assert "Wrote out/example/cards.html" in run.stdout
    assert 'width="210mm" height="297mm"' in html
    assert "// two cards" in html
    assert "[set{score}to]" in html and "[num{500}]" in html and "[str{500}]" in html

    other = tmp_path / "elsewhere.html"
    subprocess.run(
        [*MAGNETS, "print", "example", "--program", str(program), "--unit", "20", "--out", str(other)],
        check=True,
        capture_output=True,
    )
    assert other.is_file()


def test_print_rejects_bad_input(tmp_path):
    program = tmp_path / "prog.txt"
    program.write_text("[set{x}to]\n")
    bad = tmp_path / "bad.yaml"
    bad.write_text("flip: sideways\n")
    unknown = tmp_path / "unknown.txt"
    unknown.write_text("[nope]\n")
    for args, message in [
        ([str(bad), "--program", str(program)], "invalid arrangement: unknown flip"),
        (["example", "--program", str(tmp_path / "missing.txt")], "program file not found"),
        (["example", "--program", "my-prog"], "program file not found: my-prog"),
        (["example", "--program", str(unknown)], "unknown card [nope]"),
        (["example", "--seed", "0"], "--seed names one of check's draws, 1 or more, not 0"),
    ]:
        run = subprocess.run([*MAGNETS, "print", *args], capture_output=True, text=True, cwd=tmp_path)
        assert run.returncode == 2, args
        assert message in run.stderr


def test_print_on_letter_paper_with_a_ruler_on_every_page(tmp_path):
    program = tmp_path / "prog.txt"
    program.write_text("".join(f"[if][num{{{i}}}]\n" for i in range(20)))
    out = tmp_path / "cards.html"
    run = subprocess.run(
        [*MAGNETS, "print", "example", "--program", str(program), "--paper", "letter", "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    html = out.read_text()
    pages = html.count("<svg ")
    assert pages > 1 and f"on {pages} page(s)" in run.stdout
    assert html.count('width="215.9mm" height="279.4mm"') == pages
    assert "size: letter portrait" in html
    assert html.count("50 mm") == pages


def test_print_rejects_a_card_too_long_for_the_page(tmp_path):
    program = tmp_path / "prog.txt"
    program.write_text("[if]\n")
    run = subprocess.run(
        [*MAGNETS, "print", "example", "--program", str(program), "--unit", "100"],
        capture_output=True,
        text=True,
        cwd=tmp_path,
    )
    assert run.returncode == 2
    assert "[if] is too long for a4 paper" in run.stderr
    assert "the largest unit that fits is 95 mm" in run.stderr


BUNDLED = ["first_sketch", "nested_blocks", "parameters", "receivers_and_groups", "illegal"]


def test_print_every_bundled_program_by_default(tmp_path):
    run = subprocess.run([*MAGNETS, "print", "example"], capture_output=True, text=True, check=True, cwd=tmp_path)
    html = (tmp_path / "out" / "example" / "cards.html").read_text()
    assert "Wrote out/example/cards.html" in run.stdout
    headings = [html.index(f">{name} (min lengths)<") for name in BUNDLED]
    assert headings == sorted(headings)
    assert html.count("these neighbours should not snap") == 1
    assert headings[-1] < html.index("these neighbours should not snap")


def test_print_a_bundled_program_by_name_at_a_draws_lengths(tmp_path):
    out = tmp_path / "cards.html"
    subprocess.run(
        [*MAGNETS, "print", "example", "--program", "nested_blocks", "--seed", "3", "--out", str(out)],
        capture_output=True,
        check=True,
        cwd=tmp_path,
    )
    html = out.read_text()
    assert html.count(">nested_blocks (draw 3, seed 0)<") == html.count("<svg ")
    assert not any(name in html for name in BUNDLED if name != "nested_blocks")


def test_print_rejects_an_unknown_program_name(tmp_path):
    run = subprocess.run([*MAGNETS, "print", "example", "--program", "nope"], capture_output=True, text=True, cwd=tmp_path)
    assert run.returncode == 2
    assert f"no bundled program named 'nope'; expected one of {', '.join(BUNDLED)}" in run.stderr


def test_check_reports_off_line_offsets_as_exact_fractions(tmp_path):
    # simple_head's right pocket at 1/6 meets its own left pocket at 1/2 when
    # the right card sits 1/3 U higher.
    toy = tmp_path / "toy.yaml"
    toy.write_text(
        "flip: top_bottom\n"
        "classes:\n"
        "  simple_head:\n"
        "    left: [{at: 1/2, layers: S/-}]\n"
        "    right: [{at: 1/6, layers: N/-}]\n"
    )
    out = tmp_path / "reports"
    subprocess.run([*MAGNETS, "check", str(toy), "--out", str(out)], capture_output=True, text=True, check=True)
    _, rows = read_csv(out / "contacts.csv")
    [row] = [
        r for r in rows
        if r["axis"] == "horizontal" and (r["upper_or_left"], r["lower_or_right"]) == ("simple_head.head",) * 2
    ]
    assert (row["offset"], row["result"], row["grade"]) == ("-1/3", "snap", "leak")


def file_names(directory):
    return sorted(p.relative_to(directory).as_posix() for p in directory.rglob("*") if p.is_file())


def test_bases_writes_every_frame_of_the_example(tmp_path):
    run = subprocess.run([*MAGNETS, "bases", "example"], capture_output=True, text=True, check=True, cwd=tmp_path)
    out = tmp_path / "out" / "example" / "bases"
    expected = [f"frames/{cls}-{n}u.stl" for cls in ("get", "literal", "simple_head") for n in range(2, 7)]
    assert file_names(out) == expected
    assert "15 frames" in run.stdout
    assert (out / "frames" / "get-2u.stl").read_bytes()[:5] != b"solid"  # binary STL


def test_bases_classes_max_length_and_out_narrow_and_move_it(tmp_path):
    out = tmp_path / "mine"
    subprocess.run(
        [*MAGNETS, "bases", "example", "--classes", "get,on", "--max-length", "3", "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
        cwd=tmp_path,
    )
    assert file_names(out) == ["frames/get-2u.stl", "frames/get-3u.stl", "frames/on-2u.stl", "frames/on-3u.stl"]
    assert not (tmp_path / "out").exists()


@pytest.mark.parametrize(
    "args, message",
    [
        (["nope.yaml"], "invalid arrangement"),
        (["example", "--classes", "nope"], "unknown card class"),
        (["example", "--max-length", "1"], "max_length 1"),
        (["example", "--magnet-clearance", "-0.1"], "magnet_clearance must be 0 or more"),
        (["example", "--slide-clearance", "2"], "tolerances leave no wall"),
        (["example", "--magnet-depth-clearance", "x"], "invalid float value"),
    ],
)
def test_bases_exits_2_for_a_bad_arrangement_or_tolerance(tmp_path, args, message):
    run = subprocess.run([*MAGNETS, "bases", *args], capture_output=True, text=True, cwd=tmp_path)
    assert run.returncode == 2
    assert message in run.stderr
    assert not (tmp_path / "out").exists()


# `magnets` as if installed without the `bases` extra: importing build123d fails.
WITHOUT_BASES = [
    sys.executable,
    "-c",
    "import sys; sys.modules['build123d'] = None; from magnets.cli import main; sys.exit(main())",
]


@pytest.mark.parametrize(
    "args",
    [
        ["check", "example"],
        ["search", "--flip", "top_bottom", "--classes", "simple_head,get", "--time-limit", "5"],
        ["print", "example"],
    ],
)
def test_check_search_and_print_run_without_the_bases_extra(tmp_path, args):
    subprocess.run([*WITHOUT_BASES, *args], capture_output=True, text=True, check=True, cwd=tmp_path)


def test_bases_without_its_extra_says_how_to_get_it(tmp_path):
    run = subprocess.run([*WITHOUT_BASES, "bases", "example"], capture_output=True, text=True, cwd=tmp_path)
    assert run.returncode == 1
    assert "`bases` extra" in run.stderr
