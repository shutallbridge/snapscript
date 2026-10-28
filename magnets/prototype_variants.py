"""PROTOTYPE, throwaway (branch prototype/simpler-pockets, #10).

Question: is there still a valid arrangement with simpler pockets?
  - no steel: layers N, S, - only
  - one layer: every pocket is empty or one full-thickness magnet (P/P)
  - two positions: ¼ and ¾ U only

Patches the module constants and the solver's pocket rules, then runs the
normal `magnets search` CLI, so reports are the usual ones.

    uv run python prototype_variants.py <variant> <flip> <goal> [time_limit] [magnet_price]

With `magnet_price`, every magnet costs that much (a half pocket 1x, uniform
and split 2x) instead of the per-shape tie-breaker.
    variants: baseline, no_steel, one_layer, two_positions, one_layer_two_positions
"""

import sys
from fractions import Fraction

from magnets import cli, data, physics, solver

variant, flip, goal = sys.argv[1:4]
time_limit = sys.argv[4] if len(sys.argv) > 4 else "300"
price = Fraction(sys.argv[5]) if len(sys.argv) > 5 else None

steel = variant == "baseline"
one_layer = variant in ("one_layer", "one_layer_two_positions")
two_positions = variant in ("two_positions", "one_layer_two_positions")

if not steel:
    solver.LAYERS = ("N", "S", "-")
if two_positions:
    grid = (Fraction(1, 4), Fraction(3, 4))
    physics.POSITIONS = solver.POSITIONS = data.POSITIONS = grid
if one_layer:
    rules = solver._Model._pocket_rules

    def _pocket_rules(self, max_length):
        rules(self, max_length)
        for up, down in self.layers.values():
            for layer in solver.LAYERS:
                self.model.add(up[layer] == down[layer])

    solver._Model._pocket_rules = _pocket_rules

if price is not None:
    solver.SHAPE_COST = {"uniform": 2 * price, "half": price, "split": 2 * price}

suffix = "" if price is None else f"_magnet_{str(price).replace('/', '_')}"
out = f"out/proto/{variant}_{flip}_{goal}{suffix}.yaml"
sys.exit(cli.main(["search", "--flip", flip, "--goal", goal, "--time-limit", time_limit, "--out", out]))
