"""The CP-SAT search, on small problems with short time limits."""

from fractions import Fraction

import pytest

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
