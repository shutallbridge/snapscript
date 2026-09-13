# Snapscript — Overview Spec

# About this file

A single-document description of what Snapscript is: the language, its text notation, and the physical system that runs it.

Conventions:

- Concise, and shows behaviour through examples rather than describing it.
- Describes the system as it is, with no history and no distinction between built and unbuilt.
- Carries no rationale. Decisions and the reasoning behind them live in `ADR.md`.
- Unsettled points are marked **TBD**.

# Overview

Snapscript is a table-top block-based programming language and the programming system built around it. It is designed for writing p5.js-like sketches that draw on a canvas to produce drawings and digital art.

Programs are written with physical cards. Each card is a block, and cards snap to one another with magnets to form the program.

A camera and a projector are mounted directly above a table, looking down at the cards. The camera reads the arrangement of the cards to determine the program. The projector displays the running sketch on the other side of the table, lights up cards to show errors, and projects virtual blocks that show where cards should be placed.

# Goals

Programming is usually a single-player activity in front of a computer. Snapscript moves it onto a table that people sit around together, so writing a program becomes something a group does with their hands, in the same space, at the same time.

# Guiding Principles

- Block-based and approachable syntax like Scratch.
- Concepts and semantics are easily transferable to Python.
- Where possible, syntax is physically enforced to naturally encourage valid syntax.

# Notation

Every card is written as `[…]`, in the order the cards appear on the table.

Three separators appear inside a card:

| Separator | Meaning | Example |
|---|---|---|
| `.` | namespace | `[call(p5.circle)]` |
| `:` | printed on the card | `[color:midnightblue]`, `[on:load]` |
| `()` | handwritten on the card's whiteboard | `[define(foo)]`, `[lit(500)]` |

A card family with printed variants and the same family handwritten mean the same thing:

```
[call:p5.circle]     printed on a card as: circle
[call(p5.circle)]    handwritten with a marker
```

Indentation reproduces the indentation on the table.

Comments are `//` and `/* */`, and exist only in text.

```
// a line comment
/* a block comment */
```

Doc comments precede a declaration and are projected as help when a card is picked up. Syntax: **TBD**.

# The Language

## A first sketch

```
[import(http://snapscript.s12.space/mods/p5.snap)as(p5)]

[define(setup)]
[call:p5.createCanvas][lit(500)][lit(500)]
[call:p5.background][color:midnightblue]

[define(draw)]
[set(x)to][call:p5.random][lit(0)][lit(500)]
[set(y)to][call:p5.random][lit(0)][lit(500)]
[call:p5.circle][get(x)][get(y)][lit(5)]
```

## Cards

| Form | Examples |
|---|---|
| Keyword card | `[+]`, `[(]`, `[)]`, `[dedent]`, `[none]` |
| Printed variant | `[color:purple]`, `[bool:true]`, `[call:p5.circle]`, `[on:load]` |
| Handwritten | `[define(foo)]`, `[call(foo)]`, `[set(x)to]`, `[get(x)]`, `[lit(500)]` |

Some cards are two sides of one card, changed by flipping:

| | |
|---|---|
| `[set(x)to]` | `[get(x)]` |
| `[define(f)]` | `[call(f)]` |
| `[required(p)]` | `[optional(p)]` |
| `[bool:true]` | `[bool:false]` |

`[lit(…)]` is a standalone card.

A **leaf** card holds a value and takes nothing:

```
[lit(500)]  [get(x)]  [bool:true]  [color:purple]  [none]
```

Every other card has one or more **value slots**.

## Values

| Type | Written as |
|---|---|
| `num` | `[lit(500)]` |
| `str` | `[lit(hello world)]` |
| `bool` | `[bool:true]`, `[bool:false]` |
| `color` | `[color:midnightblue]` |
| `none` | `[none]` |

`none` is the value of an optional parameter that was not supplied.

Handwriting in `[lit(…)]` resolves to `num` or `str` by casting rule: **TBD**.

## Value slots

A card with slots grabs values to its right until a **stop sign**: an operator card, a `[)]`, or the end of the line.

```
[set(x)to][lit(5)][+][lit(3)]              x = 5 + 3
[repeat][lit(10)][*][lit(2)]               repeat 20 times
[if][get(a)][>][lit(5)]                    if a > 5
[call:print][call:random]                  print(random())
[call:print][call:random][+][lit(5)]       print(random() + 5)
```

Grabbing stops early where a stop sign is placed:

```
[call:print][call:random][lit(5)]                print(random(5))
[call:print][call:random][(][)][lit(5)]          print(random(), 5)
[call:p5.circle][call:random][(][lit(0)][lit(500)][)][lit(5)][lit(5)]
                                                 circle(random(0, 500), 5, 5)
```

Grabbing more values than a card accepts is an error.

## Expressions

### Operators and precedence

```
*  /  %          binds tightest
+  -
>  <  >=  <=  ==  !=
and
or               binds loosest
```

Operators at the same level evaluate left to right.

```
[lit(2)][+][lit(3)][*][lit(4)]        14
[lit(10)][-][lit(3)][-][lit(2)]       5
```

### Grouping

`[(]` and `[)]` group an expression, and close a value slot early.

```
[(][lit(2)][+][lit(3)][)][*][lit(4)]                            20
[(][get(a)][>][lit(1)][)][and][(][get(b)][<][lit(2)][)]         a > 1 and b < 2
```

## Simple statements

```
[set(width)to][lit(500)]                       width = 500
[set(x)to][get(width)][/][lit(2)]              x = width / 2
[call:p5.circle][lit(10)][lit(10)][lit(5)]     circle(10, 10, 5)
[import(./p5.snap)as(p5)]                      import p5
```

## Compound statements

A block's body is indented. The bottom magnet of `[repeat]` and `[if]` is inset, so the card that snaps below lands indented. `[dedent]` closes the block.

```
[repeat][lit(100)]
  [call:p5.circle][lit(10)][lit(10)][lit(5)]
[dedent]

[if][get(score)][>][lit(10)]
  [call:print][lit(you win)]
[dedent]
```

`[dedent]`'s column in text: **TBD**.

### Functions

`[define(…)]` does not indent its body, and can only appear at the top level. Its body runs to the next top-level declaration.

```
[define(greet)][required(message)][optional(title)][lit(Mx)][optional(suffix)]
[call:print][get(title)][+][lit( )][+][get(message)][+][get(suffix)]

[call(greet)][lit(Ada)]              title is "Mx", suffix is none
```

Required parameters come before optional ones. An optional parameter with no default is `none`.

Declared signatures are checked. Checking semantics: **TBD**.

## Scope

Variables are function-scoped.

```
[define(a)]
[set(n)to][lit(0)]

[define(b)]
[call:print][get(n)]        error: n is not defined here
```

Functions are global.

Top-level statements run in order, like Python. There is no entry point function.

## Modules

`[import(…)as(…)]` loads a module and binds it to a namespace. Paths and URLs resolve; nothing else does.

```
[import(http://snapscript.s12.space/mods/p5.snap)as(p5)]
[import(./shapes.snap)as(shapes)]
[import(./shapes.snap)]                 binds to "shapes"
```

`[extern(…)]` declares a function backed by a native implementation.

```
// mods/p5.snap

[extern(createCanvas)][required(width)][required(height)]
[extern(random)][optional(min)][lit(0)][optional(max)][lit(1)]

[define(star)][required(x)][required(y)]
[call(circle)][get(x)][get(y)][lit(5)]
```

`[on:…]` declares a handler for a global event. Like `[define]`, it does not indent its body and appears only at the top level.

```
[on:load]
[call(setup)]
```

Native resolution: **TBD**. Namespace collisions: **TBD**.

# The Physical System

Cards snap to one another with magnets. Statement cards connect top and bottom to form a vertical flow; value cards connect left and right to form a line.

The magnets on a card's top and bottom edges are off-centre, so flipping the card mirrors them to the opposite side. A flipped card no longer aligns with the statement column:

```
  |
[set(x)to]
  |

              |
[get(x)]
              |
```

`[define(f)]`'s top magnet lands where nothing matches, so it can never snap beneath another card. Each function is a free-standing strip that can be moved around the table.

A camera above the table reads the card arrangement. A projector opposite displays the running sketch and draws on the cards.

# Feedback

Initial direction:

- Errors light up the cards responsible.
- The grouping the system inferred is outlined in light, including operator precedence and how far each card grabbed.
- Virtual blocks show where cards can be placed.
- Picking up a card projects its doc comment.
