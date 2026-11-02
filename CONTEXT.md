# Snapscript

A table-top block-based programming language: physical cards snap together with magnets to form a program, which a camera reads from above.

## Cards and programs

**Card**:
One physical piece that lies flat on the table and stands for one block of the program.

**Side**:
One printed face of a card. Most cards have one side; a flip pair has two.

**Base**:
The 3D-printed body of a card that holds its magnets. A flip pair has a double-sided base and every other card a single-sided one; apart from that, every card of one class and length has the same base, whether it is printed or handwritten. A base is printed in parts: a frame, a core and its faces.
_Avoid_: block (a block is part of a program), body

**Frame**:
The outer ring of a base, as long as the card, with a bore for each magnet. It is the only part that depends on the magnet arrangement, so each class and length has its own. A single-sided frame has its back built in.

**ID beam**:
A beam across the back of a frame whose marks show its class ID in 5 bits, so frames that look alike can be told apart. Cores and faces have none: they serve every class.

**Assembly page**:
The page that comes with a set of bases. An instructor copies a frame's ID beam into it and picks a length, and it shows which pockets of that frame get a magnet and which pole faces out. It tells the orientation; it doesn't teach assembly or how to find a magnet's pole.
_Avoid_: assembly guide, placement guide, walkthrough

**Core**:
The inner ring that slides into a frame and holds the magnets in their bores. One core serves every class of one length.

**Face**:
A plate that clips onto the core and covers one side of the base, under that side's sheet. A base has a **front face**, and a flip pair also a **back face**, matching its front and back sides. One face of each kind serves every class of one length.
_Avoid_: top face (top is an edge), side (a side is the printed face of a card)

**Tolerance**:
A gap that an instructor sets to suit their printer, magnets and paper: how loosely parts slide together, how much room the sheet gets, and how loosely a magnet sits in its bore. Tolerances never change what snaps, so bases built with different tolerances from the same arrangement snap together.

**Sheet**:
The printed paper wrapped onto a side of a base, carrying that side's label and marker. It wraps rather than being taped, so it can't come off. The base comes with the language; the sheet comes with the card, such as a library card.
_Avoid_: sticker, label (a label is what the grammar demands of a contact)

**Marker zone**:
The white square at the left end of a sheet, 17 mm wide, with the side's marker in its center.

**Stripe**:
The narrow band, 1.5 mm, between the marker zone and the rest of the sheet, where the card's color starts. It is a darker shade of that color.

**Whiteboard**:
The white area on a handwritten card's sheet where the label is written by hand, at least 2U long: `set` ▢ `to`.

**Paper tab**:
A flap on each edge of a sheet that folds under the face plate and holds the sheet on the base: 8 mm at the ends, 5 mm on the top and bottom.

**Flip pair**:
A card with a different card on each side, changed by flipping it over. Both sides take the same roles: `[num{…}]` / `[str{…}]`, `[bool(true)]` / `[bool(false)]`, `[color(…)]` / `[color(…)]` (two different colors, such as `[color(yellow)]` / `[color(purple)]`), `[+]` / `[-]`, `[*]` / `[/]`, `[<]` / `[>]`, `[<=]` / `[>=]`, `[==]` / `[!=]`, `[and]` / `[or]`. Every other card has one side, `[%]`, `[set{x}to]`, `[get{x}]`, `[define{f}]` and `[call{f}]` among them.

**Marker**:
The printed pattern on a card's side that the camera reads to learn which side it is, where it lies and how it is turned. A marker names a keyword (`[repeat]`), a handwritten kind and its length (`[get{…}]` at 4U), or a library card (`[call(p5.fill)]`); it does not name the physical card. Two `[get{x}]` cards of the same length carry the same marker and are told apart by where they lie.
_Avoid_: fiducial, tag, code

**Printed / handwritten**:
A card's label is either printed on it (`[call(print)]`) or written by hand on its whiteboard (`[call{print}]`); both mean the same thing. In text, `{}` holds handwriting and `()` holds everything else, including text that is only ever typed in a file, such as `[import(snapscript-p5)as(p5)]`.

**Value slot**:
A place on a card that takes a value from the cards to its right.
_Avoid_: slot (on its own), argument position

**Leaf**:
A card that holds a value and has no value slots: `[num{500}]`, `[get{x}]`, `[none]`.

**Line**:
Cards that sit side by side, left to right; one line of program text.
_Avoid_: row

**Line head**:
The first card of a line.
_Avoid_: head (on its own)

**Inline card**:
Any card in a line after its line head.

**Column**:
The vertical run of line heads, one under the other.

**Block**:
A block head (`[if]`, `[elif]`, `[else]`, `[repeat]`, `[for{x}in]`) with its body, indented one U to the right, closed by `[dedent]`, or by the `[elif]` or `[else]` that continues its chain.

**Chain**:
An `[if]` block and the `[elif]` and `[else]` blocks that follow it in its column. Each `[elif]` or `[else]` closes the block above it and opens its own; one `[dedent]` closes the whole chain.
_Avoid_: if statement, branch (a branch is one block of a chain)

**Strip**:
A free-standing group of lines that snap together, such as one function, and can be moved around the table as a whole.

**Detached card**:
A card that is not part of the program: not connected to a `[define]` or an `[on(…)]`, and not one of the cards that stand alone (`[import(…)as(…)]`, `[extern(…)]`, `[global{…}]`). It is not checked and has no errors. The table shows its line like a skipped line.
_Avoid_: loose card, orphan

## Libraries

**Library**:
A package of Snapscript modules that a program imports by its package name: `[import(snapscript-p5)as(p5)]`. The importing program chooses the name; a library does not namespace itself.

**Library card**:
A printed card that a library offers with a `@card` tag in a doc comment: `[call(p5.circle)]`, `[get(p5.frameCount)]`, or `[define(setup)]` for a function that the program defines. A handwritten card with the same text means the same thing, but shows none of the library card's help.

**Native module**:
The JavaScript beside a library's `.snap` file, with the same name (`p5.js` beside `p5.snap`), that does the work of its `[extern(…)]`s: one function for each name, however many times it is declared.
_Avoid_: binding, wrapper, FFI

**Builtin**:
A name that every file has without an import: functions such as `[call(print)]` and `[call(sin)]`, and the value `[get(pi)]`. A local or a top-level declaration with the same name hides it.

**Function color**:
Which of four colors a function card is printed in: action (violet: `[call(p5.circle)]`), action 2 (fuchsia: `[call(p5.translate)]`), helper (sky: `[call(random)]`) or setting (rose: `[call(p5.fill)]`). Variable cards such as `[get(p5.width)]` are orange instead.
_Avoid_: role (a role is what an edge needs from the edge that faces it)

**Prelude**:
Text that the system puts at the start of every table program, such as `[import(snapscript-p5)as(p5)]`. Nobody lays it on the table.

**Official registry**:
An endorsed list that gives popular libraries their marker IDs, so that library cards printed for one project read the same in another. A project may assign IDs differently.

**Lockfile**:
A project's list of which marker ID stands for which library card, such as `1293 = call snapscript-p5.circle`. The camera reads library cards through it.

## Errors

**Error kind**:
What went wrong, named as in Python: `SyntaxError`, `NameError`, `TypeError` and so on. A kind is a built-in type, like `list`.
_Avoid_: error type (say "kind"), error class

**Stage**:
When an error is found: **structure** (cards that cannot form a program), **check** (found before running, by looking at names and types) or **runtime** (found while running). The same kind can be found at the check stage or at runtime.
_Avoid_: layer (a layer is a level of a magnet pocket), phase

**Table error**:
An error that belongs to the table, not the language: a read error, a connection error, a mismatch, a frozen sketch or a library error. It has no kind and no stage, a text file never has one, and it never goes into a `.snap` file. The table shows it like any other error.

**Read error**:
A table error: the camera is not sure what a card's handwriting says. The card's line is skipped.
_Avoid_: OCR error

**Connection error**:
A table error: a card's handwriting cannot be read because the table cannot reach the handwriting reader. The card's line is skipped at once, and the card is read as soon as the reader can be reached again.
_Avoid_: offline error, network error

**Frozen sketch**:
A table error: the sketch has not finished a frame, or its `[on(load)]`, for about 3 s, such as inside `[repeat][num{1000000000}]`. The table stops the run, lights the card it was stuck at and says so in the status bar. The next change to the program starts a new run.
_Avoid_: timeout, hang

**Library error**:
A table error: a library's own code broke, not the program. The card that called it is lit, such as `[call(p5.circle)]`, with "snapscript-p5 broke inside circle: …", and the run stops. A library that blames the program raises an error of a kind instead, which is a runtime error.
_Avoid_: crash, internal error

**Not read yet**:
A handwritten card whose text has not arrived. It is not an error: the program keeps running as it was until the text arrives, for up to about 5 s, and then its line is skipped until it does. A rewritten card is not read yet again.
_Avoid_: pending, loading

**Mismatch**:
A table error: a real card lies in a guide card's place but is not the card the guide asks for, such as `[color(gold)]` where a textbook page's guide shows `[num{500}]`. The card still counts and runs.
_Avoid_: wrong card

**Skipped line**:
A line left out of a run because it has a structure or check error, or holds a card with a read error, a connection error, or one still not read yet after the wait. Its gutter marks it, and the rest of its function runs. Skipping a block head skips its body, and in a chain, every later block of the chain too; skipping a `[define{…}]` header skips its strip.
_Avoid_: ignored line, disabled line

**Follow-on error**:
A check error that happens only because another line was skipped, such as a `NameError` on `[get{x}]` when the `[set{x}to]` line is skipped. It names the skipped line.

## Magnets

**U**:
The unit of length on the table. Every card is 1U tall and a whole number of U long; an indent is 1U. Most cards are at least 2U long, because their written text needs it.

**Edge**:
One of a side's four edges: top, bottom, left, right.
_Avoid_: side edge (say "left/right edges")

**Pocket**:
A place on an edge that holds one or two magnets.
_Avoid_: slot, magnet slot

**Position**:
A place on an edge where a pocket can sit. Every 1U cell has the same three positions, ⅙, ½ and ⅚ U into it, spread evenly, so neighbouring pockets are as far apart across a cell boundary as within one (⅓ U). Positions are written as exact fractions: `1/6`, `1/2`, `5/6`, and `7/6`, `3/2`, `11/6` in a 2U reach.

**Pocket reach**:
How far a top or bottom pocket may sit from its end of the card: less than the reach, measured from the left or the right end. Most card classes reach 1U, so a pocket sits ⅙, ½ or ⅚ U from an end; block heads and `[dedent]` reach 2U, for the indent pocket. It keeps the pockets near the ends, and the search small.

**Layer**:
One of a pocket's two levels through the card's thickness: up (towards the ceiling) or down (towards the table).

**Magnet**:
What fills one layer of a pocket: half the card's thickness, its `N` or `S` pole facing out of the edge. A uniform pocket is two magnets stacked. Pockets hold magnets only, no steel.

**Pocket shape**:
How a pocket's two layers are filled: **uniform** (two magnets stacked with the same pole: `N/N`, `S/S`), **half** (one magnet, one layer empty: `-/N`) or **split** (two magnets with different poles: `S/N`). A flip leaves a uniform pocket the same and changes the others.

**Magnet arrangement**:
The choice of pockets and their contents on every card.

**Flip direction**:
How every flip pair turns over: top-to-bottom (top and bottom edges change places) or left-to-right (left and right edges change places). One flip direction applies to a whole magnet arrangement. Snapscript's flip pairs turn top-to-bottom; the magnets tool can check and search both.

**Contact**:
Two edges of two cards, each of a given length, facing each other at some offset. The same two sides at other lengths make other contacts, even when the same pockets face each other.
_Avoid_: joint

**Contact group**:
Contacts with the same geometry: the same two sides and edges, the same offset, the same pockets facing, and the same labels (unavoidable included). A report shows one contact group on one line, named by its smallest length pair, with the number of contacts it holds. Example: `[set{x}to] [num{…}] @0` is one contact group of 25 contacts, one for each pair of lengths from 2U×2U to 6U×6U.
_Avoid_: row, summary row, collapsed contact

**Offset**:
How far the second card of a contact is moved from the first, in U: down, for left/right edges; to the right, for top/bottom edges. On top/bottom edges, +1 is an indent and −1 an outdent.

**Meaningful offset**:
An offset where a legal program can put two cards as neighbours: 0 for left/right edges; 0, +1 and −1 for top/bottom edges. A forbid at any other offset is low.

**Snap / repel / mixed / nothing**:
What a contact does: its magnets only pull the cards together, only push them apart, do both, or do neither.

## Grammar and grading

**Role**:
What one edge of a side needs from the edge that faces it. For example, `head` on a left edge means that nothing may be on its left.

**Card class**:
A group of cards that have the same roles on every edge, so that they can have the same magnets: for example, the operator cards but `[%]`, or `[get{…}]` and `[root]`. A printed card and the same card handwritten are in the same class: `[call(p5.circle)]` and `[call{f}]`. A class also has a shortest length, 2U for every class, and a pocket reach.

**Class ID**:
A card class's number, shown by the ID beam on its frames. Each language version sets it.
_Avoid_: class number

**Connect**:
A contact between two cards that the grammar lets be neighbours there. It must snap.

**Forbid**:
A contact between two cards that the grammar does not let be neighbours there. It should not snap.

**Coexist**:
A contact between two cards that touch in a legal program without being neighbours. It must not repel. A contact can be coexist and forbid at the same time.

**Ungraded**:
The kind of a contact where a facing edge has the role `free`, which only standalone declarations have (`[import(…)]`, `[extern(…)]`, `[global{…}]`). The grammar demands nothing of it, and reports show it as info.

**Priority**:
How much a contact's demand counts: **must** for connect and coexist; **should**, **nice** or **low** for forbid. A low forbid is reported but costs nothing.

**Label**:
What the grammar demands of a contact: its kind (connect, forbid, coexist or ungraded) and its priority, with the grade it gets. A contact can have two labels: coexist and forbid.

**Grade**:
How well a contact meets its label. Connect and coexist: pass or FAIL. Forbid, from worst to best: **leak** (snap), **partial** (mixed), **weak** (nothing), **strong** (repel). Ungraded: info.

**Leak**:
A forbid contact that snaps.

**Must failure**:
A connect contact that does not snap, or a coexist contact that repels or is mixed.

**Valid**:
Said of a magnet arrangement with no must failures.

**Requirement**:
One must label (connect or coexist) on two sides and their facing edges at one offset, at every pair of card lengths. Example: `[set{x}to] [get{x}] @0: connect` is one requirement. It holds when all 25 of its contacts snap. The search names conflicts in requirements and counts must failures for each one.
_Avoid_: must contact (it is not one contact), must rule (grammar rules are the role-level rules in `rules.yaml`)

**Conflict**:
A set of requirements that cannot all hold at the same time. It proves that no valid magnet arrangement exists. The search names one such set; it is not always the smallest. Example: if a line head could be 1U long, it would need to connect to the next line at −1, 0 and +1, and on a 1U card the three pockets would collide. (No card is 1U; the example is made up.)

**Partner contact**:
For a contact between two flip pairs, the contact between their other sides where the same pockets face each other, so it always does the same thing. Which contact it is depends on the flip direction.
_Avoid_: partner (on its own), flip partner

**Unavoidable**:
Said of a forbid contact whose partner contact is a connect. It snaps whenever its partner contact snaps, so a valid magnet arrangement always has the leak. Every other forbid is **avoidable**. Only a flip pair whose sides take different roles makes one, so Snapscript's cards have none.

## Search

**Objective**:
The number that the search makes as small as possible for a valid arrangement. Each avoidable forbid contact adds a cost for its priority and its grade. A leak costs the most, and a low forbid costs nothing. Each magnet adds a small cost, so that, of two arrangements that are otherwise equal, the search chooses the one with fewer magnets: a half pocket costs one magnet, a uniform or split pocket two. The grade costs depend on the **search goal**. The priority weights are data in `rules.yaml`; the grade and magnet costs are in `solver.py`.
_Avoid_: score

**Search goal**:
What the search tries to make a forbid do. **no snap** (the default): "nothing" is enough, so a weak forbid costs nothing, and the search adds magnets only where a contact needs them. **repel**: the illegal neighbours must not snap, and the search also tries to push them apart, so a weak forbid still costs a little; it needs about twice the magnets. The goal is an option of one search run, not part of the arrangement: `check` grades the same way for both. Two objectives found with different goals can't be compared.

**Bound**:
The smallest objective that the search has not yet ruled out. When the objective equals the bound, the arrangement is proven the best.

**Search status**:
How far to trust a search result: **optimal** (proven the best), **feasible** (valid, but not proven the best when the time limit came), **infeasible** (proven that no valid arrangement exists) or **unknown** (the time limit came before any result).

**Pinned arrangement**:
An arrangement given to the search to keep. The search keeps every edge it mentions exactly, empty edges too, and designs the rest.

## Releases

**Language reference**:
The document that defines the language and its text notation. A language version locks it.
_Avoid_: spec, overview spec

**Language version**:
One release of Snapscript: its language, its card classes and one magnet arrangement, found by the search when the release is made and then fixed. An instructor prints every base from one version.
_Avoid_: release (on its own), arrangement version

## The table

**Instructor**:
The person who sets up a table: prints and assembles the bases and sheets, and sets up libraries.
_Avoid_: builder

**Instructor tool**:
What the instructor runs on their own computer to set up a table: libraries, bases, assembly pages and sheets. It never talks to the table app.

**Table app**:
The program on the table's computer whose screen is projected onto the table. It joins the vision service to the language: it keeps the table program, checks and runs it, and draws the sketch, errors, read-back text and virtual cards. People use it only through the cards and its settings menu.
_Avoid_: IDE, desk app

**Vision service**:
The part of the table that watches the camera and reports which cards lie where and what their handwriting says. It knows card kinds, never lines or grammar.

**Track**:
One physical card as the vision service follows it over time. A card under a hand keeps its track for a moment; a card's handwriting is read again only when its track's image changes.

**Table state**:
Every track on the table at one moment, with its marker, where it lies, how it is turned, and the state of its handwriting. The vision service sends a new one whenever something changes.

**Table reader**:
What turns a table state into program text, and program text back into the cards it needs. Errors that only the camera makes, such as a read error, never enter the text.

**Buffer**:
The table program's text as the table app holds it now, rewritten whenever the table changes. It holds where each strip lies, in `@table` tags, but a change to those alone does not restart the sketch. A `.snap` file is what the buffer is saved as; detached cards are left out of it.

**Virtual card**:
A card the projector draws where a real card is not. It is a stand-in card or a guide card, and it disappears when a real card is laid in its place.
_Avoid_: virtual block, ghost card

**Stand-in card**:
A virtual card that is part of the program: it counts in the buffer and runs, such as a card of a program opened from a `.snap` file. Any real card laid in its place replaces it, as an edit.

**Guide card**:
A virtual card that only suggests: a textbook page's cards, or the values a call card expects after it. The right card laid in its place replaces it; any other card still counts, as a mismatch.

**Gutter**:
The space left of a line's first card where the table marks the line: a green dot on a strip's head, a crossed-out grey dot on a skipped or detached line, a white spinner on a line whose card is not read yet, a yellow `!` dot on a line skipped for a connection error, and a numbered badge (E1, E2, …) for each error. Nothing is drawn right of a line, where the next card would be laid.

**Status bar**:
A bar of text along the top or bottom edge of the table. The errors bar holds each error's full message beside its badge.

**Read-back**:
What the handwriting reader saw, drawn on the card's whiteboard. It shows for a moment after each new read, always as a debug view, and on a card with a `NameError` and the cards that define the name it suggests.

**Window**:
A region of the table that owns the markers in it and what is drawn there. A card belongs to the window its marker is in, even if its tail reaches into the next one.

**Coding space**:
The window where cards are laid and their feedback is drawn, on the left by default. Only cards whose marker is in it count.

**Canvas space**:
The window where the sketch runs. A card whose marker is in it is ignored.

**Full screen**:
The canvas space shown over the whole table. The windows keep their places, so cards still count by where the coding space would be.

**Corner**:
A fixed quarter circle in a corner of the table that takes an action when a card is laid in it. The help corner, bottom-left, shows the card's doc comment.
_Avoid_: help spot, hot corner

**Settings menu**:
The table app's menu for whoever runs the table, opened from a keyboard. It holds the table's settings, including calibration.
