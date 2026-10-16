"""The CP-SAT search for the best magnet arrangement.

The model is built from the checker's own contact list, enumerated on a
card that has a pocket candidate at every allowed position, so which
candidates face each other at every contact is fixed geometry and the
solver only chooses what each candidate's layers hold. A back is derived
from its front, so its pockets are the front's candidates with their
layers swapped and need no variables of their own.
"""

import math
from collections.abc import Mapping
from dataclasses import dataclass
from fractions import Fraction
from typing import Literal

from ortools.sat.python import cp_model

from . import contacts as _contacts
from .contacts import GRADES, Contact
from .data import MAX_POCKETS, Arrangement, CardClass, Rules, collision_length
from .physics import EDGES, HEIGHTS, LAYERS, LEFT_RIGHT_EDGES, Pocket, flipped_edge, interact

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

# A candidate pocket: (class, front edge, index in that edge's candidates).
Candidate = tuple[str, str, int]
# One layer of a candidate: (class, front edge, index, 0 up or 1 down).
LayerRef = tuple[str, str, int, int]


@dataclass(frozen=True)
class Solution:
    """What CP-SAT found: the status, the arrangement in the YAML's shape
    if it found one, and the objective and bound in cost units."""

    status: str  # optimal / feasible / infeasible / unknown
    arrangement: Mapping | None
    objective: Fraction | None
    bound: Fraction | None
    wall_time: float


def solve(
    flip: str,
    rules: Rules,
    classes: Mapping[str, CardClass],
    *,
    max_length: int,
    seed: int,
    time_limit: float,
    workers: int,
) -> Solution:
    """The arrangement of `classes` under `flip` with no must failures and
    the least weighted forbid grades, then the least pocket cost."""
    model = _Model(flip, rules, classes, max_length)
    solver = cp_model.CpSolver()
    solver.parameters.random_seed = seed
    solver.parameters.num_workers = workers
    if workers == 1:
        # One worker is deterministic, but a wall-clock limit would cut it
        # off at a point that varies from run to run. CP-SAT's deterministic
        # time is roughly seconds. The pocket costs leave many near-ties, and
        # a single worker only proves them with core-based search; more
        # workers run it among others.
        solver.parameters.max_deterministic_time = time_limit
        solver.parameters.optimize_with_core = True
    else:
        solver.parameters.max_time_in_seconds = time_limit
    status = STATUSES.get(solver.solve(model.model), "unknown")
    if status not in ("optimal", "feasible"):
        return Solution(status, None, None, None, solver.wall_time)
    return Solution(
        status=status,
        arrangement=model.arrangement(solver),
        objective=Fraction(round(solver.objective_value), SCALE),
        bound=Fraction(math.ceil(solver.best_objective_bound - 1e-6), SCALE),
        wall_time=solver.wall_time,
    )


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
    def __init__(self, flip: str, rules: Rules, classes: Mapping[str, CardClass], max_length: int):
        self.model = cp_model.CpModel()
        self.flip = flip
        self.classes = classes
        self.fronts = {name: {edge: candidates(cls, edge) for edge in EDGES} for name, cls in classes.items()}
        # side name -> (class, whether it is the front)
        self.owners = {side.name: (name, i == 0) for name, cls in classes.items() for i, side in enumerate(cls.sides)}
        # candidate -> layer (0 up, 1 down) -> layer content -> literal; one-hot
        self.layers: dict[Candidate, tuple[dict[str, cp_model.IntVar], ...]] = {}
        for name, edges in self.fronts.items():
            for edge, pockets in edges.items():
                for p in pockets:
                    self.layers[name, edge, p.index] = tuple(self._one_hot(f"{name}.{edge}.{p.index}.{i}") for i in (0, 1))
        self._products: dict[tuple, cp_model.IntVar] = {}
        self._tallies: dict[tuple, tuple[cp_model.IntVar, cp_model.IntVar, cp_model.IntVar]] = {}
        self.costs: list[cp_model.LinearExprT] = []

        self._pocket_rules(max_length)
        arrangement = Arrangement("<candidates>", flip, self.fronts)
        all_sides = _contacts.sides(arrangement, classes)
        for contact in _contacts.contacts(all_sides, rules, max_length, flip):
            self._grade(contact, rules)
        self.model.minimize(sum(self.costs))

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

    def _tally(self, contact: Contact) -> tuple[cp_model.IntVar, cp_model.IntVar, cp_model.IntVar]:
        """Literals for a > 0, r > 0, and both, across every aligned pocket
        pair of the contact."""
        layer_pairs = tuple(
            (self._layer(contact.a, pair.a, level), self._layer(contact.b, pair.b, level))
            for pair in contact.pairs
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

    def _grade(self, contact: Contact, rules: Rules) -> None:
        """A must label never gets a FAIL grade: a connect must snap and a
        coexist must not repel or be mixed. A forbid that
        isn't unavoidable costs its priority weight times its grade's
        penalty, for every contact the row holds."""
        attract, repel, both = self._tally(contact)
        # Exactly one of these is 1: the contact's result, as `aggregate` gives it.
        results = {"snap": attract - both, "mixed": both, "nothing": 1 - attract - repel + both, "repel": repel - both}
        for label in contact.labels:
            grades = GRADES[label.kind]
            if label.priority == "must":
                for result, grade in grades.items():
                    if grade == "FAIL":
                        self.model.add(results[result] == 0)
            elif label.kind == "forbid" and not label.unavoidable:
                weight = rules.priorities[label.priority] * contact.collapsed
                if weight:
                    self.costs.append(
                        sum(weight * int(GRADE_PENALTY[grades[r]] * SCALE) * held for r, held in results.items())
                    )

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

