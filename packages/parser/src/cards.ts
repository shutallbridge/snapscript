// Card patterns, from the language's classes.yaml (bundled in at build).
import classes from "../../../language/classes.yaml";
import type { Card, Slot, Span } from "./tree.ts";

interface ClassFile {
  [name: string]: { sides: { [side: string]: { [member: string]: unknown } } };
}

interface Shape {
  /** The words between and around the slots, or the whole text of a card with no slots. */
  key: string;
  kind: string;
  slots: { open: string; raw: string; start: number; end: number }[];
}

/**
 * Reads a card's inner text as words and slots: `set{x}to` is the words
 * `set` and `to` around one slot. `()` and `{}` are the same to the language.
 * A card such as `+` or `(` has no words, and is its own key.
 */
function shapeOf(content: string): Shape {
  const word = /[A-Za-z]*/y;
  const words: string[] = [];
  const slots: Shape["slots"] = [];
  let i = 0;
  const readWord = (): string => {
    word.lastIndex = i;
    const w = word.exec(content)![0];
    i += w.length;
    return w;
  };
  const first = readWord();
  if (first !== "") {
    words.push(first);
    let ok = true;
    while (i < content.length) {
      const open = content[i];
      if (open !== "(" && open !== "{") {
        ok = false;
        break;
      }
      const close = content.indexOf(open === "(" ? ")" : "}", i + 1);
      const raw = close < 0 ? "" : content.slice(i + 1, close);
      if (close < 0 || /[(){}]/.test(raw)) {
        ok = false;
        break;
      }
      slots.push({ open, raw, start: i + 1, end: close });
      i = close + 1;
      words.push(readWord());
    }
    if (ok) return { key: `${words.join("|")}/${slots.length}`, kind: first, slots };
  }
  return { key: content, kind: content, slots: [] };
}

interface Pattern {
  class: string;
  kind: string;
}

const patterns = new Map<string, Pattern>();
for (const [name, cls] of Object.entries(classes as ClassFile)) {
  // The first side listed is the front: a text that matches both sides of a
  // flip pair resolves to it, so it is kept when a later side has the same key.
  for (const members of Object.values(cls.sides)) {
    for (const member of Object.keys(members)) {
      const shape = shapeOf(member.slice(1, -1));
      if (!patterns.has(shape.key)) patterns.set(shape.key, { class: name, kind: shape.kind });
    }
  }
}

/** Makes a card from its text in the program, `[`…`]` included, at `start`. A card the language doesn't know has no kind. */
export function readCard(text: string, start: number): Card {
  const content = text.slice(1, -1);
  const shape = shapeOf(content);
  const pattern = patterns.get(shape.key);
  const slots: Slot[] = shape.slots.map((s) => ({
    raw: s.raw,
    text: s.raw.replace(/\s+/g, ""),
    span: { start: start + 1 + s.start, end: start + 1 + s.end },
  }));
  const span: Span = { start, end: start + text.length };
  return {
    kind: pattern ? pattern.kind : null,
    class: pattern ? pattern.class : null,
    text,
    handwritten: shape.slots.length > 0 && shape.slots.every((s) => s.open === "{"),
    slots: pattern ? slots : [],
    span,
  };
}

/** The cards that stand alone: each starts a strip (REFERENCE.md §4.1). */
export const standalone: ReadonlySet<string> = new Set(["define", "on", "import", "extern", "global"]);

/** Block heads, which open a block below them. */
export const blockHeads: ReadonlySet<string> = new Set(["if", "repeat", "for", "elif", "else"]);
