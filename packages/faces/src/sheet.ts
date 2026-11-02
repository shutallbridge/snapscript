// The card sheet as printed (#101): its sizes, what a card's sheet says, and the length rule.

/** The sheet's sizes, in mm. */
export const SHEET = {
  /** 1U along the card, and the card's height across it. */
  unitMm: 30,
  heightMm: 30,
  /** The white square at the sheet's left end, and the marker in its centre (9 × 9 cells). */
  markerZoneMm: 17,
  markerMm: 13,
  /** The darker band where the card's colour starts. */
  stripeMm: 1.5,
  /** Round the label, and between a word and the whiteboard. */
  paddingMm: 3,
  gapMm: 3,
  /** Labels are Geist Mono at 26 pt, 5.5 mm a letter. */
  fontPt: 26,
  letterMm: 5.5,
  /** The paper tabs that fold under the face: at the ends, and on the top and bottom. */
  tabEndMm: 8,
  tabSideMm: 5,
} as const;

/** The shortest lengths, in U: any card, a color card and a handwritten card. */
const MIN_LENGTH = 2;
const COLOR_LENGTH = 4;
const HANDWRITTEN_LENGTH = 4;
/** [define{…}], [global{…}], [getProp{…}] and [setProp{…}to]. */
const LONG_HANDWRITTEN_LENGTH = 5;
const LONG_HANDWRITTEN = new Set(["define", "global", "getProp", "setProp"]);

/** What a card's sheet says, read from its card notation. */
export type Side =
  /** A printed label: [repeat], [call(p5.circle)] ("circle"), [define(setup)] ("define setup"). */
  | { kind: "printed"; keyword: string; label: string }
  /** [color(gold)], or [color(…)] for any color. */
  | { kind: "color"; label: string }
  /** An operator, its label centred: [+], [and], [(]. */
  | { kind: "operator"; label: string }
  /** [dedent], an icon. */
  | { kind: "dedent" }
  /** A whiteboard between its words: [set{x}to] is "set", a whiteboard holding "x", then "to". */
  | { kind: "handwritten"; keyword: string; written: string; after: string };

const OPERATORS = new Set(["+", "-", "*", "/", "%", "<", ">", "<=", ">=", "==", "!=", "and", "or", "not", "(", ")"]);

/** What a card's sheet says: its kind and printed label, from its card notation. */
export function sideOf(card: string): Side {
  const inner = card.slice(1, -1);
  const handwritten = inner.match(/^([^{}()]*)\{([^{}]*)\}(.*)$/);
  if (handwritten) {
    const [, keyword, written, after] = handwritten;
    return { kind: "handwritten", keyword: keyword!, written: written === "…" ? "" : written!, after: after! };
  }
  if (inner === "dedent") return { kind: "dedent" };
  if (OPERATORS.has(inner)) return { kind: "operator", label: inner.replace("-", "−") };
  const slots = [...inner.matchAll(/([^()]*)\(([^()]*)\)/g)];
  if (!slots.length) return { kind: "printed", keyword: inner, label: inner };
  const [, keyword, value] = slots[0]!;
  if (keyword === "color") return { kind: "color", label: value === "…" ? "" : value! };
  // Function and variable cards print only the name.
  if (keyword === "call" || keyword === "get") return { kind: "printed", keyword, label: value!.slice(value!.lastIndexOf(".") + 1) };
  if (keyword === "bool") return { kind: "printed", keyword, label: value! };
  return { kind: "printed", keyword: keyword!, label: slots.flatMap(([, k, v]) => [k, v]).filter(Boolean).join(" ") };
}

/** How many letters a printed label of this length holds: its room less the marker zone, stripe and padding. */
export function lettersAt(length: number): number {
  const chrome = SHEET.markerZoneMm + SHEET.stripeMm + 2 * SHEET.paddingMm;
  return Math.floor((length * SHEET.unitMm - chrome) / SHEET.letterMm);
}

/**
 * A card's shortest length in U, by the length rule (#101): a printed card is the shortest length whose room holds its
 * label (2U holds 6 letters, 3U 11, 4U 17), never under 2U. Handwritten cards are at least 4U ([define{…}],
 * [global{…}], [getProp{…}] and [setProp{…}to] 5U), and color cards 4U.
 */
export function shortestLength(card: string): number {
  const side = sideOf(card);
  if (side.kind === "handwritten") return LONG_HANDWRITTEN.has(side.keyword) ? LONG_HANDWRITTEN_LENGTH : HANDWRITTEN_LENGTH;
  if (side.kind === "color") return COLOR_LENGTH;
  if (side.kind === "dedent") return MIN_LENGTH;
  let length = MIN_LENGTH;
  while (lettersAt(length) < side.label.length) length += 1;
  return length;
}
