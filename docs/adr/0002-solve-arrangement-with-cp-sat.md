# Solve the magnet arrangement exactly with CP-SAT; verify with the checker

The magnet arrangement is searched with OR-Tools' CP-SAT solver rather than simulated annealing. Every choice is finite (which pocket positions are used, what each layer holds) and every requirement is a yes/no rule or a weighted sum, so an exact solver fits. It can also prove that no valid arrangement exists, and name the must-snap contacts that conflict, where annealing could only report that it found none.

## Consequences

The solver model is a second description of the magnet physics, beside the checker. To keep them from drifting, the model is built from the checker's own contact list and layer table, every solution is re-graded by the checker, and a test checks that the model and the checker grade random arrangements identically.
