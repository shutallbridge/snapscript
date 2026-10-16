"""The summary counts both rows and contacts, and lists unavoidable leaks
at should and nice only."""

import re
from collections import Counter
from pathlib import Path

import pytest

from helpers import set_get
from magnets import check
from magnets.reports import summary_text

ROWS_HEADING = "Rows by kind and result"
CONTACTS_HEADING = "Contacts by kind and result"
KINDS = ("connect", "forbid", "coexist", "ungraded")


def table(summary, heading):
    """{(kind, result): count} of the table under `heading`."""
    block = summary.split(heading)[1].split("\n\n")[0].splitlines()[1:]
    results = block[0].split()
    return {
        (row.split()[0], result): int(n)
        for row in block[1:]
        for result, n in zip(results, row.split()[1:])
    }


def section(summary, heading):
    """The lines listed under `heading: N`, and N."""
    head, _, rest = summary.partition(f"\n{heading}: ")
    assert rest, heading
    count, *lines = rest.split("\n\n")[0].splitlines()
    return int(count), lines


@pytest.fixture(scope="module")
def flips():
    return {flip: check({"flip": flip}) for flip in ("top_bottom", "left_right")}


def test_rows_are_not_called_contacts(flips):
    summary = summary_text(flips["top_bottom"])
    assert f"\n{ROWS_HEADING} " in summary
    assert f"\n{CONTACTS_HEADING} " in summary


def test_both_flips_have_the_same_contacts_in_different_rows(flips):
    rows = {flip: table(summary_text(r), ROWS_HEADING) for flip, r in flips.items()}
    contacts = {flip: table(summary_text(r), CONTACTS_HEADING) for flip, r in flips.items()}

    def by_kind(counts):
        return {k: sum(n for (kind, _), n in counts.items() if kind == k) for k in KINDS}

    assert by_kind(contacts["top_bottom"]) == by_kind(contacts["left_right"])
    assert "\n29952 rows, 650928 contacts\n" in summary_text(flips["top_bottom"])
    assert "\n30044 rows, 650928 contacts\n" in summary_text(flips["left_right"])
    # left_right splits some forbid rows by whether they are unavoidable.
    assert by_kind(rows["top_bottom"]) != by_kind(rows["left_right"])


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_contact_counts_sum_collapsed(flips, flip):
    result = flips[flip]
    expected: Counter = Counter()
    rows: Counter = Counter()
    for c in result.contacts:
        for label in c.labels:
            expected[label.kind, c.result] += c.collapsed
            rows[label.kind, c.result] += 1
            if label.unavoidable:
                expected["unavoidable", c.result] += c.collapsed
                rows["unavoidable", c.result] += 1
    summary = summary_text(result)
    assert {k: n for k, n in table(summary, CONTACTS_HEADING).items() if n} == expected
    assert {k: n for k, n in table(summary, ROWS_HEADING).items() if n} == rows


def test_unavoidable_low_leaks_are_counted_not_listed():
    # Under left_right a 3U [set(x)to] over a 1U [set(x)to] @+2 (forbid low)
    # snaps exactly like [get(x)] over [get(x)] @0 (connect), and
    # [set(x)to][set(x)to] (forbid should) like [get(x)][get(x)].
    toy = set_get(
        "left_right",
        top=[("right", 0.25, "S/-")],
        bottom=[("right", 0.25, "N/-")],
        left=[(0.5, "S/-")],
        right=[(0.5, "N/-")],
    )
    summary = summary_text(check(toy))
    count, listed = section(summary, "Unavoidable should- and nice-leaks")
    assert count == len(listed) == 3
    assert "  [set(x)to] [set(x)to] @0: forbid should snap (attract 1, repel 0)" in listed
    assert "  [set(x)to] over [set(x)to] @+1: forbid should snap (attract 1, repel 0, lengths 2x1)" in listed
    assert not any(" low " in line for line in summary.splitlines() if line.startswith("  "))
    low, listed = section(summary, "Unavoidable low-leaks (not listed)")
    assert (low, listed) == (8, [])


ROOT = Path(__file__).parents[1]
SOURCES = [*ROOT.glob("src/magnets/*.py"), ROOT / "README.md"]


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(ROOT)))
def test_partner_is_always_a_partner_contact(path):
    # `partner_left` and the like are names, not text.
    bare = re.findall(r"\bpartner\b(?! contact)(?!_)", path.read_text())
    assert not bare
