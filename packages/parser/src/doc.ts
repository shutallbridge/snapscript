// Doc comments: `/** … */`, their description and tags (REFERENCE.md §1.1).
import type { DocComment, DocTag, Span, Table } from "./tree.ts";

/** Reads a doc comment from its whole text, `/**` to `*\/`. */
export function readDocComment(text: string, span: Span): DocComment {
  const inner = text.slice(3, -2);
  const lines = inner.split("\n").map((line) => line.replace(/^\s*\*?\s?/, "").trimEnd());

  const description: string[] = [];
  const tags: DocTag[] = [];
  for (const line of lines) {
    const tag = /^@(\w+)\s*(.*)$/.exec(line.trim());
    if (tag) tags.push({ name: tag[1], text: tag[2].trim() });
    else if (tags.length === 0) description.push(line);
    else if (line.trim() !== "") {
      const last = tags[tags.length - 1];
      last.text = `${last.text} ${line.trim()}`.trim();
    }
  }

  const doc: DocComment = {
    span,
    description: description.join("\n").trim(),
    tags,
    params: [],
    returns: null,
    cards: [],
    color: null,
    table: null,
  };
  for (const tag of tags) {
    if (tag.name === "param") {
      const { types, rest } = readTypes(tag.text);
      const [, name = "", description = ""] = /^(\S*)\s*(.*)$/.exec(rest) ?? [];
      doc.params.push({ name, types, description: description.trim() });
    } else if (tag.name === "returns") {
      const { types, rest } = readTypes(tag.text);
      doc.returns = { types, description: rest.trim() };
    } else if (tag.name === "card") {
      doc.cards.push(tag.text === "" ? null : tag.text);
    } else if (tag.name === "color") {
      doc.color = tag.text;
    } else if (tag.name === "table") {
      doc.table = readTable(tag.text);
    }
  }
  return doc;
}

function readTypes(text: string): { types: string[]; rest: string } {
  const typed = /^\{([^}]*)\}\s*(.*)$/s.exec(text);
  if (!typed) return { types: [], rest: text };
  const types = typed[1]
    .split("|")
    .map((t) => t.trim())
    .filter((t) => t !== "");
  return { types, rest: typed[2] };
}

/** A `@table` the system can't read counts as `@table auto`. */
function readTable(text: string): Table {
  if (text === "auto") return { type: "auto" };
  if (text === "hidden") return { type: "hidden" };
  const at = /^(-?\d+)\s+(-?\d+)(?:\s+(-?\d+))?$/.exec(text);
  if (!at) return { type: "auto" };
  return { type: "at", x: Number(at[1]), y: Number(at[2]), turn: at[3] === undefined ? 0 : Number(at[3]) };
}
