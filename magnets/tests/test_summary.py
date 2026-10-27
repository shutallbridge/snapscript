"""The summary counts both contact groups and contacts, and lists unavoidable leaks
at should and nice only."""

import re
from collections import Counter
from pathlib import Path

import pytest

from helpers import check_pairs, set_get
from magnets import check, solve
from magnets.reports import arrangement_text, summary_text

GROUPS_HEADING = "Contact groups by kind and result"
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


def test_contact_groups_are_not_called_contacts(flips):
    summary = summary_text(flips["top_bottom"])
    assert f"\n{GROUPS_HEADING}:" in summary
    assert f"\n{CONTACTS_HEADING} " in summary


def test_both_flips_have_the_same_contacts_in_different_contact_groups(flips):
    def by_kind(counts):
        return {k: sum(n for (kind, _), n in counts.items() if kind == k) for k in KINDS}

    def counts(results, heading):
        return {flip: by_kind(table(summary_text(r), heading)) for flip, r in results.items()}

    # 27 sides, each pair at 25 length pairs (2U to 6U): 5 horizontal
    # offsets each, and 875 (length pair, quarter-U offset) overlaps above each other.
    assert "\n37908 contact groups, 656100 contacts\n" in summary_text(flips["top_bottom"])
    assert "\n37908 contact groups, 656100 contacts\n" in summary_text(flips["left_right"])
    # With nothing unavoidable, the bundled card set's contact groups are the same under both flips.
    assert counts(flips, GROUPS_HEADING)["top_bottom"] == counts(flips, GROUPS_HEADING)["left_right"]
    # With the TOY_PAIRS data, left_right splits some forbid contact groups by
    # whether they are unavoidable.
    toy = {flip: check_pairs({"flip": flip}) for flip in flips}
    assert counts(toy, CONTACTS_HEADING)["top_bottom"] == counts(toy, CONTACTS_HEADING)["left_right"]
    assert "\n37984 contact groups, 656100 contacts\n" in summary_text(toy["left_right"])
    assert counts(toy, GROUPS_HEADING)["top_bottom"] != counts(toy, GROUPS_HEADING)["left_right"]


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_contact_counts_sum_group_counts(flips, flip):
    result = flips[flip]
    expected: Counter = Counter()
    groups: Counter = Counter()
    for g in result.groups:
        for label in g.labels:
            expected[label.kind, g.result] += g.count
            groups[label.kind, g.result] += 1
            if label.unavoidable:
                expected["unavoidable", g.result] += g.count
                groups["unavoidable", g.result] += 1
    summary = summary_text(result)
    assert {k: n for k, n in table(summary, CONTACTS_HEADING).items() if n} == expected
    assert {k: n for k, n in table(summary, GROUPS_HEADING).items() if n} == groups


def test_the_pocket_line_counts_front_pockets_by_shape():
    # The example designs simple_head's and get's top (F/F) and bottom (N/S), and
    # literal's left (F/F) and right (N/S); str, literal's back, shares them.
    lines = summary_text(check("example")).splitlines()
    # Right after the contact group line.
    assert lines[1].endswith(" contacts") and lines[2] == "Pockets: 6 (uniform 3, half 0, split 3)"
    toy = set_get(top=[("left", 0.25, "N/N")], bottom=[("left", 0.25, "N/-")], left=[(0.5, "-/S")], right=[])
    assert "\nPockets: 3 (uniform 1, half 2, split 0)\n" in summary_text(check_pairs(toy))


def test_unavoidable_low_leaks_are_counted_not_listed():
    # On the TOY_PAIRS data, under left_right a 4U [set{x}to] over a 2U [set{x}to] @+2 (forbid low)
    # snaps exactly like [get{x}] over [get{x}] @0 (connect), and
    # [set{x}to][set{x}to] (forbid should) like [get{x}][get{x}].
    toy = set_get(
        "left_right",
        top=[("right", 0.25, "S/-")],
        bottom=[("right", 0.25, "N/-")],
        left=[(0.5, "S/-")],
        right=[(0.5, "N/-")],
    )
    summary = summary_text(check_pairs(toy))
    count, listed = section(summary, "Unavoidable should- and nice-leaks")
    assert count == len(listed) == 3
    assert "  [set{x}to] [set{x}to] @0: forbid should snap (attract 1, repel 0)" in listed
    assert "  [set{x}to] over [set{x}to] @+1: forbid should snap (attract 1, repel 0, lengths 3x2)" in listed
    assert not any(" low " in line for line in summary.splitlines() if line.startswith("  "))
    low, listed = section(summary, "Unavoidable low-leaks (not listed)")
    assert (low, listed) == (6, [])


ROOT = Path(__file__).parents[1]
SOURCES = [*ROOT.glob("src/magnets/*.py"), ROOT / "README.md"]


@pytest.mark.parametrize("path", SOURCES, ids=lambda p: str(p.relative_to(ROOT)))
def test_partner_is_always_a_partner_contact(path):
    # `partner_left` and the like are names, not text.
    bare = re.findall(r"\bpartner\b(?! contact)(?!_)", path.read_text())
    assert not bare


def test_an_infeasible_search_names_its_goal():
    # Nothing on the right of a [num] can snap if its right edge is empty.
    pinned = {"flip": "left_right", "classes": {"literal": {"right": []}}}
    result = solve(
        "left_right", goal="no_snap", classes=["simple_head", "literal"], pinned=pinned, time_limit=5, workers=1
    )
    assert result.status == "infeasible"
    assert "\nSearch (goal no_snap): infeasible in " in summary_text(result.check, result)
    assert "\n# Search (goal no_snap): infeasible in " in arrangement_text(result.arrangement, result)
