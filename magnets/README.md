# magnets

Checker for the Snapscript magnet arrangement (see issue #10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run pytest
```

`check` writes `summary.txt` and `contacts.csv` to `out/<arrangement>/`.
Card classes (`classes.yaml`), grammar rules (`rules.yaml`) and bundled
arrangements live in `src/magnets/data/`. The public API is `magnets.check`;
pass `class_data=` or `rule_data=` to check against other class or rule data.
