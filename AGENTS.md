# AGENTS.md

## Project spec

`REFERENCE.md` (the language reference) is the source of truth for the language and its text notation. `README.md` is the source of truth for what Snapscript is for, its guiding principles, and the physical system. Read both before working on anything. Unsettled points are marked **TBD**; don't invent answers to them, raise them instead.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for shutallbridge/snapscript, using the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Uses the five default labels: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
