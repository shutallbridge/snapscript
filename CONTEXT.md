# Snapscript

A table-top block-based programming language: physical cards snap together with magnets to form a program, which a camera reads from above.

## Cards and programs

**Card**:
One physical piece that lies flat on the table and stands for one block of the program.

**Side**:
One printed face of a card. Most cards have one side; a flip pair has two.

**Flip pair**:
A card with a different card on each side, changed by flipping it over: `[set(x)to]` / `[get(x)]`, `[define(f)]` / `[call(f)]`, `[required(p)]` / `[optional(p)]`, `[setProp(p)to]` / `[getProp(p)]`, `[num(…)]` / `[str(…)]`, `[bool:true]` / `[bool:false]`.

**Printed / handwritten**:
A card's label is either printed on it (`[call:print]`) or written by hand on its whiteboard (`[call(print)]`); both mean the same thing.

**Value slot**:
A place on a card that takes a value from the cards to its right.
_Avoid_: slot (on its own), argument position

**Leaf**:
A card that holds a value and has no value slots: `[num(500)]`, `[get(x)]`, `[none]`.

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
A block head (`[if]`, `[repeat]`, `[for(x)in]`) with its body, indented one U to the right, closed by `[dedent]`.

**Strip**:
A free-standing group of lines that snap together, such as one function, and can be moved around the table as a whole.

## Magnets

**U**:
The unit of length on the table. Every card is 1U tall and a whole number of U long; an indent is 1U.

**Edge**:
One of a side's four edges: top, bottom, left, right.
_Avoid_: side edge (say "left/right edges")

**Pocket**:
A place on an edge that holds magnets or steel pieces.
_Avoid_: slot, magnet slot

**Layer**:
One of a pocket's two levels through the card's thickness: up (towards the ceiling) or down (towards the table).

**Pocket shape**:
How a pocket's two layers are filled: **uniform** (both layers the same and not empty: `N/N`, `F/F`), **half** (one layer empty: `-/N`) or **split** (two different pieces: `F/N`). A flip leaves a uniform pocket the same and changes the others.

**Magnet arrangement**:
The choice of pockets and their contents on every card.

**Flip direction**:
How every flip pair turns over: top-to-bottom (top and bottom edges change places) or left-to-right (left and right edges change places). One flip direction applies to a whole magnet arrangement.

**Contact**:
Two edges of two cards, each of a given length, facing each other at some offset. The same two sides at other lengths make other contacts, even when the same pockets face each other.
_Avoid_: joint

**Contact group**:
Contacts with the same geometry: the same two sides and edges, the same offset, the same pockets facing, and the same labels (unavoidable included). A report shows one contact group on one line, named by its smallest length pair, with the number of contacts it holds. Example: `[set(x)to] [num(…)] @0` is one contact group of 36 contacts, one for each pair of lengths from 1U×1U to 6U×6U.
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
A group of cards that have the same roles on every edge, so that they can have the same magnets: for example, all operator cards, or `[get:…]` and `[root]`.

**Connect**:
A contact between two cards that the grammar lets be neighbours there. It must snap.

**Forbid**:
A contact between two cards that the grammar does not let be neighbours there. It should not snap.

**Coexist**:
A contact between two cards that touch in a legal program without being neighbours. It must not repel. A contact can be coexist and forbid at the same time.

**Ungraded**:
The kind of a contact where a facing edge has the role `free`, which only standalone declarations have (`[import(…)]`, `[extern(…)]`, `[global(…)]`). The grammar demands nothing of it, and reports show it as info.

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
One must label (connect or coexist) on two sides and their facing edges at one offset, at every pair of card lengths. Example: `[set(x)to] [get(x)] @0: connect` is one requirement. It holds when all 36 of its contacts snap. The search names conflicts in requirements and counts must failures for each one.
_Avoid_: must contact (it is not one contact), must rule (grammar rules are the role-level rules in `rules.yaml`)

**Conflict**:
A set of requirements that cannot all hold at the same time. It proves that no valid magnet arrangement exists. The search names one such set; it is not always the smallest. Example: a 1U line head that must connect to the next line at −1, 0 and +1. On a 1U card, the three pockets would collide.

**Partner contact**:
For a contact between two flip pairs, the contact between their other sides where the same pockets face each other, so it always does the same thing. Which contact it is depends on the flip direction.
_Avoid_: partner (on its own), flip partner

**Unavoidable**:
Said of a forbid contact whose partner contact is a connect. It snaps whenever its partner contact snaps, so a valid magnet arrangement always has the leak. Every other forbid is **avoidable**.

## Search

**Objective**:
The number that the search makes as small as possible for a valid arrangement. Each avoidable forbid contact adds a cost for its priority and its grade. A leak costs the most, and a low forbid costs nothing. Each pocket adds a small cost for its shape, so that, of two arrangements that are otherwise equal, the search chooses the simpler one. The priority weights are data in `rules.yaml`; the grade and shape costs are in `solver.py`.
_Avoid_: score

**Bound**:
The smallest objective that the search has not yet ruled out. When the objective equals the bound, the arrangement is proven the best.

**Search status**:
How far to trust a search result: **optimal** (proven the best), **feasible** (valid, but not proven the best when the time limit came), **infeasible** (proven that no valid arrangement exists) or **unknown** (the time limit came before any result).

**Pinned arrangement**:
An arrangement given to the search to keep. The search keeps every edge it mentions exactly, empty edges too, and designs the rest.
