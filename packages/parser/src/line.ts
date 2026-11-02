// Reads one line's cards: its values (REFERENCE.md §6) and what its head takes.
import { cssColors } from "./colors.ts";
import type { Card, Expr, Name, Param, Slot, Span } from "./tree.ts";

/** A problem with a line's own cards: the line can't run as written. */
export class Fail extends Error {
  readonly spans: Span[];
  constructor(message: string, spans: Span[]) {
    super(message);
    this.spans = spans;
  }
}

const leaves = new Set(["num", "str", "bool", "color", "none", "root", "get"]);
const valueStarts = new Set([...leaves, "call", "(", "not"]);
const comparisons = new Set(["<", ">", "<=", ">=", "==", "!="]);
const additive = new Set(["+", "-"]);
const multiplicative = new Set(["*", "/", "%"]);
const operators = new Set([...comparisons, ...additive, ...multiplicative, "and", "or"]);

const spanOf = (from: { span: Span }, to: { span: Span }): Span => ({ start: from.span.start, end: to.span.end });

/** One expression's own count of comparisons: a group or a value slot starts its own. */
interface Context {
  comparisons: number;
}

/** Reads the cards of one line, left to right. */
export class LineReader {
  private pos = 0;
  constructor(private readonly cards: readonly Card[]) {}

  peek(): Card | undefined {
    return this.cards[this.pos];
  }

  next(): Card {
    return this.cards[this.pos++];
  }

  atEnd(): boolean {
    return this.pos >= this.cards.length;
  }

  private rest(): Span[] {
    const first = this.cards[this.pos];
    const last = this.cards[this.cards.length - 1];
    return [{ start: first.span.start, end: last.span.end }];
  }

  private startsValue(card: Card | undefined): boolean {
    return card !== undefined && card.kind !== null && valueStarts.has(card.kind);
  }

  /** Fails on whatever is left on the line. */
  end(head: Card, what = `${head.text} takes nothing after it`): void {
    if (this.atEnd()) return;
    const card = this.peek()!;
    if (card.kind === ")") throw new Fail("[)] closes no group", [card.span]);
    throw new Fail(this.startsValue(card) ? what : `${card.text} can't go here`, this.rest());
  }

  /** Exactly one value after `head`, and nothing else. */
  oneValue(head: Card): Expr {
    if (this.atEnd()) throw new Fail(`${head.text} needs a value`, [head.span]);
    const value = this.expression();
    this.end(head, `${head.text} takes one value`);
    return value;
  }

  /** One value or none after `head`, and nothing else. */
  optionalValue(head: Card): Expr | null {
    if (this.atEnd()) return null;
    return this.oneValue(head);
  }

  expression(): Expr {
    return this.or({ comparisons: 0 });
  }

  private binary(op: Card, left: Expr, right: Expr): Expr {
    return { type: "binary", op: op.kind!, left, right, card: op, span: spanOf(left, right) };
  }

  private or(ctx: Context): Expr {
    let left = this.and(ctx);
    while (this.peek()?.kind === "or") {
      const op = this.next();
      left = this.binary(op, left, this.and(ctx, op));
    }
    return left;
  }

  private and(ctx: Context, after?: Card): Expr {
    let left = this.not(ctx, after);
    while (this.peek()?.kind === "and") {
      const op = this.next();
      left = this.binary(op, left, this.not(ctx, op));
    }
    return left;
  }

  private not(ctx: Context, after?: Card): Expr {
    if (this.peek()?.kind !== "not") return this.comparison(ctx, after);
    const card = this.next();
    const operand = this.not(ctx, card);
    return { type: "not", operand, card, span: spanOf(card, operand) };
  }

  private comparison(ctx: Context, after?: Card): Expr {
    let left = this.additive(ctx, after);
    while (this.peek()?.kind && comparisons.has(this.peek()!.kind!)) {
      const op = this.next();
      ctx.comparisons += 1;
      if (ctx.comparisons > 1) {
        throw new Fail(
          `${op.text} is a second comparison in one value: put each comparison in [(] [)] and join them with [and]`,
          [op.span],
        );
      }
      left = this.binary(op, left, this.additive(ctx, op));
    }
    return left;
  }

  private additive(ctx: Context, after?: Card): Expr {
    let left = this.term(ctx, after);
    while (this.peek()?.kind && additive.has(this.peek()!.kind!)) {
      const op = this.next();
      left = this.binary(op, left, this.term(ctx, op));
    }
    return left;
  }

  private term(ctx: Context, after?: Card): Expr {
    let left = this.postfix(ctx, after);
    while (this.peek()?.kind && multiplicative.has(this.peek()!.kind!)) {
      const op = this.next();
      left = this.binary(op, left, this.postfix(ctx, op));
    }
    return left;
  }

  /** A card directly after a value acts on it: `[getProp{…}]` reads, `[call(…)]` calls (§6.2). */
  private postfix(ctx: Context, after?: Card): Expr {
    let value = this.primary(ctx, after);
    for (;;) {
      const card = this.peek();
      if (card?.kind === "getProp") {
        this.next();
        const name = readName(card, card.slots[0]);
        value = { type: "getProp", object: value, name, card, span: spanOf(value, card) };
      } else if (card?.kind === "call") {
        this.next();
        value = this.call(card, value);
      } else {
        return value;
      }
    }
  }

  private primary(ctx: Context, after?: Card): Expr {
    const card = this.peek();
    if (card === undefined) {
      throw new Fail(after ? `${after.text} needs a value after it` : "a value is missing", after ? [after.span] : []);
    }
    if (card.kind === null) throw new Fail(unknownCard(card), [card.span]);
    if (leaves.has(card.kind)) return leaf(this.next());
    if (card.kind === "call") return this.call(this.next(), null);
    if (card.kind === "not") return this.not(ctx, after);
    if (card.kind === "(") return this.group(this.next());
    if (card.kind === ")") {
      throw new Fail(after ? `${after.text} needs a value after it` : "[)] closes no group", [card.span]);
    }
    if (operators.has(card.kind)) throw new Fail(`${card.text} needs a value before it`, [card.span]);
    throw new Fail(`${card.text} can't go here`, [card.span]);
  }

  private group(open: Card): Expr {
    if (this.peek()?.kind === ")") {
      const close = this.next();
      throw new Fail("a group holds exactly one value, and this one is empty", [spanOf(open, close)]);
    }
    if (this.atEnd()) throw new Fail("[(] is not closed by a [)]", [open.span]);
    const value = this.expression();
    const card = this.peek();
    if (card?.kind === ")") {
      const close = this.next();
      return { type: "group", value, open, close, span: spanOf(open, close) };
    }
    if (card === undefined) throw new Fail("[(] is not closed by a [)]", [open.span]);
    if (this.startsValue(card)) {
      const close = this.cards.slice(this.pos).find((c) => c.kind === ")");
      throw new Fail("a group holds exactly one value", [spanOf(open, close ?? this.cards[this.cards.length - 1])]);
    }
    throw new Fail(`${card.text} can't go here`, [card.span]);
  }

  /** A call grabs values to its right until the end of the line or its group's `[)]` (§6.1). */
  private call(card: Card, receiver: Expr | null): Expr {
    const path = readPath(card, card.slots[0], receiver === null);
    const args: Expr[] = [];
    while (this.startsValue(this.peek())) args.push(this.expression());
    const first = receiver ?? card;
    const last = args.length > 0 ? args[args.length - 1] : card;
    return { type: "call", receiver, path, args, card, span: spanOf(first, last) };
  }

  /** The parameters after a `[define{…}]` or `[extern(…)]` (§8.3). */
  params(head: Card): Param[] {
    const params: Param[] = [];
    let optional = false;
    while (!this.atEnd()) {
      const card = this.next();
      if (card.kind === "required") {
        if (optional) throw new Fail("required parameters come before optional ones", [card.span]);
        params.push({ type: "required", name: readName(card, card.slots[0]), default: null, card });
      } else if (card.kind === "optional") {
        optional = true;
        const name = readName(card, card.slots[0]);
        let value: Expr | null = null;
        const next = this.peek();
        if (next && next.kind !== "required" && next.kind !== "optional") {
          if (next.kind === null || !leaves.has(next.kind)) {
            throw new Fail("an optional parameter's default is one leaf card", this.rest());
          }
          value = leaf(this.next());
          const after = this.peek();
          if (after && after.kind !== "required" && after.kind !== "optional") {
            throw new Fail("an optional parameter's default is one leaf card", this.rest());
          }
        }
        params.push({ type: "optional", name, default: value, card });
      } else {
        this.pos -= 1;
        this.end(head, `only parameters can follow ${head.text}`);
      }
    }
    return params;
  }

  /** A global starts with one literal card, or an empty list or dict (§4.2). */
  globalValue(head: Card): Expr {
    const message = "a global starts with one literal card, or an empty list or dict";
    if (this.atEnd()) throw new Fail(message, [head.span]);
    const card = this.peek()!;
    let value: Expr;
    if (card.kind !== null && ["num", "str", "bool", "color", "none"].includes(card.kind)) {
      value = leaf(this.next());
    } else if (card.kind === "call" && ["list", "dict"].includes(card.slots[0].text.toLowerCase())) {
      value = this.call(this.next(), null);
      if ((value as { args: Expr[] }).args.length > 0) throw new Fail(message, [value.span]);
    } else {
      throw new Fail(message, this.rest());
    }
    if (!this.atEnd()) throw new Fail(message, this.rest());
    return value;
  }
}

export function unknownCard(card: Card): string {
  return `${card.text} is not a card`;
}

/** Turns a leaf card into its value, checking what it holds (§2.1, §3.2). */
export function leaf(card: Card): Expr {
  const span = card.span;
  const slot = card.slots[0];
  switch (card.kind) {
    case "num":
      if (!/^-?\d+(\.\d+)?$/.test(slot.text)) {
        throw new Fail(
          `${card.text} is not a number: a number holds digits, with an optional - first and an optional . between digits`,
          [span],
        );
      }
      return { type: "num", value: Number(slot.text), card, span };
    case "str":
      return { type: "str", value: slot.text.replace(/_/g, " "), card, span };
    case "bool": {
      const value = slot.text.toLowerCase();
      if (value !== "true" && value !== "false") throw new Fail(`${card.text} is neither true nor false`, [span]);
      return { type: "bool", value: value === "true", card, span };
    }
    case "color":
      if (!cssColors.has(slot.text.toLowerCase())) throw new Fail(`${slot.text} is not a CSS color name`, [span]);
      return { type: "color", value: slot.text, card, span };
    case "none":
      return { type: "none", card, span };
    case "root":
      return { type: "root", card, span };
    case "get":
      return { type: "get", path: readPath(card, slot, true), card, span };
    default:
      throw new Fail(`${card.text} can't go here`, [span]);
  }
}

/** A name with no namespace: letters, digits and `_` (§2.1). */
export function readName(card: Card, slot: Slot): Name {
  const [name] = readPath(card, slot, false);
  return name;
}

/** A name, with a namespace before it when `dotted`: `p5.frameCount`. */
export function readPath(card: Card, slot: Slot, dotted: boolean): Name[] {
  if (slot.text === "") throw new Fail(`${card.text} has no name written on it`, [card.span]);
  // Where each character of the gap-free text sits in the raw slot.
  const at: number[] = [];
  for (let i = 0; i < slot.raw.length; i += 1) if (!/\s/.test(slot.raw[i])) at.push(slot.span.start + i);
  const names: Name[] = [];
  let from = 0;
  for (const part of slot.text.split(".")) {
    if (!/^[A-Za-z0-9_]+$/.test(part)) {
      throw new Fail(`${slot.text} is not a name: a name holds letters, digits and _`, [card.span]);
    }
    names.push({
      text: part,
      key: part.toLowerCase(),
      span: { start: at[from], end: at[from + part.length - 1] + 1 },
    });
    from += part.length + 1;
  }
  if (!dotted && names.length > 1) {
    throw new Fail(`${slot.text} is not a name here: ${card.text} takes a name with no namespace`, [card.span]);
  }
  return names;
}
