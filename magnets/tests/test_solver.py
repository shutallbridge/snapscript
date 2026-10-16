"""The CP-SAT search, on small problems with short time limits."""

from fractions import Fraction

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import arrangement, beside, left_right_pockets, set_get, top_bottom_pockets
from magnets import check, solve

# A reduced problem: two flip pairs, a call and an operator.
CLASSES = ["set_get", "literal", "call_printed", "operator"]


def test_a_reduced_problem_solves_to_a_valid_arrangement():
    result = solve("top_bottom", classes=CLASSES, time_limit=5, workers=1)
    assert result.status in ("optimal", "feasible")
    assert result.arrangement.flip == "top_bottom"
    assert set(result.arrangement.fronts) == set(CLASSES)
    # The checker agrees, independently of the solver's own grading.
    regraded = check(result.arrangement, classes=CLASSES)
    assert regraded.must_failures == []
    assert regraded.valid
    assert result.check.valid


def test_the_same_seed_with_one_worker_repeats_its_arrangement():
    # The search stops at its time limit before proving optimality, so this
    # also covers a search cut short.
    first, second = (solve("top_bottom", classes=CLASSES, seed=7, time_limit=2, workers=1) for _ in range(2))
    assert first.arrangement == second.arrangement
    assert (first.status, first.objective, first.bound) == (second.status, second.objective, second.bound)


# The objective, from issue #10: a forbid's priority weight times its grade's
# penalty, for every contact; plus a cost per pocket by its shape.
WEIGHTS = {"should": 10, "nice": 1, "low": 0}
PENALTIES = {"leak": 1, "partial": Fraction(1, 2), "weak": Fraction(1, 5), "strong": 0}
SHAPE_COSTS = {"uniform": Fraction(1, 100), "half": Fraction(15, 1000), "split": Fraction(2, 100)}


def objective(checked):
    """The objective of a checked arrangement, from its grades and pockets."""
    forbids = sum(
        WEIGHTS[label.priority] * PENALTIES[label.grade] * contact.collapsed
        for contact in checked.contacts
        for label in contact.labels
        if label.kind == "forbid" and not label.unavoidable
    )
    pockets = sum(
        SHAPE_COSTS[pocket.shape]
        for edges in checked.arrangement.fronts.values()
        for pockets in edges.values()
        for pocket in pockets
    )
    return forbids + pockets


def test_the_reported_objective_is_the_checkers():
    result = solve("top_bottom", classes=CLASSES, time_limit=3, workers=1)
    assert result.objective == objective(check(result.arrangement, classes=CLASSES))
    assert result.bound <= result.objective


def test_a_check_can_be_restricted_to_some_classes():
    result = check("example", classes=["set_get", "literal"])
    assert {name for c in result.contacts for name in (c.a, c.b)} == {
        "set_get.set",
        "set_get.get",
        "literal.num",
        "literal.str",
    }
    with pytest.raises(ValueError, match="unknown card class.*teapot"):
        check("example", classes=["set_get", "teapot"])


def test_a_reduced_problem_solves_under_the_left_right_flip():
    result = solve("left_right", classes=CLASSES, time_limit=5, workers=1)
    assert result.status in ("optimal", "feasible")
    assert result.arrangement.flip == "left_right"
    regraded = check(result.arrangement, classes=CLASSES)
    assert regraded.valid
    assert result.objective == objective(regraded)


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_solving_the_halves_apart_finds_the_same_optimum_as_one_model(flip):
    # Left/right edges only ever face left/right edges, and top/bottom edges
    # top/bottom edges, so the two halves of the problem are independent.
    small = dict(classes=["set_get", "literal"], max_length=3, time_limit=20, workers=1)
    apart, together = solve(flip, **small), solve(flip, split=False, **small)
    assert (apart.status, together.status) == ("optimal", "optimal")
    assert apart.objective == together.objective


def design(arrangement):
    """Each class's edges as sets of pockets, whatever order they're listed in."""
    return {
        name: {edge: {(p.anchor, p.at, p.layers) for p in pockets} for edge, pockets in edges.items()}
        for name, edges in arrangement.fronts.items()
    }


def test_pinning_the_example_keeps_its_set_get_design():
    example = design(check("example", classes=CLASSES).arrangement)["set_get"]
    result = solve("top_bottom", classes=CLASSES, pinned="example", time_limit=3, workers=1)
    assert result.status in ("optimal", "feasible")
    found = design(result.arrangement)["set_get"]
    assert (found["top"], found["bottom"]) == (example["top"], example["bottom"])
    # The example doesn't mention set_get's left and right edges, nor the
    # other classes, so the search designs them.
    assert found["left"] and found["right"]
    assert result.check.valid


def test_pinned_empty_edges_stay_empty():
    # Left free, the search puts pockets on the operator's top and bottom
    # edges to keep illegal neighbours from snapping.
    pinned = {"flip": "top_bottom", "classes": {"operator": {"top": [], "bottom": []}}}
    result = solve("top_bottom", classes=CLASSES, pinned=pinned, time_limit=3, workers=1)
    assert result.status in ("optimal", "feasible")
    operator = result.arrangement.fronts["operator"]
    assert (operator["top"], operator["bottom"]) == ((), ())
    assert result.check.valid


# A contradictory toy grammar: a 1U line head must take the next line in the
# same column, indented by 1U and outdented by 1U. An indent onto a shorter
# card needs a `from: right` pocket on the bottom edge, an outdent under a
# 2U card one on the top edge, and lining these up with the pockets of the
# same column takes a `from: left` and a `from: right` pocket that collide
# on a 1U card. (Real block heads and [dedent] are 2U for this reason.)
HEAD = {"left": "head", "right": "end", "top": "line", "bottom": "line"}
CROWDED_CLASSES = {"line_head": {"min_length": 1, "sides": {"head": {"[head]": HEAD}}}}
CROWDED_RULES = {
    "roles": {"left": ["head"], "right": ["end"], "top": ["line"], "bottom": ["line"]},
    "priorities": {"should": 10, "low": 0},
    "horizontal": {"connect": {"end": []}, "forbid": "should", "off_line": "low"},
    "vertical": {
        "offsets": [-1, 0, 1],
        "connect": [{"upper": "line", "lower": "line", "offset": d} for d in (-1, 0, 1)],
        "forbid": "should",
        "off_line": "low",
        "coexist": {"never": [], "line_heads": ["line"], "not_inline": ["head"]},
    },
}
CROWDED = dict(class_data=CROWDED_CLASSES, rule_data=CROWDED_RULES, max_length=2)


def must_failures(checked):
    """Failing contacts per must contact, from the checker."""
    found = {}
    for c, label in checked.must_failures:
        key = (c.axis, c.a, c.b, c.offset, label.kind)
        found[key] = found.get(key, 0) + c.collapsed
    return found


def test_a_contradictory_grammar_is_infeasible_and_names_the_conflict():
    result = solve("top_bottom", time_limit=10, workers=1, **CROWDED)
    assert result.status == "infeasible"
    assert result.bound is None
    head_over_head = {("vertical", "line_head.head", "line_head.head", Fraction(d), "connect") for d in (-1, 0, 1)}
    conflicts = {(m.axis, m.a, m.b, m.offset, m.kind) for m in result.conflicts}
    assert len(conflicts) >= 2 and conflicts <= head_over_head
    assert {m.cards for m in result.conflicts} == {("[head]", "[head]")}

    # It still returns the arrangement with the fewest must failures, which
    # the checker grades the way the solver did.
    assert result.fewest_status == "optimal"
    regraded = check(result.arrangement, **CROWDED)
    assert not regraded.valid
    assert {(m.axis, m.a, m.b, m.offset, m.kind): n for m, n in result.must_failures.items()} == must_failures(regraded)
    assert result.objective == objective(regraded)
    # Fewer than with no pockets at all, where every connect contact fails.
    empty = check({}, **CROWDED)
    assert sum(result.must_failures.values()) < sum(must_failures(empty).values())


def test_an_unavoidable_leak_costs_nothing():
    # [set(x)to][set(x)to] is forbid / should, but it snaps exactly when
    # [get(x)][get(x)], a connect, does: it is unavoidable. These two
    # arrangements differ only in the left pocket of set, facing set's N.
    # Every edge is pinned, so each search can only return its pinned
    # arrangement.
    leaking = set_get(top=[], bottom=[], left=[(0.5, "S/-")], right=[(0.5, "N/-")])
    blocked = set_get(top=[], bottom=[], left=[(0.5, "N/-")], right=[(0.5, "N/-")])
    only = dict(classes=["set_get"], time_limit=5, workers=1)
    results = [solve("top_bottom", pinned=pinned, **only) for pinned in (leaking, blocked)]
    assert [r.fewest_status for r in results] == ["optimal", "optimal"]
    grades = [beside(r.check, "set_get.set", "set_get.set").labels for r in results]
    assert [(label.unavoidable, label.grade) for (label,) in grades] == [(True, "leak"), (True, "strong")]
    # Ten per contact for a should-leak, over 36 length pairs, if it counted.
    assert results[0].objective == results[1].objective


# Two flip pairs and a single-sided class, all 1U at minimum.
AGREEMENT_CLASSES = ["set_get", "literal", "operator"]


@st.composite
def whole_arrangements(draw):
    """A random arrangement that mentions every edge of every class."""
    edges = {
        name: {
            "top": draw(top_bottom_pockets()),
            "bottom": draw(top_bottom_pockets()),
            "left": draw(left_right_pockets()),
            "right": draw(left_right_pockets()),
        }
        for name in AGREEMENT_CLASSES
    }
    return arrangement(draw(st.sampled_from(["top_bottom", "left_right"])), **edges)


@settings(max_examples=15, deadline=None)
@given(whole_arrangements())
def test_the_solver_grades_a_pinned_arrangement_as_the_checker_does(pinned):
    # ADR 0002: the solver model is a second description of the physics.
    # Pinned everywhere, the search can only return the pinned arrangement,
    # and its own grading of it must be the checker's.
    small = dict(classes=AGREEMENT_CLASSES, max_length=2)
    checked = check(pinned, **small)
    result = solve(pinned["flip"], pinned=pinned, time_limit=10, workers=1, **small)
    assert design(result.arrangement) == design(checked.arrangement)
    assert result.status == ("optimal" if checked.valid else "infeasible")
    assert {(m.axis, m.a, m.b, m.offset, m.kind): n for m, n in result.must_failures.items()} == must_failures(checked)
    assert result.objective == objective(checked)
