// The program tree the structure stage gives. Every node keeps its text
// position, and knows nothing of names' meanings or of types.
import type { ErrorKind, Stage } from "@snapscript/core";

/** A stretch of the program text, as offsets: `text.slice(start, end)`. */
export interface Span {
  start: number;
  end: number;
}

/** An error found in the text. It points at text positions only. */
export interface StructureError {
  kind: ErrorKind;
  /** The message its author wrote, without the kind. */
  message: string;
  stage: Stage;
  /** The line (1-based) the error is on, the line it skips. */
  line: number;
  /** The text responsible: the cards, or the line, it blames. */
  spans: Span[];
}

/** One `[…]` in the text. */
export interface Card {
  /** What the card is: `set`, `num`, `if`, `+`, `(` …; `null` if it matches no card class. */
  kind: string | null;
  /** The card class in `classes.yaml` it matches. */
  class: string | null;
  /** The card's text, brackets and all, as written. */
  text: string;
  /** Whether its slots are written in `{}`. */
  handwritten: boolean;
  slots: Slot[];
  span: Span;
}

export interface Slot {
  /** The slot's text with gaps left out. */
  text: string;
  /** The slot's text as written. */
  raw: string;
  /** Where the slot's text sits, inside its brackets. */
  span: Span;
}

/** A name as written, and the key it compares by: names ignore case (ADR 0008). */
export interface Name {
  text: string;
  key: string;
  span: Span;
}

interface ExprBase {
  span: Span;
}

export type Expr =
  | (ExprBase & { type: "num"; value: number; card: Card })
  | (ExprBase & { type: "str"; value: string; card: Card })
  | (ExprBase & { type: "bool"; value: boolean; card: Card })
  | (ExprBase & { type: "color"; value: string; card: Card })
  | (ExprBase & { type: "none"; card: Card })
  | (ExprBase & { type: "root"; card: Card })
  /** `[get{x}]`, `[get(p5.frameCount)]`: a name, with its namespace before it. */
  | (ExprBase & { type: "get"; path: Name[]; card: Card })
  /** `[call(p5.circle)]…`, or `[get{a}][call{b}]…` with a receiver. */
  | (ExprBase & { type: "call"; receiver: Expr | null; path: Name[]; args: Expr[]; card: Card })
  | (ExprBase & { type: "getProp"; object: Expr; name: Name; card: Card })
  | (ExprBase & { type: "binary"; op: string; left: Expr; right: Expr; card: Card })
  | (ExprBase & { type: "not"; operand: Expr; card: Card })
  | (ExprBase & { type: "group"; value: Expr; open: Card; close: Card });

interface StatementBase {
  /** The line (1-based) of the statement's head. */
  line: number;
  /** The head line's cards. */
  span: Span;
}

/** How a block ended: by its `[dedent]`, by a line in its column with none (an error), or at the end of its body or strip. */
export type Closed = "dedent" | "missing" | "end";

export interface Branch extends StatementBase {
  type: "if" | "elif" | "else";
  /** `null` for `[else]`, or when the value could not be read. */
  condition: Expr | null;
  body: Statement[];
}

export type Statement =
  /** A value that could not be read is `null`, and so is a name. */
  | (StatementBase & { type: "set"; name: Name | null; value: Expr | null })
  | (StatementBase & { type: "return"; value: Expr | null })
  | (StatementBase & { type: "setProp"; target: Expr; name: Name | null; value: Expr | null })
  | (StatementBase & { type: "expression"; value: Expr | null })
  | (StatementBase & { type: "repeat"; count: Expr | null; body: Statement[]; closed: Closed })
  | (StatementBase & { type: "for"; name: Name | null; iterable: Expr | null; body: Statement[]; closed: Closed })
  | (StatementBase & { type: "if"; branches: Branch[]; closed: Closed })
  /**
   * A line that forms no statement: one indented where no block opens (with
   * the lines indented under it), a `[dedent]` with no block to close, or an
   * `[elif]` or `[else]` with no chain to continue (with its block).
   */
  | (StatementBase & { type: "invalid"; lines: number[]; body: Statement[] });

export interface Param {
  type: "required" | "optional";
  name: Name | null;
  /** An optional parameter's default: one leaf card, or `null` for none. */
  default: Expr | null;
  card: Card;
}

/** Where a strip lies on the table (REFERENCE.md §1.1). */
export type Table =
  | { type: "at"; x: number; y: number; turn: number }
  | { type: "auto" }
  | { type: "hidden" };

export interface DocTag {
  /** The tag's name, without `@`: `param`, `card`, `table` … */
  name: string;
  /** What follows the name on its line. */
  text: string;
}

export interface DocParam {
  name: string;
  /** The types in `{…}`, split at `|`; empty when none is given. */
  types: string[];
  description: string;
}

/** A `/** *\/` comment, its text and its tags. */
export interface DocComment {
  span: Span;
  /** The text before the first tag. */
  description: string;
  tags: DocTag[];
  params: DocParam[];
  returns: { types: string[]; description: string } | null;
  /** Each `@card`: the card it names, or `null` for the declaration's own card. */
  cards: (string | null)[];
  /** The `@color` tag's value, as written. */
  color: string | null;
  /** The `@table` tag; one that can't be read is `auto`. `null` with no tag. */
  table: Table | null;
}

interface DeclarationBase {
  line: number;
  span: Span;
  card: Card;
  /** The doc comment just before it. */
  doc: DocComment | null;
  /** Where its strip lies: `[import]` and `[extern]` are always hidden. */
  table: Table;
}

export type Declaration =
  | (DeclarationBase & { type: "define"; name: Name | null; params: Param[]; body: Statement[] })
  | (DeclarationBase & { type: "on"; event: Name | null; body: Statement[] })
  /** `source` is the package name or path, case kept; `binding` the name it binds. */
  | (DeclarationBase & { type: "import"; source: string; binding: Name | null })
  | (DeclarationBase & { type: "extern"; name: Name | null; params: Param[] })
  | (DeclarationBase & { type: "global"; name: Name | null; value: Expr | null });

export interface Program {
  declarations: Declaration[];
  /** Doc comments that stand alone, not just before a declaration. */
  docComments: DocComment[];
  /** Lines (1-based) with cards that aren't part of the program: below no `[define]` or `[on(…)]`. */
  detachedLines: number[];
}
