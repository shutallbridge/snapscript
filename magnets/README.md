# magnets

Checker for the Snapscript magnet arrangement (see issue #10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run pytest
```

`check` writes `summary.txt` and `contacts.csv` to `out/<arrangement>/`.
Card classes, grammar rules and bundled arrangements live in
`src/magnets/data/`. The public API is `magnets.check`.
