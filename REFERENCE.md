# Snapscript Language Reference

## About this file

The language reference: it defines the Snapscript language and its text notation. A language version locks it. What Snapscript is, and the physical system that runs it, are in `README.md`.

Conventions:

- Concise, and shows behavior through examples rather than describing it.
- Describes the language as it is, with no history and no distinction between built and unbuilt.
- Carries no rationale. Decisions and the reasoning behind them live in `docs/adr/`.
- Unsettled points are marked **TBD**.

## 1. Introduction

Snapscript is a block-based language written with cards. A program is made by snapping cards together on a table, and the text notation writes it down, as in a `.snap` file.

### 1.1. Notation

Every card is written as `[…]`, in the order the cards appear on the table.

Inside a card, brackets hold its text, and `.` separates a namespace:

| Inside | Meaning                                        | Example                                                                |
| ------ | ---------------------------------------------- | ---------------------------------------------------------------------- |
| `()`   | printed on the card, or written in a text file | `[color(midnightblue)]`, `[on(load)]`, `[import(snapscript-p5)as(p5)]` |
| `{}`   | handwritten on the card's whiteboard           | `[define{foo}]`, `[num{500}]`, `[set{x}to]`                            |
| `.`    | namespace                                      | `[call(p5.circle)]`                                                    |

Every slot of a card uses the same bracket. A printed card and the same card handwritten mean the same thing:

```
[call(p5.circle)]    printed on a card as: circle
[call{p5.circle}]    handwritten with a pen
```

Indentation reproduces the indentation on the table. One indent is two spaces.

Comments are `//` and `/* */`, and exist only in text.

```
// a line comment
/* a block comment */
```

A doc comment is a `/** */` comment just before a declaration. It is projected as help when a card is picked up.

```
/**
 * Draws a circle.
 * @param {num} x  how far from the left
 * @param {num} y  how far from the top
 * @param {num} d  how wide
 */
[extern(circle)][required(x)][required(y)][required(d)]
```

A doc comment anywhere else stands alone. Tags other than `@param` and `@returns` are for the system, and do not change the program.

A library offers printed cards with `@card` tags in its doc comments. A `@card` above a declaration offers that declaration's card; a `@card` followed by a card offers that card.

```
/**
 * Draws a circle.
 * @card
 */
[extern(circle)][required(x)][required(y)][required(d)]     offers [call(p5.circle)]

/**
 * Runs once, before the first draw.
 * @card [define(setup)]
 */
```

A `@color` tag picks the color a `[call]` card is printed in: `primary`, `secondary`, `helper` or `setting`. A `[call]` card without one is `primary`. Builtins are `helper`. `@color` goes only beside a `@card` that offers a `[call]` card, and is ignored anywhere else.

```
/**
 * Sets the color that shapes drawn after it are filled with.
 * @param {color} color  the fill color
 * @card
 * @color setting
 */
[extern(fill)][required(color)]                             offers a rose [call(p5.fill)]
```

A `@table` tag says where a strip lies on the table. It goes in the doc comment of a card that stands alone (see 4.1), and does not change the program.

| Tag                     | Meaning                                                                                          |
| ----------------------- | ------------------------------------------------------------------------------------------------ |
| `@table <x> <y>`        | the top-left corner of the strip's first card, in whole mm from the top-left of the coding space |
| `@table <x> <y> <turn>` | the same, turned clockwise by whole degrees about that corner                                    |
| `@table auto`           | laid out by the system                                                                           |
| `@table hidden`         | not on the table; it still runs                                                                  |

x runs right and y runs down. `[import(…)as(…)]` and `[extern(…)]` are never on the table: they are always `@table hidden`. Every other card that stands alone is `@table auto` without the tag. The other cards of a strip sit in their places from its first card, each at the shortest length that holds its text.

```
/** @table 120 40 */
[define{setup}]
[call(p5.createCanvas)][num{500}][num{500}]

/**
 * Draws the confetti.
 * @table 40 210 15
 */
[define{draw}]
[call(p5.circle)][num{250}][num{250}][num{5}]

/** @table hidden */
[define{helper}]
[return][num{1}]
```

A `@table` the system cannot read counts as `@table auto`.

The system lays `@table auto` strips out in file order, down the left of the coding space: the first 4U from its top and left edges, each next one 2U below the last. When a column runs out of room, the next column starts 2U right of its widest strip. The same file always lays out the same way, and a strip added at the end never moves the ones before it.

### 1.2. A first sketch

```
[import(snapscript-p5)as(p5)]

[define{setup}]
[call(p5.createCanvas)][num{500}][num{500}]
[call(p5.background)][color(midnightblue)]

[define{draw}]
[set{x}to][call(random)][num{0}][num{500}]
[set{y}to][call(random)][num{0}][num{500}]
[call(p5.circle)][get{x}][get{y}][num{5}]
```

## 2. Cards

| Form         | Examples                                                                                                                                              |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Keyword card | `[+]`, `[(]`, `[)]`, `[not]`, `[if]`, `[elif]`, `[else]`, `[repeat]`, `[dedent]`, `[return]`, `[none]`, `[root]`                                     |
| Printed      | `[color(purple)]`, `[bool(true)]`, `[call(p5.circle)]`, `[get(p5.frameCount)]`, `[on(load)]`                                                          |
| Handwritten  | `[define{foo}]`, `[call{foo}]`, `[set{x}to]`, `[get{x}]`, `[setProp{p}to]`, `[getProp{p}]`, `[num{500}]`, `[str{hello}]`, `[for{x}in]`, `[global{x}]` |

Some cards are two sides of one card, changed by flipping. The two sides take the same places in a program:

|                |                 |
| -------------- | --------------- |
| `[num{…}]`     | `[str{…}]`      |
| `[bool(true)]` | `[bool(false)]` |
| `[color(…)]`   | `[color(…)]`    |
| `[+]`          | `[-]`           |
| `[*]`          | `[/]`           |
| `[<]`          | `[>]`           |
| `[<=]`         | `[>=]`          |
| `[==]`         | `[!=]`          |
| `[and]`        | `[or]`          |

A color card has a different color on each side. Which colors a kit has, and which two share a card, is the kit's choice.

Every other card has one side, `[%]`, `[set{x}to]` and `[get{x}]` among them.

A **leaf** card holds a value and takes nothing:

```
[num{500}]  [str{hi}]  [get{x}]  [bool(true)]  [color(purple)]  [none]  [root]
```

Every other card has one or more **value slots**.

### 2.1. Handwriting

Gaps in handwriting are ignored. `_` is a space, and a `[str{…}]` cannot hold a literal `_`. Handwriting cannot hold brackets: `{`, `}`, `[`, `]`, `(` and `)` are left out of what is read. Text in `()` follows the same rules, so a card means the same printed or handwritten.

```
[str{hello_world}]      "hello world"
[str{hello world}]      "helloworld"
[str{__hi}]             "  hi"
[str{}]                 ""
[num{1 000}]            1000
[set{frame Count}to]    frameCount
```

A `[num{…}]` holds digits, with an optional `-` first and an optional `.` that has digits on both sides.

```
[num{-1}]  [num{0.5}]
[num{.5}]  [num{5.}]  [num{1e5}]  [num{}]      SyntaxError
```

A name holds letters, digits and `_`. Case is ignored, because a handwritten `x` and `X` often can't be told apart.

```
[set{frameCount}to]     frameCount
[set{framecount}to]     the same name
[get{p5.framecount}]    p5.frameCount
[set{}to]               SyntaxError
```

This covers every name: variables, functions, parameters, attributes, module names and builtins. Every rule about names compares them ignoring case, so `[define{drawCircle}]` and `[define{drawcircle}]` in one file are two declarations with the same name. Case still counts in strings, import paths and package names.

The text keeps each name as it was written. A message about a declaration uses the spelling it was declared with.

```
[define{drawCircle}][required{x}][required{y}][required{d}]
[call{drawcircle}][num{5}]                  TypeError: drawCircle takes 3 values
```

By convention, names are camelCase: `frameCount`, `drawCircle`. In Python, case counts (`score` and `Score` are two names), and names are snake_case (`frame_count`).

### 2.2. Lines and strips

Statement cards connect top and bottom to form a vertical flow; value cards connect left and right to form a line.

Each function is a free-standing strip that can be moved around the table.

A statement card's top magnet mates into a chain descending from a `[define]` or an `[on(…)]`, so an unconnected statement is inert.

## 3. Data model

### 3.1. Objects

Every value is an object. An object has a type, an identity, and behavior from its type. Values are never copied; a name holds a reference.

```
[set{a}to][call(list)]
[set{b}to][get{a}]
[get{b}][call(append)][num{1}]
[call(len)][get{a}]                      1
```

Some objects also have a **store**, which holds data put in at run time.

| Object                            | Store                                  | Written from |
| --------------------------------- | -------------------------------------- | ------------ |
| `num` `str` `bool` `color` `none` | none                                   |              |
| function                          | none                                   |              |
| `list`                            | positions                              | anywhere     |
| `dict`                            | attributes                             | anywhere     |
| module                            | attributes: its top-level declarations | its own file |

Behavior comes from the type, never from a store.

```
[get{scores}][call(append)][num{40}]     append comes from list
```

### 3.2. Types

| Type     | Written as                      |
| -------- | ------------------------------- |
| `num`    | `[num{500}]`                    |
| `str`    | `[str{hello_world}]`            |
| `bool`   | `[bool(true)]`, `[bool(false)]` |
| `color`  | `[color(midnightblue)]`         |
| `none`   | `[none]`                        |
| `list`   | `[call(list)][num{1}][num{2}]`  |
| `dict`   | `[call(dict)]`                  |
| function | `[define{…}]`, `[extern(…)]`    |
| module   | `[import(…)as(…)]`              |

`none` is the value of an optional parameter that was not supplied.

The card decides the type. `[color(…)]` takes a CSS color name.

```
[color(notacolor)]                           SyntaxError
```

### 3.3. Lists

```
[set{scores}to][call(list)][num{10}][num{20}][num{30}]
[set{empty}to][call(list)]
```

```
[get{scores}][call(getAt)][num{0}]            10
[get{scores}][call(getAt)][num{-1}]           30
[get{scores}][call(setAt)][num{0}][num{5}]
[get{scores}][call(append)][num{40}]
[get{scores}][call(pop)]                      40
[call(len)][get{scores}]                      3
```

A list's methods are `getAt`, `setAt`, `append` and `pop`. `pop` gives the item it removes; `setAt` and `append` give `none`. A negative position counts from the end.

```
[get{scores}][call(getAt)][num{3}]            IndexError
[get{empty}][call(pop)]                       IndexError
[get{scores}][call(getAt)][num{0.5}]          ValueError
```

```
[for{s}in][get{scores}]
  [call(print)][get{s}]
[dedent]
```

A list has no attributes.

```
[get{scores}][setProp{label}to][str{round_one}]     AttributeError
```

### 3.4. Dicts

`[call(dict)]` makes an empty dict. `[setProp{…}to]` and `[getProp{…}]` act on the attributes of the value to their left. Only a `dict` and a module have attributes.

```
[set{user}to][call(dict)]
[get{user}][setProp{message}to][str{Welcome_user!}]
[call(print)][get{user}][getProp{message}]    Welcome user!
```

Attribute names are handwritten, and cannot be computed at run time. Reading an attribute that is not set is an error.

```
[get{user}][getProp{missing}]                 AttributeError
```

Attributes chain.

```
[get{app}][getProp{user}][getProp{name}]
[get{app}][getProp{items}][call(getAt)][num{0}]
```

Dicts are not iterable.

## 4. Execution model

### 4.1. Structure of a program

Five cards stand alone. Every other card snaps beneath a `[define{…}]` or an `[on(…)]`.

```
[define{…}]    [on(…)]    [import(…)as(…)]    [extern(…)]    [global{…}]
```

All five are hoisted, so their position on the table carries no meaning. Any other card not connected to a `[define]` or an `[on(…)]` is not part of the program.

```
[define{setup}]
[call(print)][str{hello_world}]
```

`[define{…}]`, `[import(…)as(…)]`, `[extern(…)]` and `[global{…}]` each set an attribute on the module object.

Two top-level declarations with the same name in one file are an error, except `[extern(…)]`s that accept different numbers of values.

```
[define{f}]
[define{f}]                 SyntaxError, both strips

[import(snapscript-p5)as(p5)]
[define{p5}]                SyntaxError, both
```

### 4.2. Naming and binding

A bare name resolves where the cards are written: in the local scope, then among the top-level declarations of the file, then among the builtins.

```
[define{setup}]
[set{count}to][num{0}]      a local, gone when setup returns

[define{draw}]
[call(print)][get{count}]   NameError: count is not defined. Did you mean round?
```

```
[import(snapscript-p5)as(p5)]

[define{helper}]
[call(print)][str{hi}]

[define{setup}]
[call{helper}]              a top-level declaration
[set{f}to][get{helper}]     the function as a value
```

A local or a top-level declaration may take a builtin's name, and hides the builtin: a local in its function, a top-level declaration in its file.

```
[define{print}][required{message}]      [call(print)] in this file calls this

[define{draw}]
[set{pi}to][num{3}]
[call(print)][get(pi)]                  3, the local
```

Variables are function-scoped.

```
[define{a}]
[set{n}to][num{0}]

[define{b}]
[call(print)][get{n}]       NameError: n is not defined
```

A name that a function sets anywhere is a local throughout that function.

```
[define{draw}]
[call{helper}]              NameError: helper is a local of draw, not set yet
[set{helper}to][num{1}]
```

A loop variable is function-scoped and outlives its loop.

```
[for{i}in][call(range)][num{3}]
  [call(print)][get{i}]
[dedent]
[call(print)][get{i}]       2
```

`[set{x}to]` makes a local, unless the file declares `[global{x}]`.

```
[global{count}][num{0}]

[define{draw}]
[set{count}to][get{count}][+][num{1}]     the global
[set{n}to][num{5}]                        a local
```

A global starts with one literal card, or an empty list or dict. Anything worked out is set in a function.

```
[global{speed}][num{5}]
[global{title}][str{hi}]
[global{scores}][call(list)]
[global{user}][call(dict)]
[global{mid}][num{500}][/][num{2}]        SyntaxError
[global{r}][call(random)]                 SyntaxError
```

### 4.3. Errors

Every error has a **kind**, named as in Python, and a **stage**: when it is found. An error is an object whose type is its kind. Nothing in a program creates or catches one.

| Stage     | Found                                    | Kinds                                                                                   |
| --------- | ---------------------------------------- | --------------------------------------------------------------------------------------- |
| structure | when cards cannot form a program         | `SyntaxError`, `IndentationError`                                                       |
| check     | before running, from names and types     | `NameError`, `TypeError`, `AttributeError`, `ImportError`                               |
| runtime   | while running                            | the check kinds, and `IndexError`, `ValueError`, `ZeroDivisionError`, `RecursionError`  |

```
[(][)]                                        SyntaxError
[repeat][num{0}][num{3}]                      SyntaxError
[call(print)][get{count}]                     NameError, when count is set nowhere
[call(p5.circle)][num{20}]                    TypeError: circle takes 3 values
[str{score}][+][num{5}]                       TypeError
[call{p5.circel}]                             AttributeError
[get{scores}][call(getAt)][num{9}]            IndexError, when scores has 3 items
```

A `NameError` suggests the closest name visible at its line, chosen as Python chooses it, when one is close enough.

```
[set{score}to][num{0}]
[call(print)][get{scare}]                     NameError: scare is not defined. Did you mean score?
```

The checker looks at names and types, never at values, and reports only what would certainly fail. A value it knows nothing about, such as a parameter with no type or an attribute of a dict, can be any type, and its errors are found at run time.

```
[define{show}][required{ready}]
[if][get{ready}]
  [set{n}to][num{1}]
[dedent]
[call(print)][get{n}]                         NameError at run time, when ready is false
```

A line with a structure or check error is **skipped**: it does not run, and the rest of its function does. Skipping a block head skips its body. Skipping a `[define{…}]` or `[on(…)]` line skips its strip.

```
[define{draw}]
[call(p5.circle)][num{5}][num{5}][num{2}]     runs
[set{x}to]                                    SyntaxError: skipped
[call(p5.circle)][num{5}]                     TypeError: skipped
[if][get{a}][>]                               SyntaxError: skipped with its body
  [call(print)][get{a}]
[dedent]
```

Skipping an `[if]`, `[elif]` or `[else]` line skips its block and every later block of its chain. The earlier blocks still run.

```
[if][get{a}]                                  runs
  [call(print)][str{a}]
[elif][get{b}][>]                             SyntaxError: skipped with the rest of the chain
  [call(print)][str{b}]
[else]                                        skipped
  [call(print)][str{neither}]
[dedent]
```

The checker treats a skipped line as absent. An error that comes from a skipped line names it.

```
[define{draw}]
[set{x}to]                                    SyntaxError: skipped
[call(p5.circle)][get{x}][num{20}][num{20}]   NameError, from the line above: skipped
```

A runtime error stops the program. The canvas keeps what was drawn, and every `[on(stop)]` runs.

Every file follows these rules, a module's text file as much as the table.

## 5. Modules

A module is an object. `[import(…)as(…)]` loads a module and binds its object to a name. It names an installed package, or a path that starts with `./` or `../`; nothing else resolves. A package's name loads the package's module.

```
[import(snapscript-p5)as(p5)]
[import(./shapes.snap)as(shapes)]
[import(./shapes.snap)]                 binds to "shapes"
[import(snapscript-p5)]                 SyntaxError: a package needs as(…)
```

Modules load before the program runs. A module is loaded once, however many files import it, and every file that imports it gets the same object.

```
[import(./missing.snap)as(m)]           ImportError
```

A module that imports itself, directly or through other modules, is an `ImportError`.

A namespace on a card and a receiver to the left are the same thing.

```
[call{shapes.star}][num{10}][num{10}]    [get{shapes}][call{star}][num{10}][num{10}]
[get{shapes.unit}]                      [get{shapes}][getProp{unit}]
```

A module's attributes are read from any file, and written only in its own file.

```
[get(p5.frameCount)]
[get{p5}][setProp{frameCount}to][num{0}]      AttributeError
```

`[extern(…)]` declares a function backed by a native implementation. A name may be declared more than once; calls dispatch on the number of arguments supplied, and a name's declarations must not accept the same count. `[define{…}]` is declared once.

```
// snapscript-p5

[global(frameCount)][num(0)]

[extern(createCanvas)][required(width)][required(height)]
[extern(circle)][required(x)][required(y)][required(d)]
[extern(rotate)][required(angle)]       an angle in degrees

[extern(fill)][required(color)]
[extern(fill)][required(r)][required(g)][required(b)]

[define(star)][required(x)][required(y)]
[call(circle)][get(x)][get(y)][num(5)]
```

`[on(…)]` declares a handler for a program event. Like `[define]`, it does not indent its body and appears only at the top level. `[root]` is the module object of the file the program runs.

| Event        | Runs                                                                                                   |
| ------------ | ------------------------------------------------------------------------------------------------------ |
| `[on(load)]` | once, when the program starts                                                                          |
| `[on(stop)]` | once, when the program stops: after a runtime error, when a new run replaces it, or when it is stopped |

A program stopped from outside gives its `[on(stop)]` handlers a moment to run. A handler still running after that, or a program that no longer responds, is stopped without them.

A file has at most one handler for each event; a second is a `SyntaxError`. Every file's handlers run, an imported module's before those of the file that imports it.

Repeating is a module's work: an `[extern(…)]` takes `[root]` and calls its functions.

```
// snapscript-p5

[extern(run)][required(program)]        calls program's setup once, then its draw every frame, if it has them

[on(load)]
[call(run)][root]
```

## 6. Expressions

### 6.1. Value slots

A card with slots grabs values to its right until the end of the line, or until the `[)]` that closes the group it is in. An operator card extends the expression in progress and does not end the grab.

```
[set{x}to][num{5}][+][num{3}]                x = 5 + 3
[for{i}in][call(range)][num{10}][*][num{2}]  range(20)
[if][get{a}][>][num{5}]                      if a > 5
[call(print)][call{random}]                  print(random())
[call(print)][call{random}][+][num{5}]       print(random() + 5)
[if][call(len)][get{a}][>][num{5}]           if len(a > 5)
```

A group ends every grab inside it:

```
[call(print)][call{random}][num{0}][num{5}]              print(random(0, 5))
[call(print)][(][call{random}][)][num{0}][num{5}]        print(random(), 0, 5)
[if][(][call(len)][get{a}][)][>][num{5}]                 if len(a) > 5
[call(p5.circle)][(][call{random}][num{0}][num{500}][)][num{5}][num{5}]
                                                         circle(random(0, 500), 5, 5)
[call{f}][(][call{g}][call{h}][num{1}][)][num{2}]        f(g(h(1)), 2)
```

Grabbing more values than a card accepts is an error. A **variadic** slot accepts any number of values; `[call(list)]` and `[call(print)]` have one.

### 6.2. Attributes and calls

A card placed directly after a value acts on that value and is not itself grabbed as a value. `[getProp{…}]` reads an attribute, `[call(…)]` calls.

```
[call(print)][get{a}][get{b}]              print(a, b)
[call(print)][get{a}][getProp{b}]          print(a.b)
[call(print)][get{a}][call{b}]             print(a.b())
```

After a module, `[call(…)]` calls the module's function. After any other value, it calls a method of the value's type.

```
[get{shapes}][call{star}][num{10}][num{10}]   the function star in shapes
[get{scores}][call(append)][num{40}]          the method append of list
[get{user}][call{greet}]                      AttributeError: dict has no method greet
```

A function held in a dict is called from a name.

```
[set{f}to][get{user}][getProp{greet}]
[call{f}]
```

### 6.3. Operators and precedence

```
*  /  %          binds tightest
+  -
>  <  >=  <=  ==  !=
not
and
or               binds loosest
```

Operators at the same level evaluate left to right.

```
[num{2}][+][num{3}][*][num{4}]        14
[num{10}][-][num{3}][-][num{2}]       5
```

A second comparison operator in the same expression, outside a group, is a `SyntaxError`. Group the comparisons and join them with `[and]`.

```
[get{a}][<][get{b}][<][get{c}]                                  SyntaxError
[(][get{a}][<][get{b}][)][and][(][get{b}][<][get{c}][)]         a < b and b < c
```

| Operator                  | Takes                                       |
| ------------------------- | ------------------------------------------- |
| `[+]`                     | two `num`s, or two `str`s, which it joins   |
| `[-]` `[*]` `[/]` `[%]`   | two `num`s                                  |
| `[<]` `[>]` `[<=]` `[>=]` | two `num`s, or two `str`s in alphabet order |
| `[==]` `[!=]`             | any two values                              |
| `[not]` `[and]` `[or]`    | any values                                  |

```
[str{score}][+][num{5}]               TypeError
[str{ab}][+][str{cd}]                 "abcd"
[num{-1}][%][num{500}]                499
[num{1}][/][num{0}]                   ZeroDivisionError
```

`[==]` compares numbers, strings, bools and colors by value, lists by their items, dicts by their attributes, and functions and modules by identity. Values of different types are not equal.

```
[num{1}][==][str{1}]                  false
```

`[if]`, `[not]`, `[and]` and `[or]` take any value. `0`, `""`, an empty list, `none` and `false` count as false; everything else counts as true. `[and]` and `[or]` stop as soon as the result is known, and give the value that decided it. `[not]` gives a `bool`.

```
[if][get{scores}]                     if scores is not empty
[get{name}][or][str{anon}]            name, or "anon" when name is ""
```

`[not]` negates the value to its right. It takes the place of a value and needs a value next, like `[(]`.

```
[if][not][get{done}]                  if not done
[not][get{a}][>][num{1}]              not (a > 1)
[not][get{a}][and][get{b}]            (not a) and b
```

### 6.4. Grouping

`[(]` and `[)]` make what is between them one value.

```
[(][num{2}][+][num{3}][)][*][num{4}]                            20
[(][get{a}][>][num{1}][)][and][(][get{b}][<][num{2}][)]         a > 1 and b < 2
[call(print)][(][num{2}][+][num{3}][)][*][num{4}]               print((2 + 3) * 4)
```

A group holds exactly one value.

```
[(][num{0}][num{500}][)]        SyntaxError
[(][)]                          SyntaxError
```

## 7. Simple statements

```
[set{width}to][num{500}]                       width = 500
[set{x}to][get{width}][/][num{2}]              x = width / 2
[call(p5.circle)][num{10}][num{10}][num{5}]    circle(10, 10, 5)
```

## 8. Compound statements

A block's body is indented. The bottom magnet of `[repeat]`, `[for{x}in]`, `[if]`, `[elif]` and `[else]` is inset, so the card that snaps below lands indented. `[dedent]` closes the block, in the column of the block's head.

```
[for{i}in][call(range)][num{100}]
  [call(p5.circle)][get{i}][num{10}][num{5}]
[dedent]

[if][get{score}][>][num{10}]
  [call(print)][str{you_win}]
[dedent]
```

A block's body may be empty. A block with no `[dedent]` closes at the end of its strip.

```
[if][get{ready}]
[dedent]                                does nothing
```

```
[define{f}]
[dedent]                                IndentationError: no block to close; skipped

[define{g}]
[set{x}to][num{1}]
  [call(print)][get{x}]                 IndentationError: skipped, with the lines indented under it
```

A block with a line after it in its head's column, and no `[dedent]` between them, is an `IndentationError` on its head. The block is skipped with its body, and the line after it runs.

```
[define{h}]
[if][get{a}]                            IndentationError: no [dedent]; skipped with its body
  [call(print)][get{a}]
[call(print)][str{done}]                runs

[define{j}]
[repeat][num{3}]                        IndentationError: no [dedent]; skipped with its body
  [if][get{a}]
    [call(print)][get{a}]
[call(print)][str{done}]                runs

[define{k}]
[repeat][num{3}]                        runs
  [if][get{a}]                          IndentationError: no [dedent]; skipped with its body
    [call(print)][get{a}]
  [call(print)][str{y}]                 runs
[dedent]

[define{m}]
[if][get{ready}]                        IndentationError: no [dedent]; skipped
[call(print)][str{done}]                runs
```

### 8.1. `[if]`, `[elif]` and `[else]`

`[if]` runs its body when its value counts as true. It takes one value.

`[elif]` and `[else]` continue the `[if]` in its column, where a `[dedent]` would snap. Each one closes the block above it and opens its own, and one `[dedent]` closes the whole chain. `[elif]` takes one value, as `[if]` does; `[else]` takes none. The first block whose value counts as true runs; if none does, the `[else]` block runs.

```
[if][get{score}][>][num{10}]            if score > 10:
  [call(print)][str{win}]
[elif][get{score}][>][num{5}]           elif score > 5:
  [call(print)][str{close}]
[else]                                  else:
  [call(print)][str{lose}]
[dedent]
```

A block of a chain may be empty.

```
[if][get{ready}]
[else]
  [call(print)][str{wait}]
[dedent]
```

An `[elif]` or `[else]` after a `[dedent]` or after a `[repeat]` or `[for{…}in]` body is a `SyntaxError`, and so is an `[elif]` after an `[else]`.

```
[if][get{a}]
  [call(print)][get{a}]
[dedent]
[else]                                  SyntaxError: no chain to continue

[repeat][num{3}]
  [call(print)][str{hi}]
[else]                                  SyntaxError: [repeat] has no [else]

[if][get{a}]
[else]
[elif][get{b}]                          SyntaxError: [elif] after [else]

[if][get{a}]                            IndentationError: no [dedent]; skipped with the rest of the chain
  [call(print)][str{a}]
[else]                                  skipped
  [call(print)][str{not_a}]
[call(print)][str{done}]                runs

[if][get{a}]                            IndentationError: no [dedent]; skipped with its body
  [call(print)][get{a}]
[call(print)][str{done}]                runs
[else]                                  SyntaxError: no chain to continue
```

### 8.2. Loops

`[repeat]` runs its body a number of times. It takes one value, a whole number.

```
[repeat][num{3}]                        for _ in range(3)
  [call(print)][str{hi}]                hi hi hi
[dedent]

[repeat][num{0}][num{3}]                SyntaxError
[repeat][num{2.5}]                      ValueError
```

`[for{…}in]` iterates a `list`. The handwritten name holds each item in turn.

```
[for{i}in][call(range)][num{3}]         for i in range(3)
  [call(print)][get{i}]                 0 1 2
[dedent]
```

### 8.3. Functions

`[define{…}]` does not indent its body, and can only appear at the top level. Its body runs to the next top-level declaration. It is hoisted, so its position on the table carries no meaning.

```
[define{greet}][required{message}][optional{title}][str{Mx}][optional{suffix}]
[call(print)][get{title}][+][str{_}][+][get{message}]

[call{greet}][str{Ada}]              title is "Mx", suffix is none
```

Required parameters come before optional ones. An optional parameter's default is one leaf card, read on each call. An optional parameter with no default is `none`.

```
[define{dot}][optional{size}][get{width}]

[define{blob}][optional{size}][num{1}][+][num{2}]    SyntaxError
```

`[return]` ends the function and gives the value to its right, or `none` with no value. A function that ends without `[return]` gives `none`.

```
[define{double}][required{n}]
[return][get{n}][*][num{2}]

[define{setup}]
[call(print)][call{double}][num{4}]         8
```

A call is checked against the declared parameters. Too few or too many values is a `TypeError`.

```
[call{greet}]                        TypeError: greet takes 1 to 3 values
```

In a text file, a doc comment can give the types of a function's parameters and result. The types are those of the Types table, and `|` means either.

```
/**
 * How far apart two points are.
 * @param {num} x1
 * @param {num} y1
 * @param {num} x2
 * @param {num} y2
 * @returns {num}
 */
[extern(dist)][required(x1)][required(y1)][required(x2)][required(y2)]

/**
 * Sets the color that shapes are filled with.
 * @param {color | str} c
 */
[extern(fill)][required(c)]
```

A parameter or result with no type can be any type. The result of a `[define{…}]` with no type comes from its `[return]`s.

## 9. Builtins

Builtins are used without a namespace. `pi` is a value; every other builtin is a function. These are all of them:

```
[call(print)][get{a}][get{b}]           any number of values
[call(range)][num{10}]                  a list: 0 1 2 … 9
[call(range)][num{0}][num{500}][num{25}] 0 25 50 … 475
[call(len)][get{scores}]                3, for a list or a str
[call(list)][num{1}][num{2}]            a list
[call(dict)]                            an empty dict
[call(abs)][num{-5}]                    5
[call(min)][num{3}][num{1}][num{2}]     1
[call(max)][get{scores}]                30, when scores holds 10 20 30
[call(round)][num{2.5}]                 3
[call(sqrt)][num{16}]                   4
[call(sin)][num{90}]                    1
[call(cos)][num{180}]                   -1
[call(random)]                          a num from 0 to 1
[call(random)][num{500}]                a num from 0 to 500
[call(random)][num{0}][num{500}]        a num from 0 to 500
[get(pi)]                               3.14159…
```

`[call(print)]` shows its values with a space between them.

| Value                                            | Shows as                         |
| ------------------------------------------------ | -------------------------------- |
| `[num{5}]`, `[num{2.5}]`, `[num{10}][/][num{4}]` | `5`, `2.5`, `2.5`                |
| `[num{0.1}][+][num{0.2}]`                        | `0.30000000000000004`            |
| `[str{hello_world}]`                             | `hello world`                    |
| `[bool(true)]`, `[none]`                         | `true`, `none`                   |
| `[color(gold)]`                                  | `gold`                           |
| a list                                           | `[1, 2, "a"]`                    |
| a dict                                           | `{message: "hi"}`                |
| a function, a module                             | `<function draw>`, `<module p5>` |

```
[call(print)][num{1}][str{a}][(][call(list)][str{a}][)]       1 a ["a"]
```

Python shows `True` and `None`, with capitals.

`[call(range)]` takes whole numbers and a step that is not 0.

```
[call(range)][num{0}][num{10}][num{0}]  ValueError
```

`[call(min)]` and `[call(max)]` take any number of values, or one list.

```
[call(min)]                             ValueError
[call(max)][call(list)]                 ValueError
```

`[call(round)]` takes one value and gives a whole number. A half rounds away from zero.

```
[call(round)][num{2.4}]                 2
[call(round)][num{-2.5}]                -3
```

```
[call(sqrt)][num{-1}]                   ValueError
```

`random` is declared three times, as `fill` is declared twice: with no values, with one, and with two. No values is the same as 0 and 1, and one value is the same as 0 and that value. The first end can come out and the second never does, so `[call(random)][num{500}]` never gives 500. The ends can be any nums, whole or not, in either order, and the result is not rounded.

```
[call(random)][num{2.5}]                a num from 0 to 2.5
[call(random)][num{-5}]                 a num from 0 down to -5
[call(random)][num{500}][num{0}]        a num from 500 down to 0
```

Every angle is in degrees, in the builtins and in every library.

```
[call(sin)][num{30}]                    0.5
```
