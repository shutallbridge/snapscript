"""Smoke test: `magnets check` runs and writes its reports."""

import csv
import subprocess
import sys

MAGNETS = [sys.executable, "-m", "magnets.cli"]


def test_check_writes_summary_and_csv(tmp_path):
    out = tmp_path / "reports"
    run = subprocess.run(
        [*MAGNETS, "check", "example", "--out", str(out)],
        capture_output=True,
        text=True,
        check=True,
    )
    summary = (out / "summary.txt").read_text()
    assert "VALID" in summary and "INVALID" not in summary
    assert "Must failures: 0" in summary
    assert summary in run.stdout

    with (out / "contacts.csv").open() as f:
        rows = list(csv.DictReader(f))
    assert len(rows) == 4
    assert {(r["kind"], r["result"], r["grade"]) for r in rows} == {("connect", "snap", "pass")}


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
