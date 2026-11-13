# SnapScript

SnapScript is a projection-augmented, tangible computing environment for creative coding. Learners arrange physical cards on a table to form programs that draw 2D graphics.

A camera above the table reads the cards, and a projector draws on them: hints, errors, help, and the running program's output, live as the cards move.

[![SnapScript demo video](https://img.youtube.com/vi/jZPvZlf5JxQ/maxresdefault.jpg)](https://www.youtube.com/watch?v=jZPvZlf5JxQ)

[Watch the demo on YouTube](https://www.youtube.com/watch?v=jZPvZlf5JxQ)

## Features

- **Write programs with cards.** Each card is one block. Some have a whiteboard for freeform values, like a number or a name, which the system reads from handwriting.
- **See the output live.** The program's graphics are projected beside the cards and update as the program is arranged, so learners can try something, look and refine it.
- **Useful hints.** Lay a function card and the table shows the values it still needs, such as the y-position and diameter of a circle.
- **Meaningful errors.** Errors light up the cards responsible, with a plain message that says how to fix them.
- **Help on demand.** Place a card in the help corner to see how to use it.
- **Interactive textbook.** Printed lessons the table recognises. Turn a page and the table shows its example arrangement on the table, so each learner can work at their own pace.
- **Syntax enforced by magnets** _(in progress)_. Cards that fit together snap; cards that don't, repel or don't snap.
- **Made for a group.** Everyone sits around one table and works on one program, like a tabletop card game.

## Goals

For each part of learning to program, SnapScript removes the friction that doesn't build understanding and keeps the friction that does.

- **Approachable syntax.** Cards that make sense on their own and read like a sentence, in place of strict syntax, verbose code and intimidating errors. Block-based, like Scratch.
- **Concepts that transfer.** What learners build on the table carries over to Python.
- **Learning together.** Sharing work and negotiating ideas with others, in place of working and struggling alone.
- **Open-ended work with tight feedback.** Exploring and refining your own ideas, in place of closed exercises with slow feedback.
- **Your own pace.** Each concept builds on the last, without a single fixed pace for everyone.

## Status

SnapScript is a working prototype, before its first release (0.1.0). The magnet cards are still being prototyped.

The language and its text notation are defined in [`REFERENCE.md`](REFERENCE.md).
