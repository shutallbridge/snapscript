// Reads text into lines of cards, and its comments. Comments exist only in text.
import { readCard } from "./cards.ts";
import { readDocComment } from "./doc.ts";
import type { Card, DocComment, Span } from "./tree.ts";

export interface ScannedLine {
  /** 1-based. */
  number: number;
  /** Characters before the line's first card. */
  column: number;
  /** Whether a tab comes before the first card. */
  tabbed: boolean;
  cards: Card[];
  /** From the first card's start to the last card's end. */
  span: Span;
}

export interface ScannedDoc {
  doc: DocComment;
  /** The line its `*\/` is on. */
  endLine: number;
}

export interface ScanProblem {
  line: number;
  message: string;
  span: Span;
}

export interface Scan {
  lines: ScannedLine[];
  docs: ScannedDoc[];
  problems: ScanProblem[];
}

export function scan(text: string): Scan {
  const lines: ScannedLine[] = [];
  const docs: ScannedDoc[] = [];
  const problems: ScanProblem[] = [];
  let line = 1;
  let lineStart = 0;
  let current: ScannedLine | null = null;
  let tabbed = false;

  const newline = (at: number): void => {
    line += 1;
    lineStart = at + 1;
    current = null;
    tabbed = false;
  };

  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") {
      newline(i);
      i += 1;
    } else if (c === " " || c === "\r" || c === "\t") {
      if (c === "\t" && current === null) tabbed = true;
      i += 1;
    } else if (c === "/" && text[i + 1] === "/") {
      const end = text.indexOf("\n", i);
      i = end < 0 ? text.length : end;
    } else if (c === "/" && text[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      if (end < 0) {
        problems.push({ line, message: "this comment has no */ to end it", span: { start: i, end: text.length } });
        break;
      }
      const startLine = line;
      for (let j = i; j < end; j += 1) {
        if (text[j] === "\n") {
          line += 1;
          lineStart = j + 1;
        }
      }
      if (line !== startLine) {
        current = null;
        tabbed = false;
      }
      const isDoc = text[i + 2] === "*" && i + 2 !== end;
      if (isDoc) {
        const span = { start: i, end: end + 2 };
        docs.push({ doc: readDocComment(text.slice(span.start, span.end), span), endLine: line });
      }
      i = end + 2;
    } else if (c === "[") {
      const close = text.indexOf("]", i + 1);
      const eol = text.indexOf("\n", i);
      if (close < 0 || (eol >= 0 && eol < close)) {
        const end = eol < 0 ? text.length : eol;
        problems.push({ line, message: "this card has no ] to close it", span: { start: i, end } });
        i = end;
        continue;
      }
      const card = readCard(text.slice(i, close + 1), i);
      if (current === null) {
        current = { number: line, column: i - lineStart, tabbed, cards: [], span: { ...card.span } };
        lines.push(current);
      }
      current.cards.push(card);
      current.span.end = card.span.end;
      i = close + 1;
    } else {
      const stray = /[^\s[]+/y;
      stray.lastIndex = i;
      let end = i + stray.exec(text)![0].length;
      const comment = text.slice(i, end).search(/\/[/*]/);
      if (comment > 0) end = i + comment;
      problems.push({ line, message: `${text.slice(i, end)} is not a card: a card is written [ … ]`, span: { start: i, end } });
      i = end;
    }
  }
  return { lines, docs, problems };
}
