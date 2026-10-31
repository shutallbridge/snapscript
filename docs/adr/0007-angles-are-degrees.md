# Angles are degrees

Every angle in Snapscript is in degrees: in the builtins `[call(sin)]` and `[call(cos)]`, and in every library, such as `p5.rotate` and `p5.arc` in `snapscript-p5`. There is no way for a program to switch units.

```
[call(sin)][num{90}]        1
```

Snapscript is for beginners first, and beginners know degrees from school. Scratch, the closest thing to Snapscript most of them will have used, turns sprites in degrees. Radians would make the first sketch that moves something in a circle need `[get(pi)]` and a division before it does anything they can see.

Three other ways were considered:

- **Radians** (Python, JavaScript, p5.js by default). Transfers to Python with no change, but asks a beginner to learn a new unit before they can draw a circle of dots.
- **A unit mode** (p5.js's `angleMode(DEGREES)`). Lets each program choose, but then the same card means different things depending on a card laid elsewhere on the table, perhaps in another person's strip. A table is shared, so a card has to mean the same thing wherever it sits.
- **Separate functions** (`sinDeg` beside `sin`). Both units without a mode, but twice the cards, and a beginner has to know which one they want before they know why there are two.

## Consequences

- Porting a program to Python needs a conversion: `sin(radians(a))` for `[call(sin)][get{a}]`. Snapscript's guiding principle is that concepts transfer to Python easily, not that programs are identical, and a unit conversion is easy to explain once.
- The decision can't wait. Switching units later would change what every old program draws, silently: no error points at the change.
- Libraries follow the language. A library that wraps something in radians converts at its edge, so its cards take degrees.
- `[call(round)]` rounds halves away from zero (`[call(round)][num{2.5}]` is `3`), where Python rounds them to even (`round(2.5)` is `2`). It is the same kind of trade-off: what a beginner expects, at the cost of a difference to write down for porting, decided now because changing it later would silently change old programs.
