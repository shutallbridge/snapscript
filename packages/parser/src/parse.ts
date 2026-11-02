// The structure stage: text → program tree, with SyntaxError and IndentationError.
import type { ErrorKind } from "@snapscript/core";
import { blockHeads, standalone } from "./cards.ts";
import { Fail, LineReader, readName, unknownCard } from "./line.ts";
import { scan, type ScannedLine } from "./scan.ts";
import type {
  Branch,
  Closed,
  Declaration,
  DocComment,
  Expr,
  Name,
  Param,
  Program,
  Statement,
  StructureError,
  Table,
} from "./tree.ts";

export interface ParseResult {
  program: Program;
  errors: StructureError[];
}

/** One line in a strip, with its column counted in indents. */
interface BodyLine {
  scanned: ScannedLine;
  level: number;
  head: string | null;
}

/** Where a strip's body is read up to. */
interface Cursor {
  lines: BodyLine[];
  i: number;
  /** The index of an `[elif]` or `[else]` whose error is already reported. */
  reported?: number;
  /** The line of the `[dedent]` the last block read was closed by. */
  dedent?: number;
}

class Parser {
  readonly errors: (StructureError & { content: boolean })[] = [];

  error(kind: ErrorKind, line: number, message: string, spans: StructureError["spans"], content: boolean, aboutCardText = false): void {
    this.errors.push({ kind, message, stage: "structure", line, spans, aboutCardText, content });
  }

  /**
   * Reads a line's cards with `read`. A line's own problems are SyntaxErrors
   * on it, and leave what couldn't be read out (`fallback`). `parse` drops
   * them on a skipped line, which is read for structure only.
   */
  read<T>(line: ScannedLine, read: (reader: LineReader) => T, fallback: T): T {
    try {
      return read(new LineReader(line.cards));
    } catch (e) {
      if (!(e instanceof Fail)) throw e;
      this.error("SyntaxError", line.number, e.message, e.spans, true, e.aboutCardText);
      return fallback;
    }
  }

  name(line: ScannedLine, readName: () => Name): Name | null {
    return this.read(line, () => readName(), null);
  }

  // ---- Strips ----

  parse(lines: ScannedLine[], docs: { doc: DocComment; endLine: number }[]): Program {
    const declarations: Declaration[] = [];
    const detachedLines: number[] = [];
    const docComments: DocComment[] = [];

    const known = lines.map((line) => ({ line, head: line.cards[0].kind }));
    const declarationLines = new Set(known.filter((l) => l.head && standalone.has(l.head)).map((l) => l.line.number));

    // A doc comment just before a declaration belongs to it: the declaration
    // is on the comment's last line, after it, or on the line below.
    const docOf = new Map<number, DocComment>();
    for (const { doc, endLine } of docs) {
      const target = lines.find(
        (l) => (l.number === endLine || l.number === endLine + 1) && l.span.start > doc.span.end,
      );
      const first = target && lines.find((l) => l.number >= endLine);
      if (target && first === target && declarationLines.has(target.number) && !docOf.has(target.number)) {
        docOf.set(target.number, doc);
      } else {
        docComments.push(doc);
      }
    }

    let i = 0;
    while (i < known.length) {
      const { line, head } = known[i];
      i += 1;
      if (!head || !standalone.has(head)) {
        detachedLines.push(line.number);
        continue;
      }
      const body: BodyLine[] = [];
      while (i < known.length && !(known[i].head && standalone.has(known[i].head!))) {
        const scanned = known[i].line;
        body.push({ scanned, level: this.level(scanned), head: known[i].head });
        i += 1;
      }
      if (line.column > 0 || line.tabbed) {
        this.error("IndentationError", line.number, `${line.cards[0].text} stands alone, so it is never indented`, [line.span], false);
      }
      const declaration = this.declaration(line, head, docOf.get(line.number) ?? null);
      if (declaration.type === "define" || declaration.type === "on") {
        const cursor: Cursor = { lines: body, i: 0 };
        declaration.body = this.body(cursor, 0);
      } else {
        detachedLines.push(...body.map((b) => b.scanned.number));
      }
      declarations.push(declaration);
    }

    this.duplicates(declarations);
    return { declarations, docComments, detachedLines };
  }

  level(line: ScannedLine): number {
    if (line.tabbed || line.column % 2 !== 0) {
      this.error("IndentationError", line.number, "an indent is two spaces", [line.span], false);
    }
    return Math.floor(line.column / 2);
  }

  declaration(line: ScannedLine, head: string, doc: DocComment | null): Declaration {
    const card = line.cards[0];
    const base = {
      line: line.number,
      span: line.span,
      card,
      doc,
      table: (head === "import" || head === "extern" ? { type: "hidden" } : (doc?.table ?? { type: "auto" })) as Table,
    };
    const slot = card.slots[0];
    switch (head) {
      case "define":
      case "extern": {
        const name = this.name(line, () => readName(card, slot));
        const params = this.read(
          line,
          (r) => {
            r.next();
            return r.params(card);
          },
          [] as Param[],
        );
        return head === "define"
          ? { ...base, type: "define", name, params, body: [] }
          : { ...base, type: "extern", name, params };
      }
      case "on": {
        const event = this.name(line, () => readName(card, slot));
        this.read(line, (r) => (r.next(), r.end(card)), undefined);
        return { ...base, type: "on", event, body: [] };
      }
      case "global": {
        const name = this.name(line, () => readName(card, slot));
        const value = this.read<Expr | null>(line, (r) => (r.next(), r.globalValue(card)), null);
        return { ...base, type: "global", name, value };
      }
      default: {
        const source = slot.text;
        const binding = this.read<Name | null>(
          line,
          (r) => {
            r.next();
            r.end(card);
            if (card.slots.length > 1) return readName(card, card.slots[1]);
            if (!/^\.\.?\//.test(source)) throw new Fail("a package needs as(…) to give it a name", [card.span]);
            // A path with no as(…) binds to its file's name: ./shapes.snap binds to shapes.
            const file = source.slice(source.lastIndexOf("/") + 1).replace(/\.snap$/i, "");
            if (!/^[A-Za-z0-9_]+$/.test(file)) {
              throw new Fail(`${file} is not a name, so this import needs as(…) to give it one`, [card.span]);
            }
            return { text: file, key: file.toLowerCase(), span: slot.span };
          },
          null,
        );
        return { ...base, type: "import", source, binding };
      }
    }
  }

  // ---- Blocks ----

  /** The statements of a body whose lines sit at `level`. */
  body(cursor: Cursor, level: number): Statement[] {
    const statements: Statement[] = [];
    while (cursor.i < cursor.lines.length) {
      const line = cursor.lines[cursor.i];
      if (line.level < level) break;
      if (line.level > level) {
        // Indented where no block opens: an error, with the lines indented under it.
        cursor.i += 1;
        const lines = [line.scanned.number];
        while (cursor.i < cursor.lines.length && cursor.lines[cursor.i].level > line.level) {
          lines.push(cursor.lines[cursor.i].scanned.number);
          cursor.i += 1;
        }
        this.error(
          "IndentationError",
          line.scanned.number,
          "this line is indented, but the line above it opens no block",
          [line.scanned.span],
          false,
        );
        statements.push({ type: "invalid", line: line.scanned.number, span: line.scanned.span, lines, body: [] });
        continue;
      }
      if (line.head === "dedent") {
        cursor.i += 1;
        this.error("IndentationError", line.scanned.number, "no block to close", [line.scanned.span], false);
        statements.push({ type: "invalid", line: line.scanned.number, span: line.scanned.span, lines: [line.scanned.number], body: [] });
        continue;
      }
      if (line.head === "elif" || line.head === "else") {
        if (cursor.reported !== cursor.i) {
          this.error("SyntaxError", line.scanned.number, "no chain to continue", [line.scanned.cards[0].span], false);
        }
        statements.push(this.orphan(cursor, level));
        continue;
      }
      if (line.head && blockHeads.has(line.head)) {
        statements.push(this.block(cursor, level));
        continue;
      }
      cursor.i += 1;
      statements.push(this.simple(line.scanned));
    }
    return statements;
  }

  simple(line: ScannedLine): Statement {
    const card = line.cards[0];
    const base = { line: line.number, span: line.span };
    if (card.kind === null) {
      this.read(line, () => {
        throw new Fail(unknownCard(card), [card.span]);
      }, undefined);
      return { ...base, type: "invalid", lines: [line.number], body: [] };
    }
    switch (card.kind) {
      case "set": {
        const name = this.name(line, () => readName(card, card.slots[0]));
        const value = this.read<Expr | null>(line, (r) => (r.next(), r.oneValue(card)), null);
        return { ...base, type: "set", name, value };
      }
      case "return": {
        const value = this.read<Expr | null>(line, (r) => (r.next(), r.optionalValue(card)), null);
        return { ...base, type: "return", value };
      }
      default: {
        const result = this.read<Statement>(
          line,
          (r) => {
            const value = r.expression();
            const next = r.peek();
            if (next?.kind === "setProp") {
              r.next();
              if (value.type === "binary" || value.type === "not") {
                throw new Fail(`${next.text} needs the value it sets an attribute of directly to its left`, [next.span]);
              }
              const name = readName(next, next.slots[0]);
              return { ...base, type: "setProp", target: value, name, value: r.oneValue(next) };
            }
            r.end(card, "a line holds one value, and this card starts another");
            return { ...base, type: "expression", value };
          },
          { ...base, type: "expression", value: null },
        );
        return result;
      }
    }
  }

  /** The value a block head takes: `[if]`, `[elif]`, `[repeat]` and `[for{…}in]` take one, `[else]` none. */
  headValue(line: ScannedLine): Expr | null {
    const card = line.cards[0];
    if (card.kind === "else" || card.kind === "dedent") {
      this.read(line, (r) => (r.next(), r.end(card)), undefined);
      return null;
    }
    return this.read<Expr | null>(line, (r) => (r.next(), r.oneValue(card)), null);
  }

  /** A block and, for an `[if]`, the rest of its chain, with how it is closed (§8). */
  block(cursor: Cursor, level: number): Statement {
    const head = cursor.lines[cursor.i];
    cursor.i += 1;
    const scanned = head.scanned;
    const kind = head.head!;
    const value = this.headValue(scanned);
    const body = this.body(cursor, level + 1);

    if (kind === "repeat" || kind === "for") {
      const closed = this.close(cursor, level, scanned, () => {
        const next = cursor.lines[cursor.i];
        const what = kind === "repeat" ? "[repeat]" : "[for{…}in]";
        this.error("SyntaxError", next.scanned.number, `${what} has no ${next.scanned.cards[0].text}`, [next.scanned.cards[0].span], false);
        return true;
      });
      const base = { line: scanned.number, span: scanned.span, body, closed, dedent: dedentOf(cursor, closed) };
      if (kind === "repeat") return { ...base, type: "repeat", count: value };
      const name = this.name(scanned, () => readName(scanned.cards[0], scanned.cards[0].slots[0]));
      return { ...base, type: "for", name, iterable: value };
    }

    const branches: Branch[] = [{ type: kind as Branch["type"], line: scanned.number, span: scanned.span, condition: value, body }];
    const closed = this.close(cursor, level, scanned, () => {
      const next = cursor.lines[cursor.i];
      const last = branches[branches.length - 1];
      if (last.type === "else") {
        this.error("SyntaxError", next.scanned.number, `${next.scanned.cards[0].text} after [else]`, [next.scanned.cards[0].span], false);
      }
      cursor.i += 1;
      const condition = this.headValue(next.scanned);
      const branchBody = this.body(cursor, level + 1);
      branches.push({
        type: next.head as Branch["type"],
        line: next.scanned.number,
        span: next.scanned.span,
        condition,
        body: branchBody,
      });
      return false;
    });
    return { type: "if", line: scanned.number, span: scanned.span, branches, closed, dedent: dedentOf(cursor, closed) };
  }

  /**
   * How the block whose head is at `level` ends. `onBranch` is called for an
   * `[elif]` or `[else]` in its column, and returns whether that ends the block.
   */
  close(cursor: Cursor, level: number, head: ScannedLine, onBranch: () => boolean): Closed {
    for (;;) {
      const next = cursor.lines[cursor.i];
      if (next === undefined || next.level < level) return "end";
      if (next.level > level) return "end";
      if (next.head === "dedent") {
        cursor.i += 1;
        cursor.dedent = next.scanned.number;
        this.read(next.scanned, (r) => (r.next(), r.end(next.scanned.cards[0])), undefined);
        return "dedent";
      }
      if (next.head === "elif" || next.head === "else") {
        if (onBranch()) {
          // The branch is an error, already reported; the body above reads it with its block.
          cursor.reported = cursor.i;
          return "end";
        }
        continue;
      }
      this.error("IndentationError", head.number, "no [dedent] closes this block before the line below it", [head.span], false);
      return "missing";
    }
  }

  /** An `[elif]` or `[else]` that continues no chain: an error, read with its block. */
  orphan(cursor: Cursor, level: number): Statement {
    const line = cursor.lines[cursor.i];
    const block = this.block(cursor, level);
    const lines = [line.scanned.number];
    return { type: "invalid", line: line.scanned.number, span: line.scanned.span, lines, body: [block] };
  }

  // ---- Declarations that clash ----

  duplicates(declarations: Declaration[]): void {
    const named = new Map<string, { declaration: Declaration; name: Name }[]>();
    const handlers = new Map<string, Declaration[]>();
    for (const declaration of declarations) {
      if (declaration.type === "on") {
        if (!declaration.event) continue;
        const list = handlers.get(declaration.event.key) ?? [];
        list.push(declaration);
        handlers.set(declaration.event.key, list);
        continue;
      }
      const name = declaration.type === "import" ? declaration.binding : declaration.name;
      if (!name) continue;
      const list = named.get(name.key) ?? [];
      list.push({ declaration, name });
      named.set(name.key, list);
    }

    for (const list of named.values()) {
      if (list.length < 2) continue;
      const clashes = list.filter((a) => list.some((b) => a !== b && clash(a.declaration, b.declaration)));
      const declared = list[0].name.text;
      for (const { declaration } of clashes) {
        this.error(
          "SyntaxError",
          declaration.line,
          externOnly(clashes.map((c) => c.declaration))
            ? `${declared} is declared more than once for the same number of values`
            : `${declared} is declared more than once in this file`,
          clashes.map((c) => c.name.span),
          true,
        );
      }
    }
    for (const list of handlers.values()) {
      for (const handler of list.slice(1)) {
        this.error(
          "SyntaxError",
          handler.line,
          `this file already has an ${list[0].card.text} handler`,
          list.map((h) => h.card.span),
          true,
        );
      }
    }
  }
}

function dedentOf(cursor: Cursor, closed: Closed): number | null {
  return closed === "dedent" ? cursor.dedent! : null;
}

function externOnly(declarations: Declaration[]): boolean {
  return declarations.every((d) => d.type === "extern");
}

/** Two declarations clash unless both are `[extern(…)]`s that take no count of values in common. */
function clash(a: Declaration, b: Declaration): boolean {
  if (a.type !== "extern" || b.type !== "extern") return true;
  const range = (params: Param[]): [number, number] => [params.filter((p) => p.type === "required").length, params.length];
  const [aMin, aMax] = range(a.params);
  const [bMin, bMax] = range(b.params);
  return aMin <= bMax && bMin <= aMax;
}

/**
 * Parses program text. Lines in `skippedLines` (1-based) are read for
 * structure only: their own cards make no errors, and a block head among them
 * still opens its block.
 */
export function parse(text: string, skippedLines: Iterable<number> = []): ParseResult {
  const skipped = new Set(skippedLines);
  const scanned = scan(text);
  const parser = new Parser();
  for (const problem of scanned.problems) {
    parser.error("SyntaxError", problem.line, problem.message, [problem.span], true);
  }
  const program = parser.parse(scanned.lines, scanned.docs);
  const errors = parser.errors
    .filter((e) => !(e.content && skipped.has(e.line)))
    .sort((a, b) => a.line - b.line || (a.spans[0]?.start ?? 0) - (b.spans[0]?.start ?? 0))
    .map(({ content: _, ...error }) => error);
  return { program, errors };
}
