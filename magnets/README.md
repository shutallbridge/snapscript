# magnets

Checker and CP-SAT solver for the Snapscript magnet arrangement (see issue
#10 for the model).

```sh
uv run magnets check                 # the bundled `example` arrangement
uv run magnets check my.yaml --out out/mine
uv run magnets search --flip top_bottom --classes simple_head,get,literal --time-limit 30
uv run magnets search --flip top_bottom --pin example   # keep the example's simple_head, get and literal design
uv run magnets search --flip left_right --goal no_snap  # illegal neighbours need only not snap
uv run magnets print example         # every bundled program's cards, to cut and fold
uv run magnets print example --program nested_blocks --seed 3   # at the lengths of programs.txt's draw 3
uv run magnets print example --program my_program.txt --unit 30 --paper letter
uv run pytest
```

`check` writes `summary.txt`, `contacts.csv` and `programs.txt` to
`out/<arrangement>/`. A contact is two edges of two cards at given lengths,
facing at some offset. Contacts with the same geometry and labels make one
contact group, named by its smallest length pair, with a `count` of the
contacts it holds; under `left_right` a geometry can split into two contact
groups. `contacts.csv` has one row per contact group and label, leaving out
those where no pockets line up, unless the label is connect.
`summary.txt` counts the pockets of every front by shape (`Pockets: 41
(uniform 20, half 12, split 9)`; a flip pair's back shares its front's), and
both kinds of count: contact groups by kind and result, then contacts
(the sum of `count`), where a contact with two labels counts once under
each. It lists must failures and should and nice leaks. `programs.txt`
lays each bundled test program (`src/magnets/data/programs.yaml`) out on
the table, once at minimum card lengths and 20 times at seeded random
lengths, and reports a legal program's PASS or FAIL with the contacts that
fail, or every forbid contact of an illegal program with its grade.
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
(1U, or 2U on block heads and `[dedent]`). Contacts, program checks and the
print sheet use the lengths; the search tries every pocket position within
the reach. The public API is `magnets.check`,
`magnets.check_program` (a program text in spec notation) and
`magnets.solve`; pass `class_data=` or `rule_data=` to check against other
class or rule data.
A card text resolves to a class side through the side's member notation:
`(…)` stands for handwriting and `…` for printed text. It must match
exactly one class; a text that matches both sides of a flip pair, as
every colour matches both `[color:…]` sides, resolves to the front.

`search` looks for the arrangement with no must failures and the least
weighted forbid grades (a should-leak costs 10 per contact, a nice-leak 1),
then the fewest and simplest pockets. `--goal` says what a forbid must
achieve: `repel` (the default) makes illegal neighbours not snap and also
tries to push them apart, so a weak forbid costs 0.2 of a leak; `no_snap`
is satisfied with "nothing", so a weak forbid costs nothing and pockets go
only where a contact needs them. Objectives found with different goals can't
be compared; `check` grades the same way for both. It writes the arrangement
to `out/search_<flip>_<goal>.yaml` (or `--out`), e.g.
`out/search_top_bottom_no_snap.yaml`, and its checker reports next to it in
`out/search_<flip>_<goal>/`; the summary's first search line gives the goal,
the status (optimal, feasible, infeasible or unknown), objective, bound and
time (`Search (goal repel): optimal, objective 6108.35, bound 6108.35, in
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
top, so a `[str(hi)]` prints as `[num(hi)]` over `[str(hi)]`, the
handwriting carried over, and a `[/]` as `[*]` over `[/]`: a flip pair's
sides list their members in the same order, and each card holds the
members at the same place. Printed text isn't carried over: a
`[color:yellow]`'s back reads `[color:…]`, a colour the kit picks. A
card that is not a flip pair, such as `[get(x)]`, gets an unlabelled
back. Each pocket is a tick in from its
edge with the layer nearest that face: `N` red, `S` blue, `F` grey, `–`
empty. Ticks and letters stay inside their own panel, so neighbours
sharing a cut line keep their pockets apart. `--unit` is the size of a U
in mm (30 by default), a print option, not a spec value. The API is
`magnets.card_sheet` (`draw=N` for `--seed N`), which returns the pages,
pieces, panels, marks and ruler in mm. It exits 2 for an invalid
arrangement, a missing program file, an unknown program name, a card that
matches no class side, or a card too long for the page at `--unit`; that
error names the card and the largest unit that fits.

`magnets search` exits 0 only when it writes a valid arrangement (optimal
or feasible). It exits 1 when the search is infeasible, even though it
still writes the arrangement with the fewest must failures, and when it is
unknown (nothing found in the time limit: it writes no files). `magnets
check` exits 0 whenever it writes its reports, valid or not. Both exit 2 for
an invalid arrangement or argument.
