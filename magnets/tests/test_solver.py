"""The CP-SAT search, on small problems with short time limits."""

from fractions import Fraction

import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from helpers import TOY_PAIRS, arrangement, beside, check_pairs, left_right_pockets, set_get, top_bottom_pockets
from magnets import check, solve

# A reduced problem on the TOY_PAIRS data: four flip pairs, two with different
# roles on each side (set_get and define_call, which holds the call).
CLASSES = ["set_get", "literal", "define_call", "operator"]
TOY = dict(class_data=TOY_PAIRS)


def test_a_reduced_problem_solves_to_a_valid_arrangement():
    result = solve("top_bottom", classes=CLASSES, time_limit=5, workers=1, **TOY)
    assert result.status in ("optimal", "feasible")
    assert result.arrangement.flip == "top_bottom"
    assert set(result.arrangement.fronts) == set(CLASSES)
    # The checker agrees, independently of the solver's own grading.
    regraded = check_pairs(result.arrangement, classes=CLASSES)
    assert regraded.must_failures == []
    assert regraded.valid
    assert result.check.valid


def test_the_same_seed_with_one_worker_repeats_its_arrangement():
    # The search stops at its time limit before proving optimality, so this
    # also covers a search cut short.
    first, second = (solve("top_bottom", classes=CLASSES, seed=7, time_limit=2, workers=1, **TOY) for _ in range(2))
    assert first.arrangement == second.arrangement
    assert (first.status, first.objective, first.bound) == (second.status, second.objective, second.bound)


# The objective, from issue #10: a forbid's priority weight times its grade's
# penalty, for every contact; plus 0.01 per magnet.
WEIGHTS = {"should": 10, "nice": 1, "low": 0}
# The penalties depend on the search goal: under no_snap, nothing is enough.
PENALTIES = {
    "repel": {"leak": 1, "partial": Fraction(1, 2), "weak": Fraction(1, 5), "strong": 0},
    "no_snap": {"leak": 1, "partial": Fraction(1, 2), "weak": 0, "strong": 0},
}
MAGNET_COST = Fraction(1, 100)


def objective(checked, goal="no_snap"):
    """The objective of a checked arrangement under a search goal, from its
    grades and pockets."""
    forbids = sum(
        WEIGHTS[label.priority] * PENALTIES[goal][label.grade] * group.count
        for group in checked.groups
        for label in group.labels
        if label.kind == "forbid" and not label.unavoidable
    )
    magnets = sum(
        MAGNET_COST * sum(layer != "-" for layer in (pocket.up, pocket.down))
        for edges in checked.arrangement.fronts.values()
        for pockets in edges.values()
        for pocket in pockets
    )
    return forbids + magnets


def test_the_reported_objective_is_the_checkers():
    result = solve("top_bottom", classes=CLASSES, time_limit=3, workers=1, **TOY)
    assert result.objective == objective(check_pairs(result.arrangement, classes=CLASSES))
    assert result.bound <= result.objective


def test_a_check_can_be_restricted_to_some_classes():
    result = check("example", classes=["simple_head", "get", "literal"])
    assert {name for c in result.groups for name in (c.a, c.b)} == {
        "simple_head.head",
        "get.get",
        "literal.num",
        "literal.str",
    }
    with pytest.raises(ValueError, match="unknown card class.*teapot"):
        check("example", classes=["simple_head", "get", "literal", "teapot"])


def test_a_reduced_problem_solves_under_the_left_right_flip():
    result = solve("left_right", classes=CLASSES, time_limit=5, workers=1, **TOY)
    assert result.status in ("optimal", "feasible")
    assert result.arrangement.flip == "left_right"
    regraded = check_pairs(result.arrangement, classes=CLASSES)
    assert regraded.valid
    assert result.objective == objective(regraded)


@pytest.mark.parametrize("flip", ["top_bottom", "left_right"])
def test_solving_the_halves_apart_finds_the_same_optimum_as_one_model(flip):
    # Left/right edges only ever face left/right edges, and top/bottom edges
    # top/bottom edges, so the two halves of the problem are independent.
    small = dict(classes=["set_get", "literal"], max_length=3, time_limit=20, workers=1, **TOY)
    apart, together = solve(flip, **small), solve(flip, split=False, **small)
    assert (apart.status, together.status) == ("optimal", "optimal")
    assert apart.objective == together.objective


def design(arrangement):
    """Each class's edges as sets of pockets, whatever order they're listed in."""
    return {
        name: {edge: {(p.anchor, p.at, p.layers) for p in pockets} for edge, pockets in edges.items()}
        for name, edges in arrangement.fronts.items()
    }


def test_pinning_the_example_keeps_its_design():
    classes = ["simple_head", "get", "literal", "call", "operator"]
    example = design(check("example", classes=classes).arrangement)
    result = solve("top_bottom", classes=classes, pinned="example", time_limit=3, workers=1)
    assert result.status in ("optimal", "feasible")
    found = design(result.arrangement)
    for name in ("simple_head", "get"):
        assert (found[name]["top"], found[name]["bottom"]) == (example[name]["top"], example[name]["bottom"])
    assert (found["literal"]["left"], found["literal"]["right"]) == (example["literal"]["left"], example["literal"]["right"])
    # The example doesn't mention simple_head's left and right edges, nor the other
    # classes, so the search designs them: its right edge must snap to what
    # follows, and under no_snap its left edge, which nothing may snap to, needs nothing.
    assert found["simple_head"]["right"] and not found["simple_head"]["left"]
    assert result.check.valid


def test_pinned_empty_edges_stay_empty():
    # Left free, the search puts pockets on the operator's top and bottom
    # edges to keep illegal neighbours from snapping.
    pinned = {"flip": "top_bottom", "classes": {"operator": {"top": [], "bottom": []}}}
    result = solve("top_bottom", classes=CLASSES, pinned=pinned, time_limit=3, workers=1, **TOY)
    assert result.status in ("optimal", "feasible")
    operator = result.arrangement.fronts["operator"]
    assert (operator["top"], operator["bottom"]) == ((), ())
    assert result.check.valid


def test_a_pin_may_not_mention_a_class_outside_the_search():
    # As for `check(..., classes=...)`: the pin names a class the search leaves out.
    pinned = {"flip": "top_bottom", "classes": {"simple_head": {"top": []}}}
    with pytest.raises(ValueError, match="unknown card class 'simple_head'"):
        solve("top_bottom", classes=["literal", "operator"], pinned=pinned, time_limit=1, workers=1)


# A contradictory toy grammar: a 1U line head must take the next line in the
# same column, indented by 1U and outdented by 1U. An indent onto a shorter
# card needs a `from: right` pocket on the bottom edge, an outdent under a
# 2U card one on the top edge, and lining these up with the pockets of the
# same column takes a `from: left` and a `from: right` pocket that collide
# on a 1U card. (Real block heads and [dedent] are 2U for this reason.)
HEAD = {"left": "head", "right": "end", "top": "line", "bottom": "line"}
CROWDED_CLASSES = {"line_head": {"min_length": 1, "pocket_reach": 1, "sides": {"head": {"[head]": HEAD}}}}
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
    """Failing contacts per requirement, from the checker."""
    found = {}
    for c, label in checked.must_failures:
        key = (c.axis, c.a, c.b, c.offset, label.kind)
        found[key] = found.get(key, 0) + c.count
    return found


def test_a_contradictory_grammar_is_infeasible_and_names_the_conflict():
    result = solve("top_bottom", time_limit=10, workers=1, **CROWDED)
    assert result.status == "infeasible"
    assert result.bound is None
    head_over_head = {("vertical", "line_head.head", "line_head.head", Fraction(d), "connect") for d in (-1, 0, 1)}
    conflicts = {(r.axis, r.a, r.b, r.offset, r.kind) for r in result.conflicts}
    assert len(conflicts) >= 2 and conflicts <= head_over_head
    assert {r.cards for r in result.conflicts} == {("[head]", "[head]")}

    # It still returns the arrangement with the fewest must failures, which
    # the checker grades the way the solver did.
    assert result.fewest_status == "optimal"
    regraded = check(result.arrangement, **CROWDED)
    assert not regraded.valid
    assert {(r.axis, r.a, r.b, r.offset, r.kind): n for r, n in result.must_failures.items()} == must_failures(regraded)
    assert result.objective == objective(regraded)
    # Fewer than with no pockets at all, where every connect contact fails.
    empty = check({}, **CROWDED)
    assert sum(result.must_failures.values()) < sum(must_failures(empty).values())


def test_an_unavoidable_leak_costs_nothing():
    # On the TOY_PAIRS data [set{x}to][set{x}to] is forbid / should, but it snaps exactly when
    # [get{x}][get{x}], a connect, does: it is unavoidable. These two
    # arrangements differ only in the left pocket of set, facing set's N.
    # Every edge is pinned, so each search can only return its pinned
    # arrangement.
    leaking = set_get(top=[], bottom=[], left=[("1/2", "S/-")], right=[("1/2", "N/-")])
    blocked = set_get(top=[], bottom=[], left=[("1/2", "N/-")], right=[("1/2", "N/-")])
    only = dict(classes=["set_get"], time_limit=5, workers=1, **TOY)
    results = [solve("top_bottom", pinned=pinned, **only) for pinned in (leaking, blocked)]
    assert [r.fewest_status for r in results] == ["optimal", "optimal"]
    grades = [beside(r.check, "set_get.set", "set_get.set").labels for r in results]
    assert [(label.unavoidable, label.grade) for (label,) in grades] == [(True, "leak"), (True, "strong")]
    # Ten per contact for a should-leak, over 25 length pairs, if it counted.
    assert results[0].objective == results[1].objective


# Two toy flip pairs and a single-sided class, all 2U at their shortest with a 1U pocket reach.
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
@given(whole_arrangements(), st.sampled_from(["repel", "no_snap"]))
def test_the_solver_grades_a_pinned_arrangement_as_the_checker_does(pinned, goal):
    # ADR 0002: the solver model is a second description of the physics.
    # Pinned everywhere, the search can only return the pinned arrangement,
    # and its own grading of it must be the checker's, at the goal's costs.
    small = dict(classes=AGREEMENT_CLASSES, max_length=2, **TOY)
    checked = check(pinned, **small)
    result = solve(pinned["flip"], pinned=pinned, goal=goal, time_limit=10, workers=1, **small)
    assert design(result.arrangement) == design(checked.arrangement)
    assert result.status == ("optimal" if checked.valid else "infeasible")
    assert {(r.axis, r.a, r.b, r.offset, r.kind): n for r, n in result.must_failures.items()} == must_failures(checked)
    assert result.objective == objective(checked, goal)


# A toy grammar: one single-sided 1U class whose left edge is a line head,
# so [lone][lone] is forbid / should, and nothing else is graded but low.
LONE = {"left": "head", "right": "end", "top": "free", "bottom": "free"}
LONE_CLASSES = {"lone": {"min_length": 1, "pocket_reach": 1, "sides": {"lone": {"[lone]": LONE}}}}
LONE_RULES = {
    "roles": {"left": ["head"], "right": ["end"], "top": ["free"], "bottom": ["free"]},
    "priorities": {"should": 10, "low": 0},
    "horizontal": {"connect": {"end": []}, "forbid": "should", "off_line": "low"},
    "vertical": {
        "offsets": [0],
        "connect": [],
        "forbid": "should",
        "off_line": "low",
        "ungraded": ["free"],
        "coexist": {"never": ["free"], "line_heads": [], "not_inline": ["head"]},
    },
}
LONE_PROBLEM = dict(class_data=LONE_CLASSES, rule_data=LONE_RULES, max_length=2, time_limit=5, workers=1)


def pocket_count(arrangement):
    return sum(len(pockets) for edges in arrangement.fronts.values() for pockets in edges.values())


def test_no_snap_leaves_a_forbid_weak_where_repel_adds_pockets():
    repel, no_snap = (solve("top_bottom", goal=goal, **LONE_PROBLEM) for goal in ("repel", "no_snap"))
    assert (repel.goal, no_snap.goal) == ("repel", "no_snap")
    assert (repel.status, no_snap.status) == ("optimal", "optimal")
    grades = [beside(r.check, "lone.lone", "lone.lone").labels[0].grade for r in (repel, no_snap)]
    # Repel pushes [lone][lone] apart with a pocket on each edge; under
    # no_snap "nothing" is enough, and costs nothing.
    assert grades == ["strong", "weak"]
    assert pocket_count(no_snap.arrangement) < pocket_count(repel.arrangement)
    assert no_snap.objective == objective(no_snap.check, "no_snap") == 0


def test_the_default_goal_is_no_snap():
    result = solve("top_bottom", **LONE_PROBLEM)
    assert result.goal == "no_snap"
    assert beside(result.check, "lone.lone", "lone.lone").labels[0].grade == "weak"


def test_an_unknown_goal_is_rejected():
    with pytest.raises(ValueError, match="unknown goal 'push'; expected one of repel, no_snap"):
        solve("top_bottom", goal="push", **LONE_PROBLEM)


# A toy grammar: one single-sided 1U class that must snap to itself, side by
# side, and nothing else is graded but low.
LINK = {"left": "value", "right": "value", "top": "free", "bottom": "free"}
LINK_CLASSES = {"link": {"min_length": 1, "pocket_reach": 1, "sides": {"link": {"[link]": LINK}}}}
LINK_RULES = {
    **LONE_RULES,
    "roles": {"left": ["value"], "right": ["value"], "top": ["free"], "bottom": ["free"]},
    "horizontal": {"connect": {"value": ["value"]}, "forbid": "should", "off_line": "low"},
    "vertical": {**LONE_RULES["vertical"], "coexist": {"never": ["free"], "line_heads": [], "not_inline": []}},
}


def test_of_two_arrangements_with_the_same_pockets_the_search_picks_fewer_magnets():
    # [link][link] snaps with one magnet on each facing edge (two half
    # pockets) or with two (two uniform pockets): the same pockets, and both
    # snap, but the half pockets have half the magnets.
    result = solve("top_bottom", class_data=LINK_CLASSES, rule_data=LINK_RULES, max_length=2, time_limit=5, workers=1)
    assert result.status == "optimal"
    assert beside(result.check, "link.link", "link.link").result == "snap"
    link = result.arrangement.fronts["link"]
    assert [p.shape for p in (*link["left"], *link["right"])] == ["half", "half"]
    assert result.objective == objective(result.check) == Fraction(2, 100)
