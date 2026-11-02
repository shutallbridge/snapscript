# Snapscript

Snapscript is a table-top block-based programming language and the programming system built around it. It is designed for writing p5.js-like sketches that draw on a canvas to produce drawings and digital art.

Programs are written with physical cards. Each card is a block, and cards snap to one another with magnets to form the program.

A camera and a projector are mounted directly above a table, looking down at the cards. The camera reads the arrangement of the cards to determine the program. The projector displays the running sketch on the other side of the table, lights up cards to show errors, and projects virtual blocks that show where cards should be placed.

The language reference, `REFERENCE.md`, is the full definition of the language and its text notation. This README covers what Snapscript is for and the physical system that runs it.

This file follows the reference's conventions: it describes the system as it is, concisely and through examples, with no history, no rationale and no distinction between built and unbuilt. Decisions and the reasoning behind them live in `docs/adr/`. Unsettled points are marked **TBD**.

## Goals

Programming is usually a single-player activity in front of a computer. Snapscript moves it onto a table that people sit around together, so writing a program becomes something a group does with their hands, in the same space, at the same time.

## Guiding Principles

- Block-based and approachable syntax like Scratch.
- Concepts and semantics are easily transferable to Python.
- Where possible, syntax is physically enforced to naturally encourage valid syntax.

## The Physical System

Cards snap to one another with magnets. A card with two sides turns over top-to-bottom: its top and bottom edges change places. Where the magnets sit on each card is fixed by the language version's magnet arrangement.

A camera above the table reads the card arrangement. A projector opposite displays the running sketch and draws on the cards.

When the camera is not sure what a card's handwriting says, the card has a **read error**. Its line is skipped, like a line with a structure or check error. A read error belongs to the physical system, not the language: it has no kind and no stage.

Lengths on the table are measured in U. Every card is 1U tall and a whole number of U long. Every card is at least 2U long. Most cards need it for their written text: a handwritten name such as `[define{drawCircle}]`, or a reserved word such as `[repeat]`. Each side of a card also holds a marker, a printed pattern that the camera reads to learn which side it is, where it lies and how it is turned. Cards with one symbol, such as `[(]`, `[)]` and `[+]`, are 2U long too: a sketch at real size showed that a 1U card is too small even for them.

## Feedback

Initial direction:

- Errors light up the cards responsible, with a numbered badge (E1) in the line's gutter, left of the line. The message, in plain words with its kind, is in a status bar along the table's edge: "E1 TypeError: circle's x needs a number. Got a string instead."
- Errors other than runtime errors show as soon as the cards are placed, whether or not the program is running.
- Skipped lines look skipped. An error that comes from a skipped line points to it.
- Cards that are not part of the program look like skipped lines.
- The grouping the system inferred is outlined in light, including operator precedence and how far each card grabbed.
- Virtual cards show where cards can be placed: a program opened from a file, a textbook page's cards, and the values a call card expects after it.
- Picking up a card projects its doc comment.
