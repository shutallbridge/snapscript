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

**Core**:
The inner ring that slides into a frame and holds the magnets in their bores. One core serves every class of one length.

**Face**:
A plate that clips onto the core and covers one side of the base, under that side's sheet. A base has a **front face**, and a flip pair also a **back face**, matching its front and back sides. One face of each kind serves every class of one length.
_Avoid_: top face (top is an edge), side (a side is the printed face of a card)

**Tolerance**:
A gap that a builder sets to suit their printer, magnets and paper: how loosely parts slide together, how much room the sheet gets, and how loosely a magnet sits in its bore. Tolerances never change what snaps, so bases built with different tolerances from the same arrangement snap together.

**Sheet**:
The printed paper wrapped onto a side of a base, carrying that side's label and marker. It wraps rather than being taped, so it can't come off. The base comes with the language; the sheet comes with the card, such as a library card.
_Avoid_: sticker, label (a label is what the grammar demands of a contact)

**Flip pair**:
A card with a different card on each side, changed by flipping it over. Both sides take the same roles: `[num{…}]` / `[str{…}]`, `[bool(true)]` / `[bool(false)]`, `[color(…)]` / `[color(…)]` (two different colors, such as `[color(yellow)]` / `[color(purple)]`), `[+]` / `[-]`, `[*]` / `[/]`, `[<]` / `[>]`, `[<=]` / `[>=]`, `[==]` / `[!=]`, `[and]` / `[or]`. Every other card has one side, `[%]`, `[set{x}to]`, `[get{x}]`, `[define{f}]` and `[call{f}]` among them.

**Marker**:
The printed pattern on a card's side that the camera reads to learn which side it is, where it lies and how it is turned. A marker names a keyword (`[repeat]`), a handwritten kind and its length (`[get{…}]` at 3U), or a library card (`[call(p5.fill)]`); it does not name the physical card. Two `[get{x}]` cards of the same length carry the same marker and are told apart by where they lie.
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
A block head (`[if]`, `[repeat]`, `[for{x}in]`) with its body, indented one U to the right, closed by `[dedent]`.

**Strip**:
A free-standing group of lines that snap together, such as one function, and can be moved around the table as a whole.

## Libraries

**Library**:
A package of Snapscript modules that a program imports by its package name: `[import(snapscript-p5)as(p5)]`. The importing program chooses the name; a library does not namespace itself.

**Library card**:
A printed card that a library offers with a `@card` tag in a doc comment: `[call(p5.circle)]`, `[get(p5.frameCount)]`, or `[define(setup)]` for a function that the program defines. A handwritten card with the same text means the same thing, but shows none of the library card's help.

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

**Read error**:
The camera is not sure what a card's handwriting says. It is a mark the physical system puts on a card, not an error of the language: it has no kind and no stage, and a text file never has one.
_Avoid_: OCR error

**Skipped line**:
A line left out of a run because it has a structure or check error, or holds a card with a read error. It is lit up and the rest of its function runs. Skipping a block head skips its body; skipping a `[define{…}]` header skips its strip.
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

**Language version**:
One release of Snapscript: its language, its card classes and one magnet arrangement, found by the search when the release is made and then fixed. A builder prints every base from one version.
_Avoid_: release (on its own), arrangement version
