"""The CP-SAT search for the best magnet arrangement.

The model is built from the checker's own contact groups, enumerated on a
card that has a pocket candidate at every allowed position, so which
candidates face each other at every contact is fixed geometry and the
solver only chooses what each candidate's layers hold. A back is derived
from its front, so its pockets are the front's candidates with their
layers swapped and need no variables of their own.
"""

import math
from collections import Counter
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from fractions import Fraction
from typing import Literal

from ortools.sat.python import cp_model

from . import contacts as _contacts
from .contacts import GRADES, ContactGroup, Label
from .data import MAX_POCKETS, Arrangement, CardClass, Rules, collision_length
from .physics import EDGES, HEIGHTS, LAYERS, LEFT_RIGHT_EDGES, TOP_BOTTOM_EDGES, Pocket, flipped_edge, interact

# What a forbid's grade costs, per contact, before its priority weight.
GRADE_PENALTY = {"leak": Fraction(1), "partial": Fraction(1, 2), "weak": Fraction(1, 5), "strong": Fraction(0)}
# What each occupied pocket costs, so the solver uses a second layer, or two
# different pieces, only where the grammar needs it.
SHAPE_COST = {"uniform": Fraction(1, 100), "half": Fraction(3, 200), "split": Fraction(1, 50)}
# CP-SAT needs integers: every cost times SCALE is whole.
SCALE = math.lcm(*(cost.denominator for cost in (*GRADE_PENALTY.values(), *SHAPE_COST.values())))

STATUSES = {
    cp_model.OPTIMAL: "optimal",
    cp_model.FEASIBLE: "feasible",
    cp_model.INFEASIBLE: "infeasible",
}
# A search is only as good as its worst half.
WORST_FIRST = ("infeasible", "unknown", "feasible", "optimal")

# A candidate pocket: (class, front edge, index in that edge's candidates).
Candidate = tuple[str, str, int]
# One layer of a candidate: (class, front edge, index, 0 up or 1 down).
LayerRef = tuple[str, str, int, int]
# How a model treats must labels: as constraints; as constraints behind an
# assumption per requirement, to find which conflict; or as costs that
# outweigh every forbid, to find the fewest must failures.
Musts = Literal["hard", "assumed", "soft"]


@dataclass(frozen=True)
class Requirement:
    """One must label on two sides and their facing edges at one offset,
    at every length pair: `[a][b]` (horizontal) or `a` over `b` (vertical),
    with `a` and `b` as for `ContactGroup`. It holds when all its contacts
    snap (connect) or none repel or are mixed (coexist)."""

    axis: str
    a: str
    b: str
    offset: Fraction
    kind: str  # connect / coexist
    cards: tuple[str, str]  # a's and b's notation, e.g. ("[set(x)to]", "[get(x)]")


@dataclass(frozen=True)
class Solution:
    """What CP-SAT found: the status, the arrangement in the YAML's shape
    if it found one, and its objective and bound in cost units.

    If no valid arrangement exists, the status is infeasible: `conflicts`
    is a set of requirements that can't all hold, and `arrangement` the
    one with the fewest must failures (`fewest_status` says whether
    that is proven), which fail as `must_failures` counts them. Its
    `objective` is then the cost of its forbids and pockets, and it has no
    bound.
    """

    status: str  # optimal / feasible / infeasible / unknown
    arrangement: Mapping | None
    objective: Fraction | None
    bound: Fraction | None
    wall_time: float
    conflicts: tuple[Requirement, ...] = ()
    must_failures: Mapping[Requirement, int] = field(default_factory=dict)  # failing contacts
    fewest_status: str | None = None  # optimal / feasible / unknown, if infeasible


def solve(
    flip: str,
    rules: Rules,
    classes: Mapping[str, CardClass],
    *,
    max_length: int,
    seed: int,
    time_limit: float,
    workers: int,
    pinned: Mapping[tuple[str, str], tuple[Pocket, ...]] | None = None,
    split: bool = True,
) -> Solution:
    """The arrangement of `classes` under `flip` with no must failures and
    the least weighted forbid grades, then the least pocket cost.

    `pinned` fixes the pockets of some front edges, as (class, edge) -> its
    pockets; an edge with none is fixed empty. Left/right edges only face
    left/right edges and top/bottom edges only top/bottom edges, and no
    flip moves an edge from one group to the other, so unless `split` is
    False each group is solved as its own model and the results are
    combined. The models share `time_limit` in proportion to their size,
    each getting what an earlier one left.
    """
    fronts = {name: {edge: candidates(cls, edge) for edge in EDGES} for name, cls in classes.items()}
    all_sides = _contacts.sides(Arrangement("<candidates>", flip, fronts), classes)
    found = _contacts.contacts(all_sides, rules, max_length, flip)

    def builder(edges: tuple[str, ...]) -> Callable[[Musts], _Model]:
        facing = [c for c in found if c.edge_a in edges]
        return lambda musts: _Model(flip, rules, classes, fronts, edges, facing, max_length, pinned or {}, musts)

    builders = [builder(edges) for edges in ((LEFT_RIGHT_EDGES, TOP_BOTTOM_EDGES) if split else (EDGES,))]
    models = [build("hard") for build in builders]
    sizes = [len(model.model.proto.variables) for model in models]
    runner = _Runner(seed, workers)
    halves = []
    for i, (model, build) in enumerate(zip(models, builders)):
        budget = (time_limit - runner.used) * sizes[i] / sum(sizes[i:])
        halves.append(_search(model, build, runner, budget))
    return _combine(flip, halves)


class _Runner:
    """Runs the solves of one search, and counts the time they take.

    With one worker the limit is CP-SAT's deterministic time, roughly
    seconds: one worker is deterministic, but a wall-clock limit would cut
    it off at a point that varies from run to run. The pocket costs leave
    many near-ties, and a single worker only proves them with core-based
    search; more workers run it among others.
    """

    def __init__(self, seed: int, workers: int):
        self.seed, self.workers = seed, workers
        self.used = 0.0  # in the time limit's units
        self.wall_time = 0.0

    def run(self, model: "_Model", limit: float) -> tuple[str, cp_model.CpSolver]:
        solver = cp_model.CpSolver()
        solver.parameters.random_seed = self.seed
        solver.parameters.num_workers = self.workers
        if self.workers == 1:
            solver.parameters.max_deterministic_time = max(limit, 0)
            solver.parameters.optimize_with_core = True
        else:
            solver.parameters.max_time_in_seconds = max(limit, 0)
        status = STATUSES.get(solver.solve(model.model), "unknown")
        self.used += solver.deterministic_time if self.workers == 1 else solver.wall_time
        self.wall_time += solver.wall_time
        return status, solver


def _search(model: "_Model", build: Callable[[Musts], "_Model"], runner: _Runner, budget: float) -> Solution:
    """Solve one half within `budget`. If it has no valid arrangement, find
    requirements that conflict, then the arrangement with the fewest must
    failures, in what is left."""
    used, wall_time = runner.used, runner.wall_time

    def left() -> float:
        return budget - (runner.used - used)

    status, solver = runner.run(model, budget)
    if status in ("optimal", "feasible"):
        bound = Fraction(math.ceil(solver.best_objective_bound - 1e-6), SCALE)
        return Solution(status, model.arrangement(solver), model.cost(solver), bound, solver.wall_time)
    if status == "unknown":
        return Solution(status, None, None, None, solver.wall_time)
    assumed = build("assumed")
    found, solver = runner.run(assumed, left() / 2)
    conflicts = assumed.conflicts(solver) if found == "infeasible" else ()
    soft = build("soft")
    fewest, solver = runner.run(soft, left())
    if fewest not in ("optimal", "feasible"):
        return Solution(status, None, None, None, runner.wall_time - wall_time, conflicts, fewest_status="unknown")
    return Solution(
        status=status,
        arrangement=soft.arrangement(solver),
        objective=soft.cost(solver),
        bound=None,
        wall_time=runner.wall_time - wall_time,
        conflicts=conflicts,
        must_failures=soft.failures(solver),
        fewest_status=fewest,
    )


def _worst(statuses: Iterable[str]) -> str:
    return min(statuses, key=WORST_FIRST.index)


def _combine(flip: str, halves: list[Solution]) -> Solution:
    """One solution from the solutions of independent halves: proven
    optimal only if every half is, and infeasible if any half is."""
    status = _worst(half.status for half in halves)
    wall_time = sum(half.wall_time for half in halves)
    conflicts = tuple(r for half in halves for r in half.conflicts)
    failures = {r: n for half in halves for r, n in half.must_failures.items()}
    fewest = _worst(half.fewest_status or half.status for half in halves) if status == "infeasible" else None
    chosen: dict[str, dict] = {}
    objective = Fraction(0)
    for half in halves:
        if half.arrangement is None or half.objective is None:
            return Solution(status, None, None, None, wall_time, conflicts, failures, fewest)
        for name, edges in half.arrangement["classes"].items():
            chosen.setdefault(name, {}).update(edges)
        objective += half.objective
    bounds = [half.bound for half in halves]
    bound = None if None in bounds else sum((b for b in bounds if b is not None), Fraction(0))
    return Solution(status, {"flip": flip, "classes": chosen}, objective, bound, wall_time, conflicts, failures, fewest)


def candidates(cls: CardClass, edge: str) -> tuple[Pocket, ...]:
    """A pocket at every position an arrangement may use on this edge.

    Top/bottom pockets sit on the 1/4 U grid, off the cell boundaries,
    inside the card at its minimum length, anchored at either end.
    Left/right pockets sit at the three heights.
    """
    if edge in LEFT_RIGHT_EDGES:
        return tuple(Pocket(edge, None, h, "-/-", i) for i, h in enumerate(HEIGHTS))
    places: list[tuple[Literal["left", "right"], Fraction]] = [
        (anchor, Fraction(quarter, 4))
        for anchor in ("left", "right")
        for quarter in range(1, 4 * cls.min_length)
        if quarter % 4
    ]
    return tuple(Pocket(edge, anchor, at, "-/-", i) for i, (anchor, at) in enumerate(places))


class _Model:
    """The model of the pockets on `edges` (of every class's front), graded
    on `found`, the contact groups between those edges, with must labels treated
    as `musts` says."""

    def __init__(
        self,
        flip: str,
        rules: Rules,
        classes: Mapping[str, CardClass],
        fronts: Mapping[str, Mapping[str, tuple[Pocket, ...]]],
        edges: tuple[str, ...],
        found: list[ContactGroup],
        max_length: int,
        pinned: Mapping[tuple[str, str], tuple[Pocket, ...]],
        musts: Musts,
    ):
        self.model = cp_model.CpModel()
        self.flip = flip
        self.classes = classes
        self.musts = musts
        self.notation = {side.name: side.notation for cls in classes.values() for side in cls.sides}
        self.fronts = {name: {edge: front[edge] for edge in edges} for name, front in fronts.items()}
        # side name -> (class, whether it is the front)
        self.owners = {side.name: (name, i == 0) for name, cls in classes.items() for i, side in enumerate(cls.sides)}
        # candidate -> layer (0 up, 1 down) -> layer content -> literal; one-hot
        self.layers: dict[Candidate, tuple[dict[str, cp_model.IntVar], ...]] = {}
        for name, front in self.fronts.items():
            for edge, pockets in front.items():
                for p in pockets:
                    self.layers[name, edge, p.index] = tuple(self._one_hot(f"{name}.{edge}.{p.index}.{i}") for i in (0, 1))
        self._pin(pinned)
        self._products: dict[tuple, cp_model.IntVar] = {}
        self._tallies: dict[tuple, tuple[cp_model.IntVar, cp_model.IntVar, cp_model.IntVar]] = {}
        # The forbid and pocket costs, and the most they can add up to.
        self.costs: list[cp_model.LinearExprT] = []
        self.most_cost = 0
        # Every must label: its requirement, contacts, and the results that
        # fail it, each 1 if it is the result.
        self.labels: list[tuple[Requirement, int, list[cp_model.LinearExprT]]] = []
        # musts == "assumed": requirement -> its assumption
        self.assumed: dict[Requirement, cp_model.IntVar] = {}
        # musts == "soft": (contacts, whether the label holds) per label
        self.held: list[tuple[int, cp_model.IntVar]] = []

        self._pocket_rules(max_length)
        for group in found:
            self._grade(group, rules)
        if musts == "hard":
            self.model.minimize(sum(self.costs))
        elif musts == "assumed":
            self.model.add_assumptions(self.assumed.values())
        else:
            # One failing contact outweighs every forbid and pocket together.
            weight = self.most_cost + 1
            self.model.minimize(sum([*self.costs, *(weight * n * (1 - holds) for n, holds in self.held)]))

    def _pin(self, pinned: Mapping[tuple[str, str], tuple[Pocket, ...]]) -> None:
        """Fix every candidate of a pinned edge to the pinned pocket at its
        position, or to empty."""
        for (name, edge), pockets in pinned.items():
            if edge not in self.fronts[name]:
                continue  # the other half's edge
            at_position = {(p.anchor, p.at): p for p in pockets}
            for candidate in self.fronts[name][edge]:
                p = at_position.get((candidate.anchor, candidate.at))
                for level, layer in enumerate((p.up, p.down) if p else ("-", "-")):
                    self.model.add(self.layers[name, edge, candidate.index][level][layer] == 1)

    def _one_hot(self, name: str) -> dict[str, cp_model.IntVar]:
        choice = {layer: self.model.new_bool_var(f"{name}={layer}") for layer in LAYERS}
        self.model.add_exactly_one(choice.values())
        return choice

    def _and(self, *lits: cp_model.IntVar) -> cp_model.IntVar:
        both = self.model.new_bool_var("")
        self.model.add_bool_and(lits).only_enforce_if(both)
        self.model.add_bool_or([lit.Not() for lit in lits]).only_enforce_if(both.Not())
        return both

    def _pocket_rules(self, max_length: int) -> None:
        """At most so many pockets per edge, no two sharing a position, and
        each occupied pocket's cost by its shape."""
        self.empty = {c: self._and(up["-"], down["-"]) for c, (up, down) in self.layers.items()}
        for candidate, (up, down) in self.layers.items():
            empty = self.empty[candidate]
            uniform = sum(self._and(up[layer], down[layer]) for layer in LAYERS if layer != "-")
            half = up["-"] + down["-"] - 2 * empty
            split = 1 - empty - uniform - half
            shapes = {"uniform": uniform, "half": half, "split": split}
            self.costs.append(sum(int(cost * SCALE) * shapes[shape] for shape, cost in SHAPE_COST.items()))
            self.most_cost += int(max(SHAPE_COST.values()) * SCALE)
        for name, edges in self.fronts.items():
            min_length = self.classes[name].min_length
            for edge, pockets in edges.items():
                occupied = {p.index: self.empty[name, edge, p.index].Not() for p in pockets}
                if len(pockets) > MAX_POCKETS[edge]:
                    self.model.add(sum(occupied.values()) <= MAX_POCKETS[edge])
                for i, p in enumerate(pockets):
                    for q in pockets[i + 1 :]:
                        if collision_length(p, q, min_length, max_length) is not None:
                            self.model.add_bool_or([occupied[p.index].Not(), occupied[q.index].Not()])

    def _layer(self, side: str, pocket: Pocket, level: int) -> LayerRef:
        """The literals of what one layer of a pocket on a side holds: the
        front candidate's own layer, or on a back its other layer."""
        name, front = self.owners[side]
        if front:
            return (name, pocket.edge, pocket.index, level)
        return (name, flipped_edge(pocket.edge, self.flip), pocket.index, 1 - level)

    def _faces(self, a: LayerRef, b: LayerRef, what: str) -> list[cp_model.IntVar]:
        """A literal for every pair of layer contents where layer `a` facing
        layer `b` does `what` (attract or repel); at most one holds."""
        found = []
        for p in LAYERS:
            for q in LAYERS:
                if interact(p, q) != what:
                    continue
                key = (a, p, b, q)
                if key not in self._products:
                    self._products[key] = self._and(self.layers[a[:3]][a[3]][p], self.layers[b[:3]][b[3]][q])
                found.append(self._products[key])
        return found

    def _tally(self, group: ContactGroup) -> tuple[cp_model.IntVar, cp_model.IntVar, cp_model.IntVar]:
        """Literals for a > 0, r > 0, and both, across every aligned pocket
        pair of the contact group."""
        layer_pairs = tuple(
            (self._layer(group.a, pair.a, level), self._layer(group.b, pair.b, level))
            for pair in group.pairs
            for level in (0, 1)
        )
        if layer_pairs not in self._tallies:
            found = []
            for what in ("attract", "repel"):
                lits = [lit for a, b in layer_pairs for lit in self._faces(a, b, what)]
                any_lit = self.model.new_bool_var(what)
                if lits:
                    self.model.add_max_equality(any_lit, lits)
                else:
                    self.model.add(any_lit == 0)
                found.append(any_lit)
            attract, repel = found
            self._tallies[layer_pairs] = (attract, repel, self._and(attract, repel))
        return self._tallies[layer_pairs]

    def _grade(self, group: ContactGroup, rules: Rules) -> None:
        """A must label never gets a FAIL grade: a connect must snap and a
        coexist must not repel or be mixed. A forbid that isn't unavoidable
        costs its priority weight times its grade's penalty, for every
        contact in the group."""
        attract, repel, both = self._tally(group)
        # Exactly one of these is 1: the group's result, as `aggregate` gives it.
        results = {"snap": attract - both, "mixed": both, "nothing": 1 - attract - repel + both, "repel": repel - both}
        for label in group.labels:
            grades = GRADES[label.kind]
            if label.priority == "must":
                self._must(group, label, [results[r] for r, grade in grades.items() if grade == "FAIL"])
            elif label.kind == "forbid" and not label.unavoidable:
                weight = rules.priorities[label.priority] * group.count
                if weight:
                    self.costs.append(
                        sum(weight * int(GRADE_PENALTY[grades[r]] * SCALE) * held for r, held in results.items())
                    )
                    self.most_cost += weight * int(max(GRADE_PENALTY.values()) * SCALE)

    def _must(self, group: ContactGroup, label: Label, fails: list[cp_model.LinearExprT]) -> None:
        """None of `fails` may be the group's result: always, or if the
        requirement's assumption holds, or at a cost."""
        requirement = Requirement(
            group.axis,
            group.a,
            group.b,
            group.offset,
            label.kind,
            (self.notation[group.a], self.notation[group.b]),
        )
        self.labels.append((requirement, group.count, fails))
        holds = None
        if self.musts == "assumed":
            if requirement not in self.assumed:
                self.assumed[requirement] = self.model.new_bool_var(f"holds {requirement}")
            holds = self.assumed[requirement]
        elif self.musts == "soft":
            holds = self.model.new_bool_var("")
            self.held.append((group.count, holds))
        for fail in fails:
            constraint = self.model.add(fail == 0)
            if holds is not None:
                constraint.only_enforce_if(holds)

    def cost(self, solver: cp_model.CpSolver) -> Fraction:
        """The solved arrangement's forbid and pocket cost, in cost units."""
        return Fraction(solver.value(sum(self.costs)), SCALE)

    def failures(self, solver: cp_model.CpSolver) -> dict[Requirement, int]:
        """How many contacts fail each requirement, in the solved arrangement."""
        found: Counter[Requirement] = Counter()
        for requirement, count, fails in self.labels:
            if any(solver.value(fail) for fail in fails):
                found[requirement] += count
        return dict(found)

    def conflicts(self, solver: cp_model.CpSolver) -> tuple[Requirement, ...]:
        """Requirements that can't all hold, from an infeasible solve of
        the assumed model."""
        by_index = {holds.index: requirement for requirement, holds in self.assumed.items()}
        return tuple(by_index[i] for i in solver.sufficient_assumptions_for_infeasibility())

    def arrangement(self, solver: cp_model.CpSolver) -> dict:
        """The solved arrangement in the YAML's shape: the occupied
        candidates of every front edge."""
        chosen = {}
        for name, edges in self.fronts.items():
            authored = {}
            for edge, pockets in edges.items():
                found = []
                for p in pockets:
                    up, down = (
                        next(layer for layer, lit in held.items() if solver.boolean_value(lit))
                        for held in self.layers[name, edge, p.index]
                    )
                    if (up, down) != ("-", "-"):
                        found.append({**p.to_dict(), "layers": f"{up}/{down}"})
                if found:
                    authored[edge] = found
            chosen[name] = authored
        return {"flip": self.flip, "classes": chosen}

