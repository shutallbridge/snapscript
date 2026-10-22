# `{}` marks handwriting; `()` marks everything else

In text, a handwritten slot is written in braces and every other slot in parentheses. `:` is no longer used.

```
[define{draw}]                                     handwritten on a whiteboard
[call(p5.circle)][get{x}][get{y}][num{5}]          printed, then handwritten
[import(snapscript-p5)as(p5)]                      typed in a file, never on a whiteboard
```

The text needs to record one thing about each card's physical form: whether it is printed or handwritten. The projector needs it to draw virtual cards from a `.snap` file, such as a lesson for students to copy. Everything else about the physical card (its marker ID, which library supplied it, its help) is looked up in the project's lockfile.

The old notation was `[call:p5.circle]` for printed and `[call(p5.circle)]` for handwritten. It had two problems:

- **`:` only fits a card with one trailing label.** A two-slot card such as `[set…to]` or `[for…in]` had no printed form.
- **`()` claimed handwriting where there is none.** `[import(…)as(…)]` in a prelude and `[extern(…)]` in a library are typed in a file and never written on a whiteboard.

Two other ways were considered:

- **Keep `:` / `()`, and redefine `()` as "written by the author".** It fixes the import cards, but still has no printed form for two-slot cards.
- **Also record whether a name is registered or free-form.** The language never needs it: printed and handwritten cards mean the same thing, and a name that does not exist is already a `NameError` or `AttributeError` at the check stage.

Handwriting gets the different bracket because it is the special case: only a whiteboard slot is read by handwriting recognition, and only it can have a read error.

## Consequences

- The language ignores which bracket is used. Text in `()` follows the handwriting rules too (`_` is a space, gaps are ignored), so swapping `()` and `{}` never changes what a program does.
- Every slot of a card uses the same bracket, because a card is printed or handwritten as a whole.
- A text file can name a printed card that no library offers, such as `[define(draw2)]`. The program is still valid; only the projector cannot draw that card.
- A library's own modules are never on the table, so they can be written entirely in `()`.
- The magnets tool still uses the old notation in its data, tests and reports until it is moved over.
