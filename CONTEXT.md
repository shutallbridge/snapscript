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

**Magnet arrangement**:
The choice of pockets and their contents on every card.

**Flip direction**:
How every flip pair turns over: top-to-bottom (top and bottom edges change places) or left-to-right (left and right edges change places). One flip direction applies to a whole magnet arrangement.

**Contact**:
Two edges of two cards, each of a given length, facing each other at some offset. The same two sides at other lengths make other contacts, even when the same pockets face each other.
_Avoid_: joint

**Offset**:
How far the second card of a contact is moved from the first, in U: down, for left/right edges; to the right, for top/bottom edges. On top/bottom edges, +1 is an indent and −1 an outdent.

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

**Priority**:
How much a contact's demand counts: **must** for connect and coexist; **should**, **nice** or **low** for forbid. A low forbid is reported but never scored.

**Leak**:
A forbid contact that snaps.

**Must failure**:
A connect contact that does not snap, or a coexist contact that repels or is mixed.

**Valid**:
Said of a magnet arrangement with no must failures.

**Partner contact**:
For a contact between two flip pairs, the contact between their other sides where the same pockets face each other, so it always does the same thing. Which contact it is depends on the flip direction.
_Avoid_: partner (on its own), flip partner

**Unavoidable**:
Said of a forbid contact whose partner contact is a connect. It snaps whenever its partner contact snaps, so a valid magnet arrangement always has the leak.
