# magnets

Checker and CP-SAT solver for the Snapscript magnet arrangement (see issue
#10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run magnets search --flip top_bottom --classes set_get,literal --time-limit 30
uv run magnets search --flip top_bottom --pin example   # keep the example's set_get design
uv run pytest
```

`check` writes `summary.txt`, `contacts.csv` and `programs.txt` to
`out/<arrangement>/`. A contact is two edges of two cards at given lengths,
facing at some offset. Contacts with the same geometry are grouped into one
row, named by its smallest length pair, with a `collapsed` count; under
`left_right` a geometry can split into two rows. `summary.txt` counts both:
rows by kind and result, then contacts (the sum of `collapsed`), where a
contact with two labels counts once under each. It lists must failures and
should and nice leaks. `programs.txt` lays each bundled test program
(`src/magnets/data/programs.yaml`) out on the table, once at minimum card
lengths and 20 times at seeded random lengths, and reports a legal program's
PASS or FAIL with the contacts that fail, or every forbid contact of an
illegal program with its grade.
An arrangement's `flip` is `top_bottom` (the default) or `left_right`. A
flip pair's back is derived from its front, so a forbid contact whose
partner contact is a connect can never be blocked; it is flagged
`unavoidable` and listed apart from the avoidable leaks. Unavoidable low
leaks, many under `left_right`, are only counted; `contacts.csv` has every
row.
Card classes (`classes.yaml`), grammar rules (`rules.yaml`) and bundled
arrangements live in `src/magnets/data/`. The public API is `magnets.check`,
`magnets.check_program` (a program text in spec notation) and
`magnets.solve`; pass `class_data=` or `rule_data=` to check against other
class or rule data.
A card text resolves to a class side through the side's member notation:
`(…)` stands for handwriting and `…` for printed text.

`search` looks for the arrangement with no must failures and the least
weighted forbid grades (a should-leak costs 10 per contact, a nice-leak 1),
then the fewest and simplest pockets. It writes the arrangement to
`out/search_<flip>.yaml` (or `--out`) and its checker reports next to it in
`out/search_<flip>/`; the summary gives the status (optimal, feasible,
infeasible or unknown), objective, bound and time. `--classes` restricts the
search to some card classes, and `magnets check --classes` checks the result
the same way; the bundled programs need every class, so `programs.txt` is
only written for a full check. With `--workers 1` the time limit is CP-SAT's
deterministic time, so a `--seed` repeats its result exactly.
Left/right edges never face top/bottom edges, so the two halves are solved
as independent models that share the time limit. Unavoidable leaks cost
nothing, since no arrangement can block them.
`--pin <arrangement>` keeps every edge that arrangement mentions exactly as
it is, empty ones too (`right: []`), and designs the rest; its flip must
match `--flip`. If no valid arrangement exists, the search says
`infeasible`, names a set of must contacts that conflict (enough to prove
it, not always the fewest), and writes the arrangement with the fewest
failing must contacts instead.
