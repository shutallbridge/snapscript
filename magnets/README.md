# magnets

Checker for the Snapscript magnet arrangement (see issue #10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run pytest
```

`check` writes `summary.txt`, `contacts.csv` and `programs.txt` to
`out/<arrangement>/`. `programs.txt` lays each bundled test program
(`src/magnets/data/programs.yaml`) out on the table, once at minimum card
lengths and 20 times at seeded random lengths, and reports a legal program's
PASS or FAIL with the contacts that fail, or every forbid contact of an
illegal program with its grade.
An arrangement's `flip` is `top_bottom` (the default) or `left_right`. A
flip pair's back is derived from its front, so some forbid contacts behave
exactly like a connect contact and can never be blocked; these are flagged
`unavoidable` and listed apart from the avoidable leaks.
Card classes (`classes.yaml`), grammar rules (`rules.yaml`) and bundled
arrangements live in `src/magnets/data/`. The public API is `magnets.check`
and `magnets.check_program` (a program text in spec notation); pass
`class_data=` or `rule_data=` to check against other class or rule data.
A card text resolves to a class side through the side's member notation:
`(…)` stands for handwriting and `…` for printed text.
