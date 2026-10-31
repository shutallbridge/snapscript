# Skip lines with known errors; stop only on runtime errors

A line with a structure error, a check error or an unreadable card is skipped: it does not run, and the rest of its function does. Skipping a block head skips its body, and skipping a `[define(…)]` header skips its strip. Check errors never stop a run on their own. Only a runtime error stops the program.

```
[define(draw)]
[call:p5.circle][get(frameCount)][num(20)][num(20)]    keeps animating
[call:p5.circle]                                       TypeError: skipped
```

A table is shared, and a program is always half-built: one person lays down a new line while the sketch runs, and with auto-run every pause is a run. Python refuses to run a file with one syntax error anywhere, and stops at the first runtime error. Either would freeze the sketch every time someone puts down an incomplete line. Three other ways were considered:

- **Stop everything on any structure error** (Python). Simple and familiar, but one half-built line anywhere stops the whole table.
- **A structure error breaks only its strip.** Better for group work, but `draw` is most of a sketch, so a half-built line in it still stops the sketch.
- **Lenient library functions** (p5.js's own approach: `circle()` with no values warns and draws nothing). Each library would decide what "lenient" means, which is unsafe for libraries with real-world effects: a robot told to `drive` with no speed. And the leniency would sit in the library, out of sight of the card that caused it.

Skipping lines puts the leniency in the language, once, for every library. The libraries stay strict. The checker only reports what would certainly fail, so a skipped line is one that could not have run correctly.

## Consequences

- The checker treats a skipped line as absent, so a skip causes follow-on errors: skipping `[set(x)to]` makes every later `[get(x)]` a `NameError`. A follow-on error names the line that caused it, so the projection can point there.
- Skipping is safe for libraries that only produce output, such as drawing and sound. A library with real-world effects can be left running in an unsafe state: if `[call:robot.stop][get(sped)]` is skipped, the robot keeps driving. Python leaves the same state when it stops at that line. The safeguard is `[on:stop]`, which runs whenever the program stops, so a library can halt its hardware there.
- In an `[if]`/`[elif]`/`[else]` chain, skipping a block head skips its block and every later block of the chain; the earlier blocks still run. Skipping only the one block would make the chain choose wrongly: with a half-built `[elif]` skipped, its `[else]` would run for the cases the `[elif]` was meant to catch, and with the `[if]` skipped, the `[else]` would run every time.
- A skipped line can change later state silently: a skipped `[call:append]` leaves a list short, and a later `IndexError` points elsewhere. Skipped lines must look skipped on the table.
- A future `[try]` catches runtime errors only. A skipped line never runs, so it never conflicts with `[try]`.
- A strict mode, which refuses to run while any line is skipped, can be added later for libraries that need it, without changing the language.
