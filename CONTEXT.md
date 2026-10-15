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
Cards connected left to right; one line of program text.
_Avoid_: row

**Line head**:
The first card of a line.
_Avoid_: head (on its own)

**Inline card**:
Any card in a line after its line head.

**Column**:
The vertical run of line heads, connected top to bottom.

**Block**:
A block head (`[if]`, `[repeat]`, `[for(x)in]`) with its body, indented one U to the right, closed by `[dedent]`.

**Strip**:
A free-standing group of connected lines, such as one function, that can be moved around the table as a whole.

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

**Contact**:
Two edges of two cards facing each other at some offset.
_Avoid_: joint

**Snap / repel**:
What a contact does: its magnets pull the cards together, or push them apart.
