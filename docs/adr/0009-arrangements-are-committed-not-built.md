# Arrangements are committed, not built

A language version's magnet arrangement is a file committed to the repo (`language/arrangements/0.1.0.yaml`), next to `classes.yaml` and `rules.yaml`. A release attaches a copy, but it never builds one.

The arrangement looks like a build artifact: the search makes it from `classes.yaml`. But a build artifact can be made again from the tagged files, and an arrangement can't. Two searches can give two different arrangements that are equally good, and a full search runs too long for a release build. So the search is run once, by hand, and its result is a decision that is frozen, like `classes.yaml` is.

## Consequences

- Later searches can pin it. From 1.0 a minor version only adds, so the 1.1 search runs with `--pin` on the 1.0 arrangement, which has to be in the repo.
- The base generator for a version builds from the tagged files alone, with the arrangement inside it.
- Changing the arrangement file is a language change, like changing the language reference, `classes.yaml` or `rules.yaml`. The arrangement was searched against `rules.yaml`, so a rule changed without a new search leaves an arrangement that no longer fits.
- `language/` sits outside the Python package, so a wheel that carries the arrangement copies it in when it is built.
