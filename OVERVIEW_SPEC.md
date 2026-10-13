# Snapscript — Overview Spec

# About this file

A single-document description of what Snapscript is: the language, its text notation, and the physical system that runs it.

Conventions:

- Concise, and shows behaviour through examples rather than describing it.
- Describes the system as it is, with no history and no distinction between built and unbuilt.
- Carries no rationale. Decisions and the reasoning behind them live in `docs/adr/`.
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


| Separator | Meaning                              | Example                             |
| --------- | ------------------------------------ | ----------------------------------- |
| `.`       | namespace                            | `[call(p5.circle)]`                 |
| `:`       | printed on the card                  | `[color:midnightblue]`, `[on:load]` |
| `()`      | handwritten on the card's whiteboard | `[define(foo)]`, `[lit(500)]`       |


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


| Form            | Examples                                                                                                                                  |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| Keyword card    | `[+]`, `[(]`, `[)]`, `[dedent]`, `[none]`, `[root]`                                                                                       |
| Printed variant | `[color:purple]`, `[bool:true]`, `[call:p5.circle]`, `[get:p5.frameCount]`, `[on:load]`                                                   |
| Handwritten     | `[define(foo)]`, `[call(foo)]`, `[set(x)to]`, `[get(x)]`, `[setProp(p)to]`, `[getProp(p)]`, `[lit(500)]`, `[repeat(x)]`, `[for(x)in]`, `[global(x)]` |


Some cards are two sides of one card, changed by flipping:


|                  |                 |
| ---------------- | --------------- |
| `[set(x)to]`     | `[get(x)]`      |
| `[setProp(p)to]` | `[getProp(p)]`  |
| `[define(f)]`    | `[call(f)]`     |
| `[required(p)]`  | `[optional(p)]` |
| `[bool:true]`    | `[bool:false]`  |


`[lit(…)]` is a standalone card.

A **leaf** card holds a value and takes nothing:

```
[lit(500)]  [get(x)]  [bool:true]  [color:purple]  [none]  [root]
```

Every other card has one or more **value slots**.

## Data model

### Objects

Every value is an object. An object has a type, an identity, and behaviour from its type. Values are never copied; a name holds a reference.

```
[set(a)to][call:list]
[set(b)to][get(a)]
[get(b)][call:append][lit(1)]
[call:len][get(a)]                       1
```

Some objects also have a **store**, which holds data put in at run time.


| Object                            | Store                                    | Written from    |
| --------------------------------- | ---------------------------------------- | --------------- |
| `num` `str` `bool` `color` `none` | none                                     |                 |
| function                          | none                                     |                 |
| `list`                            | positions                                | anywhere        |
| `dict`                            | attributes                               | anywhere        |
| module                            | attributes: its top-level declarations   | its own file    |


Behaviour comes from the type, never from a store.

```
[get(scores)][call:append][lit(40)]      append comes from list
```

### Types


| Type       | Written as                         |
| ---------- | ---------------------------------- |
| `num`      | `[lit(500)]`                       |
| `str`      | `[lit(hello world)]`               |
| `bool`     | `[bool:true]`, `[bool:false]`      |
| `color`    | `[color:midnightblue]`             |
| `none`     | `[none]`                           |
| `list`     | `[call:list][lit(1)][lit(2)]`      |
| `dict`     | `[call:dict]`                      |
| function   | `[define(…)]`, `[extern(…)]`       |
| module     | `[import(…)as(…)]`                 |


`none` is the value of an optional parameter that was not supplied.

Handwriting in `[lit(…)]` resolves to `num` or `str` by casting rule: **TBD**.

### Lists

```
[set(scores)to][call:list][lit(10)][lit(20)][lit(30)]
[set(empty)to][call:list]
```

```
[get(scores)][call:getAt][lit(0)]             10
[get(scores)][call:getAt][lit(-1)]            30
[get(scores)][call:setAt][lit(0)][lit(5)]
[get(scores)][call:append][lit(40)]
[get(scores)][call:pop]
[call:len][get(scores)]                       3
```

```
[for(s)in][get(scores)]
  [call:print][get(s)]
[dedent]
```

A list has no attributes.

```
[get(scores)][setProp(label)to][lit(round one)]     error
```

### Dicts

`[call:dict]` makes an empty dict. `[setProp(…)to]` and `[getProp(…)]` act on the attributes of the value to their left. Only a `dict` and a module have attributes.

```
[set(user)to][call:dict]
[get(user)][setProp(message)to][lit(Welcome user!)]
[call:print][get(user)][getProp(message)]     Welcome user!
```

Attribute names are handwritten, and cannot be computed at run time. Reading an attribute that is not set is an error.

```
[get(user)][getProp(missing)]                 error
```

Attributes chain.

```
[get(app)][getProp(user)][getProp(name)]
[get(app)][getProp(items)][call:getAt][lit(0)]
```

Dicts are not iterable.

Keys computed at run time: **TBD**.

## Execution model

### Structure of a program

Five cards stand alone. Every other card snaps beneath a `[define(…)]` or an `[on:…]`.

```
[define(…)]    [on:…]    [import(…)as(…)]    [extern(…)]    [global(…)]
```

All five are hoisted, so their position on the table carries no meaning. Any other card not connected to a `[define]` or an `[on:]` is not part of the program.

```
[define(setup)]
[call:print][lit(hello world)]
```

`[define(…)]`, `[import(…)as(…)]`, `[extern(…)]` and `[global(…)]` each set an attribute on the module object.

### Naming and binding

A bare name resolves where the cards are written: in the local scope, then among the top-level declarations of the file.

```
[define(setup)]
[set(count)to][lit(0)]      a local, gone when setup returns

[define(draw)]
[call:print][get(count)]    error: count is not defined
```

```
[import(./p5.snap)as(p5)]

[define(helper)]
[call:print][lit(hi)]

[define(setup)]
[call(helper)]              a top-level declaration
[set(f)to][get(helper)]     the function as a value
```

Variables are function-scoped.

```
[define(a)]
[set(n)to][lit(0)]

[define(b)]
[call:print][get(n)]        error: n is not defined here
```

A loop variable is function-scoped and outlives its loop.

```
[repeat(i)][lit(3)]
  [call:print][get(i)]
[dedent]
[call:print][get(i)]        2
```

`[set(x)to]` makes a local, unless the file declares `[global(x)]`.

```
[global(count)][lit(0)]

[define(draw)]
[set(count)to][get(count)][+][lit(1)]     the global
[set(n)to][lit(5)]                        a local
```

Module constants: **TBD**.

### Errors

Error types and error handling: **TBD**.

## Modules

A module is an object. `[import(…)as(…)]` loads a module and binds its object to a name. Paths and URLs resolve; nothing else does.

```
[import(http://snapscript.s12.space/mods/p5.snap)as(p5)]
[import(./shapes.snap)as(shapes)]
[import(./shapes.snap)]                 binds to "shapes"
```

A namespace on a card and a receiver to the left are the same thing.

```
[call:shapes.star][lit(10)][lit(10)]    [get(shapes)][call:star][lit(10)][lit(10)]
[get(shapes.unit)]                      [get(shapes)][getProp(unit)]
```

A module's attributes are read from any file, and written only in its own file.

```
[get:p5.frameCount]
[get(p5)][setProp(frameCount)to][lit(0)]      error
```

`[extern(…)]` declares a function backed by a native implementation. A name may be declared more than once; calls dispatch on the number of arguments supplied, and a name's declarations must not accept the same count. `[define(…)]` is declared once.

```
// mods/p5.snap

[global(frameCount)][lit(0)]

[extern(createCanvas)][required(width)][required(height)]
[extern(random)][optional(min)][lit(0)][optional(max)][lit(1)]
[extern(circle)][required(x)][required(y)][required(d)]

[extern(fill)][required(color)]
[extern(fill)][required(r)][required(g)][required(b)]

[define(star)][required(x)][required(y)]
[call(circle)][get(x)][get(y)][lit(5)]
```

`[on:…]` declares a handler for a program event. Like `[define]`, it does not indent its body and appears only at the top level. `[root]` is the module object of the file the program runs.

```
// mods/p5.snap

[on:load]
[root][call:setup]
```

Two handlers for the same event is an error, so a file cannot add a handler its imported module already declares.

Repeated execution, and the events each module declares: **TBD**. Native resolution: **TBD**. Namespace collisions: **TBD**.

## Expressions

### Value slots

A card with slots grabs values to its right until a **stop sign**: a `[)]` or the end of the line. An operator card extends the expression in progress and does not end the grab.

```
[set(x)to][lit(5)][+][lit(3)]              x = 5 + 3
[for(i)in][call:range][lit(10)][*][lit(2)]  range(20)
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

Grabbing more values than a card accepts is an error. A **variadic** slot accepts any number of values; `[call:list]` is the only card with one.

### Attributes and calls

A card placed directly after a value acts on that value and is not itself grabbed as a value. `[getProp(…)]` reads an attribute, `[call:…]` calls.

```
[call:print][get(a)][get(b)]               print(a, b)
[call:print][get(a)][getProp(b)]           print(a.b)
[call:print][get(a)][call:b]               print(a.b())
```

After a module, `[call:…]` calls the module's function. After any other value, it calls a method of the value's type.

```
[get(shapes)][call:star][lit(10)][lit(10)]    the function star in shapes
[get(scores)][call:append][lit(40)]           the method append of list
[get(user)][call:greet]                       error: dict has no method greet
```

A function held in a dict is called from a name.

```
[set(f)to][get(user)][getProp(greet)]
[call(f)]
```

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
```

## Compound statements

A block's body is indented. The bottom magnet of `[repeat(x)]`, `[for(x)in]` and `[if]` is inset, so the card that snaps below lands indented. `[dedent]` closes the block.

```
[repeat(i)][lit(100)]
  [call:p5.circle][get(i)][lit(10)][lit(5)]
[dedent]

[if][get(score)][>][lit(10)]
  [call:print][lit(you win)]
[dedent]
```

`[dedent]`'s column in text: **TBD**.

### Loops

`[repeat(…)]` counts. It takes the slots of `[call:range]`, and the handwritten name is the counter.

```
[repeat(i)][lit(100)]                   for i in range(100)
[repeat(i)][lit(0)][lit(100)]           for i in range(0, 100)
[repeat(i)][lit(0)][lit(100)][lit(10)]  for i in range(0, 100, 10)
```

The end is excluded.

```
[repeat(i)][lit(3)]
  [call:print][get(i)]                  0 1 2
[dedent]
```

`[for(…)in]` iterates a value, and takes a `list` or a `range`. The two loops below are the same loop.

```
[repeat(i)][lit(100)]
[for(i)in][call:range][lit(100)]
```

### Functions

`[define(…)]` does not indent its body, and can only appear at the top level. Its body runs to the next top-level declaration. It is hoisted, so its position on the table carries no meaning.

```
[define(greet)][required(message)][optional(title)][lit(Mx)][optional(suffix)]
[call:print][get(title)][+][lit( )][+][get(message)][+][get(suffix)]

[call(greet)][lit(Ada)]              title is "Mx", suffix is none
```

Required parameters come before optional ones. An optional parameter with no default is `none`.

Declared signatures are checked. Checking semantics: **TBD**. Returning a value from `[define(…)]`: **TBD**.

## Builtins

Builtins are called without a namespace.

```
[call:print][lit(hello)]
[call:range][lit(10)]                   0 1 2 … 9
[call:range][lit(0)][lit(500)][lit(25)] 0 25 50 … 475
[call:len][get(scores)]
[call:dict]                             an empty dict
[call:list][lit(1)][lit(2)]             a list
```

Full list: **TBD**.

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

A statement card's top magnet mates into a chain descending from a `[define]` or an `[on:]`, so an unconnected statement is inert.

A statement that starts with a value card — `[get(scores)][call:append][lit(40)]` — does not align with the statement column under the rule above. Resolution: **TBD**.

A camera above the table reads the card arrangement. A projector opposite displays the running sketch and draws on the cards.

# Feedback

Initial direction:

- Errors light up the cards responsible.
- Cards that are not part of the program are dimmed.
- The grouping the system inferred is outlined in light, including operator precedence and how far each card grabbed.
- Virtual blocks show where cards can be placed.
- Picking up a card projects its doc comment.
