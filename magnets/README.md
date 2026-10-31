# magnets

Checker and CP-SAT solver for the Snapscript magnet arrangement (see issue
#10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run magnets search --flip top_bottom --classes simple_head,get,literal --time-limit 30
uv run magnets search --flip top_bottom --pin example   # keep the example's simple_head, get and literal design
uv run magnets search --flip left_right --goal repel    # also push illegal neighbours apart
uv run magnets print example         # every bundled program's cards, to cut and fold
uv run magnets print example --program nested_blocks --seed 3   # at the lengths of programs.txt's draw 3
uv run magnets print example --program my_program.txt --unit 30 --paper letter
uv run magnets bases example         # a printable base for each class and length, and the assembly page
uv run magnets bases example --classes get,literal --max-length 3 --magnet-clearance 0.25 --step
uv run pytest
```

`check` writes `summary.txt`, `contacts.csv` and `programs.txt` to
`out/<arrangement>/`. A contact is two edges of two cards at given lengths,
facing at some offset. Contacts with the same geometry and labels make one
contact group, named by its smallest length pair, with a `count` of the
contacts it holds; under `left_right` a geometry can split into two contact
groups. `contacts.csv` has one row per contact group and label, leaving out
those where no pockets line up, unless the label is connect.
`summary.txt` counts the pockets of every front by shape, and their
magnets (`Pockets: 61 (uniform 11, half 49, split 1), 73 magnets`; a flip
pair's back shares its front's), and both kinds of count: contact groups
by kind and result, then contacts (the sum of `count`), where a contact
with two labels counts once under each. It lists must failures and should and nice leaks. `programs.txt`
lays each bundled test program (`src/magnets/data/programs.yaml`) out on
the table, once at minimum card lengths and 20 times at seeded random
lengths, and reports a legal program's PASS or FAIL and the magnets its
cards hold (`nested_blocks (legal): PASS, 80 magnets`, to size a kit by),
with the contacts that fail, or every forbid contact of an illegal program
with its grade.
An arrangement's `flip` is `top_bottom` (the default) or `left_right`. A
flip pair's back is derived from its front, so a forbid contact whose
partner contact is a connect can never be blocked; it is flagged
`unavoidable` and listed apart from the avoidable leaks. Unavoidable low
leaks are only counted; `contacts.csv` lists them. The bundled flip pairs
take the same roles on both sides, so under either flip a partner contact
has its contact's verdict and nothing is unavoidable (ADR 0003); class
data with flip pairs whose sides differ, as in the tests, has unavoidable
leaks.
Card classes (`classes.yaml`), grammar rules (`rules.yaml`) and bundled
arrangements live in `src/magnets/data/`. A class has a `min_length`, its
shortest card (2U for every class for now; a class can be set to 1U), and a
`pocket_reach`: a top or bottom pocket sits less than the reach from its end
(1U, or 2U on block heads and `[dedent]`). Each class also has an `id`, its
**class ID** (see `CONTEXT.md`): a whole number from 0 to 31, so it fits 5
bits, unique to the class. It is shown on the class's printed frames, so it
stays with the class wherever the class sits in the file; changing it makes
frames already printed read as another class. Each language version sets
the IDs. Loading the classes stops with an error for a class with no ID,
one outside 0–31, or two classes sharing one. Contacts, program checks and the
print sheet use the lengths; the search tries every pocket position within
the reach. The public API is `magnets.check`,
`magnets.check_program` (a program text in spec notation) and
`magnets.solve`; pass `class_data=` or `rule_data=` to check against other
class or rule data.
A card text resolves to a class side through the side's member notation:
`{…}` stands for handwriting and `(…)` for printed or typed text, and a
card matches whichever bracket it uses, so `[get{x}]` matches both
`[get{score}]` and `[get(p5.frameCount)]`. It must match exactly one
class; a text that matches both sides of a flip pair, as every color
matches both `[color(…)]` sides, resolves to the front.

`search` looks for the arrangement with no must failures and the least
weighted forbid grades (a should-leak costs 10 per contact, a nice-leak 1),
then the fewest magnets (0.01 each: a half pocket holds one, a uniform or
split pocket two). `--goal` says what a forbid must achieve: `no_snap` (the
default) is satisfied with "nothing", so a weak forbid costs nothing and
magnets go only where a contact needs them; `repel` makes illegal
neighbours not snap and also tries to push them apart, so a weak forbid
costs 0.2 of a leak, and needs about twice the magnets. Objectives found
with different goals can't be compared; `check` grades the same way for
both. It writes the arrangement to `out/search_<flip>_<goal>.yaml` (or `--out`), e.g.
`out/search_top_bottom_no_snap.yaml`, and its checker reports next to it in
`out/search_<flip>_<goal>/`; the summary's first search line gives the goal,
the status (optimal, feasible, infeasible or unknown), objective, bound and
time (`Search (goal no_snap): optimal, objective 6108.35, bound 6108.35, in
3.2s`), and the arrangement's YAML header repeats it. `--classes` restricts the
search to some card classes, and `magnets check --classes` checks the result
the same way; the bundled programs need every class, so `programs.txt` is
only written for a full check. With `--workers 1` the time limit is CP-SAT's
deterministic time, so a `--seed` repeats its result exactly.
Left/right edges never face top/bottom edges, so the two halves are solved
as independent models that share the time limit. Unavoidable leaks cost
nothing, since no arrangement can block them.
`--pin <arrangement>` keeps every edge that arrangement mentions exactly as
it is, empty ones too (`right: []`), and designs the rest; its flip must
match `--flip`. If no valid arrangement exists, the search says
`infeasible`, names a set of requirements that conflict (enough to prove
it, not always the smallest), and writes the arrangement with the fewest
must failures instead.

`magnets print <arrangement>` makes a paper prototype of programs' cards,
to check an arrangement's contacts by eye without magnets. The arrangement
(a file or a bundled name, as for `check`) says where the pockets go; the
programs which cards to print. With no `--program` it prints every
bundled program, one after another; `--program <name>` prints one of
them, and `--program <file>` a program file in spec notation (a name is
tried as a bundled program when it isn't a file; an unknown one exits 2
and lists the bundled names). It writes one HTML file of SVG pages,
`out/<arrangement>/cards.html` (or `--out`), to print at 100%. Each
program starts on a new page, under its name and text; `illegal`'s cards
are headed "these neighbours should not snap", since building it checks
that its forbids don't snap. Then come its cards, every card once, in
program order. Every card is at its minimum length, unless `--seed N`
prints each at its length in `check`'s "draw N" layout in `programs.txt`
(seed 0, up to `--max-length`, 6 by default), drawn per card, so two
`call` cards can differ; that way a failure in `programs.txt` can be
laid out on the table. Every page's first line names its program and the
lengths it used: `nested_blocks (min lengths)` or `nested_blocks (draw 3,
seed 0)`. `--paper` is `a4` (the default) or
`letter`; nothing prints within 10 mm of the page's edge. The pieces are
packed to cut out with few cuts: every piece is 2U tall, so each row is a
2U strip of pieces butted end to end and rows sit edge to edge, so one cut
separates two neighbours, and the only waste is at the end of each row and
page. A piece never breaks across pages. Every page has a 50 mm ruler at
its foot: if it doesn't measure 50 mm, the printer scaled the page.

A piece is the class's front over its back, sharing a dashed fold line;
cut it out and fold it, and every pocket's two faces line up. Under
`top_bottom` the back is upright and the fold is marked `↕`; under
`left_right` it is rotated 180° and marked `↔`. The front is always on
top, so a `[str{hi}]` prints as `[num{hi}]` over `[str{hi}]`, the
handwriting carried over, and a `[/]` as `[*]` over `[/]`: a flip pair's
sides list their members in the same order, and each card holds the
members at the same place. Printed text isn't carried over: a
`[color(yellow)]`'s back reads `[color(…)]`, a color the kit picks, and
a `[num(0)]`'s `[str(…)]`. A
card that is not a flip pair, such as `[get{x}]`, gets an unlabelled
back. Each pocket is a tick in from its
edge with the layer nearest that face: `N` red, `S` blue, `–`
empty. Ticks and letters stay inside their own panel, so neighbours
sharing a cut line keep their pockets apart. `--unit` is the size of a U
in mm (30 by default), a print option, not a spec value. The API is
`magnets.card_sheet` (`draw=N` for `--seed N`), which returns the pages,
pieces, panels, marks and ruler in mm. It exits 2 for an invalid
arrangement, a missing program file, an unknown program name, a card that
matches no class side, or a card too long for the page at `--unit`; that
error names the card and the largest unit that fits.

`magnets bases <arrangement>` builds the printed parts of the cards'
bases, for a builder to print with their own tolerances (see `CONTEXT.md`
for **frame**, **core** and **face**). Only the frame depends on the
arrangement, so each card class and length has its own: it writes
`frames/<id>-<class>-<n>u.stl` for every class the arrangement names, from the
class's `min_length` up to `--max-length` (6 by default). The core and
faces serve every class of one length, so it writes `shared/core-<n>u.stl`
and `shared/front-face-<n>u.stl` once for every length in the run, and
`shared/back-face-<n>u.stl` for every length of a flip pair in it (none if
the run has no flip pair). All of it goes to `out/<arrangement>/bases/`
(or `--out`); `--classes` builds only those classes, named or not. A
frame's file starts with its class ID, two digits, as in
`frames/01-get-2u.stl`, so a printed frame can be matched to its file; a
class built alone with `--classes` keeps its ID. Each
STL is in mm and ready to print, laid flat on z = 0: a frame on its
front or its built-in back, a core flat, and a face on its plate with its
legs up. With `--step` it also writes `assembled/<id>-<class>-<n>u.step`, each
card's base put together to inspect in CAD: its frame, core and front
face, and a back face for a flip pair, each labelled by its kind. It
also writes `assembly.html`, the **assembly page** (below). Nothing else
is written: no manifest and no config file.

A frame has a bore for each magnet of its class's front, one per filled
layer, so a half pocket has one bore, a uniform or split pocket two and an
empty position solid wall. A flip pair's frame is double-sided; every
other class's is single-sided, with its back and the pads under the core
built in. The core slides into the frame and holds the magnets in. It has
a cross-bar near each end, with windows the face legs hook through at a
45° catch (the front face's two per end, 6 mm either side of the card's
centre line, and the back face's one), and from 4U up a centre rib with no
windows, which nothing hooks and which holds the faces up when pressed.

Every frame has an **ID beam** (see `CONTEXT.md`) across its back,
from one long wall to the other, 20 mm from the left end, between the 2nd
and 3rd pockets: 3.2 mm along the card and 2 mm thick. Frames of the same
length look alike, since only their bores differ, so the beam shows the
frame's class ID in 5 bits. On its top, towards the front, stand marks
0.8 mm wide and 1 mm tall: a baseline along its edge nearest the left end,
and 6 cross ridges that split it into 5 cells, each about 3.2 × 2.4 mm. A
1 is one `/` stroke from corner to corner of its cell, and a 0 an empty
cell, so ID 0 reads `00000`. To read it, hold the frame with its back down
with its left end toward you, so the baseline is nearest you, and read
left to right through the core's opening: bit 1 is the most significant,
at the top-edge end. `get` (ID 1) reads `00001` and `color` (ID 10)
`01010`. A single-sided frame's beam is joined to its back through the
sheet gap. The core has a notch over the beam in both long walls, the
beam's size + the slide clearance all round, 20 mm from each end, so it
goes in either way round and still covers every magnet; the marks stay a
slide clearance clear of its inner walls. Cores and faces have no beam:
they serve every class.

The **assembly page** (see `CONTEXT.md`), `assembly.html` next to
`frames/` and `shared/`, tells a builder which pockets of a frame get a
magnet and which pole faces out, since nothing on a frame shows it. It is
one self-contained HTML file, with no scripts, fonts or requests from
elsewhere, so it opens from disk on any machine. Hold the frame back down,
left end toward you, and click the five boxes to copy its ID beam, a `/`
for each stroke; the page shows the ID (`00001 = 1`) and, with a length
picked from those the run built, the class, its members, whether its frame
is double-sided (a flip pair) or single-sided, and its magnet count. Below
that, a drawing of the frame as held names its four walls, and one strip
per wall (left end, top edge, right end, bottom edge) shows every position
on it face-on: a coloured disc for a magnet (N red, S blue) on the up
layer's upper row or the down layer's lower one, a dashed circle for the
empty layer of a half pocket, and a small faint circle for an empty
position. **From inside**, the big letter is the face you push into the
bore and the small one the pole facing out of the edge; **from outside**,
to check a finished frame, the strips are mirrored, and the big letter is
the pole facing out. The view stays in the URL (`view=outside`), with the
beam and length. An ID no class has gets a red notice, a class the run
didn't build a yellow one; both list the classes one mark away, to click,
and what the run built. The page shows exactly the frames the run built,
`--classes` and `--max-length` included. The API is
`magnets.assembly_page`, which takes the arrangement, `classes` and
`max_length` as `bases` does, raises the same errors and doesn't need
build123d: it returns each frame's walls, in the order from inside, with
every position's `at` (U from the left end or the top edge) and each
layer's out-facing pole (its in-facing pole is the opposite), every card
class, built or not, and the page's `html`.

The builder's tolerances, each a gap on one side in mm, are options:

- `--slide-clearance` (0.2): between the core and the frame, and between a
  leg and its cross-bar; a window is the 4 mm leg + twice this.
- `--sheet-clearance` (0.2): room for the paper sheet. A face plate is
  inset this far from the frame's outline (89.6 × 29.6 mm at 3U by
  default) and sits this far above it, and a single-sided frame's back
  sits this far below it, with pads under the core.
- `--magnet-clearance` (0.2): around a magnet in its bore. A bore is the
  magnet's 3 mm + twice this, 3.4 mm.
- `--magnet-depth-clearance` (0.3): how far a magnet can move front to
  back. The frame wall is 0.6 mm of skin + the magnet's 1.5 mm + this −
  the slide clearance, 2.2 mm by default, so the core stays put.

Tolerances never move a bore's centre, so bases built with different
tolerances from the same arrangement snap together. The fixed sizes (U,
the card's width and thickness, the magnet, positions and layers) and the
design values from the reference base are constants in `blueprint.py`. It
needs build123d, in the `bases` extra (`uv sync --extra bases`; the dev
dependencies include it), which `check`, `search` and `print` don't. The
API is `magnets.bases`, which returns the parts (`kind`, `card_class`,
None for a core or face, `length`, the build123d `solid` ready to print,
and its `placement` in the card) without writing anything, with a
`magnets.Tolerances`; `magnets.assemblies` puts them together per card.

`magnets search` exits 0 only when it writes a valid arrangement (optimal
or feasible). It exits 1 when the search is infeasible, even though it
still writes the arrangement with the fewest must failures, and when it is
unknown (nothing found in the time limit: it writes no files). `magnets
check` exits 0 whenever it writes its reports, valid or not. Both exit 2 for
an invalid arrangement or argument, as `print` and `bases` do; for
`bases`, that includes a tolerance that is negative or leaves no wall.
