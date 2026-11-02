import type {
  CardSpan,
  Handwriting,
  Layout,
  LineCards,
  ReaderSettings,
  ReaderState,
  SkippedLine,
  SkipReason,
  StepInput,
  StepResult,
  TableCard,
  UnknownCard,
} from "./types.ts";
import { hiddenLines, importedNames } from "./entry.ts";

/** The prototypes' measured starting values (#147, #111). */
export const defaultSettings: ReaderSettings = {
  unitMm: 30,
  markerAlongMm: 8.5,
  markerDownMm: 15,
  maxAngleDeg: 15,
  joinMakeAlongMinMm: -8,
  joinMakeAlongMaxMm: 10,
  joinMakeAcrossMm: 6,
  joinKeepAlongMinMm: -8,
  joinKeepAlongMaxMm: 15,
  joinKeepAcrossMm: 9,
  lineMakeMm: 10,
  lineKeepMm: 15,
};

/** The reader before any table state, starting from the project's entry text (there's no prelude). */
export function initialState(entryText = ""): ReaderState {
  return { joins: new Set(), links: new Set(), hidden: hiddenLines(entryText), version: 0, text: "" };
}

type Vec = readonly [number, number];

/** A card on the coding space, with where it lies. */
interface Placed {
  track: number;
  angle: number;
  centre: Vec;
  /** Along the card and down it. */
  u: Vec;
  v: Vec;
  /** Its top-left corner. */
  tl: Vec;
  lengthMm: number | undefined;
  notation: string;
  standsAlone: boolean;
  skip?: SkipReason;
  unknown?: UnknownCard;
}

/** `[define{…}]`, `[on(…)]` and `[global{…}]` start a strip. (`[import]` and `[extern]` are never on the table.) */
const STANDS_ALONE = /^\[(define|on|global)[{(]/;

/** Handwriting can't hold brackets, so they're dropped from a read (#111). */
const BRACKETS = /[{}[\]()]/g;

const pairKey = (a: number, b: number): string => `${a}>${b}`;
const hypot = (p: Vec, q: Vec): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** The smallest signed difference b − a between two angles, in degrees. */
const angleDiff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
const unit = (deg: number): Vec => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];

function inRect(x: number, y: number, r: Layout["codingSpace"]): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

function counts(c: TableCard, layout: Layout): boolean {
  if (!inRect(c.x, c.y, layout.codingSpace)) return false;
  return !layout.corners.some((k) => Math.hypot(c.x - k.x, c.y - k.y) < k.radius);
}

/**
 * What a card writes as and its length in U (unknown for a marker the table doesn't know), why its
 * line is skipped, if it is, and what makes it an unknown card, if it is one.
 */
interface CardText {
  notation: string;
  length?: number;
  skip?: SkipReason;
  unknown?: { package?: string };
}

/** A handwritten card's text, and why its line is skipped when it has none (#111). */
function handwriting(hw: Handwriting | undefined): { text: string; skip?: SkipReason } {
  switch (hw?.state) {
    case "read":
      return { text: (hw.text ?? "").replace(BRACKETS, "") };
    case "reading":
      // A card being read again keeps its old text until the new read arrives.
      return hw.text === undefined ? { text: "", skip: "not read yet" } : { text: hw.text.replace(BRACKETS, "") };
    case "blank":
      return { text: "" };
    case "read error":
    case "connection error":
      return { text: "", skip: hw.state };
    default:
      return { text: "", skip: "not read yet" };
  }
}

/**
 * What a card writes as, or undefined for a marker that isn't a card (a page). `imports` maps each
 * imported package to its local name.
 */
function cardOf(c: TableCard, input: StepInput, imports: ReadonlyMap<string, string>): CardText | undefined {
  const lang = input.languageMarkers.get(c.marker);
  if (lang) {
    if (!lang.card.includes("{}")) return { notation: lang.card, length: lang.length };
    const hw = handwriting(c.hw);
    return { notation: lang.card.replace("{}", `{${hw.text}}`), length: lang.length, skip: hw.skip };
  }
  const entry = input.lockfile.get(c.marker);
  if (entry?.kind === "page") return undefined;
  if (!entry) {
    // The table can't write it as text, nor knows its length.
    return { notation: "", skip: "unknown card", unknown: {} };
  }
  const local = imports.get(entry.package);
  if (local === undefined) {
    // Its kind is known, so it still takes its place in the line's structure (a [define{}] still
    // starts a strip), with empty braces.
    return {
      notation: `[${entry.card}{}]`,
      length: entry.length,
      skip: "unknown card",
      unknown: { package: entry.package },
    };
  }
  // A library's [define(setup)] names the program's own function, so it takes no namespace.
  const name = entry.card === "define" ? entry.name : `${local}.${entry.name}`;
  return { notation: `[${entry.card}(${name})]`, length: entry.length };
}

/**
 * A line with several unread cards is skipped for the reason that lasts longest: an unknown card
 * stays until the program changes, and a card not read yet only until its read arrives.
 */
const SKIP_ORDER: readonly SkipReason[] = ["unknown card", "read error", "connection error", "not read yet"];

function skipReason(cards: readonly Placed[]): SkipReason | undefined {
  return SKIP_ORDER.find((r) => cards.some((c) => c.skip === r));
}

export function step(prev: ReaderState, input: StepInput): StepResult {
  const s: ReaderSettings = { ...defaultSettings, ...input.settings };

  const imports = importedNames(prev.hidden);
  const cards: Placed[] = [];
  for (const c of input.table.cards) {
    if (!counts(c, input.layout)) continue;
    const k = cardOf(c, input, imports);
    if (!k) continue;
    const u = unit(c.angle);
    const v: Vec = [-u[1], u[0]];
    const centre: Vec = [c.x, c.y];
    cards.push({
      track: c.track,
      angle: c.angle,
      centre,
      u,
      v,
      tl: [
        c.x - s.markerAlongMm * u[0] - s.markerDownMm * v[0],
        c.y - s.markerAlongMm * u[1] - s.markerDownMm * v[1],
      ],
      lengthMm: k.length === undefined ? undefined : k.length * s.unitMm,
      notation: k.notation,
      skip: k.skip,
      unknown: k.unknown && { track: c.track, marker: c.marker, ...k.unknown },
      standsAlone: STANDS_ALONE.test(k.notation),
    });
  }

  // Joins (#147): each card against its neighbour, along and across the line its two angles average to.
  const candidates: { left: Placed; right: Placed; held: boolean; distance: number }[] = [];
  for (const left of cards) {
    for (const right of cards) {
      // Nothing joins after a card of unknown length.
      if (right === left || right.standsAlone || left.lengthMm === undefined) continue;
      const turn = angleDiff(left.angle, right.angle);
      if (Math.abs(turn) >= s.maxAngleDeg) continue;
      const u = unit(left.angle + turn / 2);
      const d: Vec = [right.centre[0] - left.centre[0], right.centre[1] - left.centre[1]];
      const along = d[0] * u[0] + d[1] * u[1] - left.lengthMm;
      const across = -d[0] * u[1] + d[1] * u[0];
      const held = prev.joins.has(pairKey(left.track, right.track));
      const ok = held
        ? along >= s.joinKeepAlongMinMm && along <= s.joinKeepAlongMaxMm && Math.abs(across) <= s.joinKeepAcrossMm
        : along >= s.joinMakeAlongMinMm && along <= s.joinMakeAlongMaxMm && Math.abs(across) <= s.joinMakeAcrossMm;
      if (ok) candidates.push({ left, right, held, distance: Math.hypot(along, across) });
    }
  }
  // Joins already made go first, then the nearest. Each card has at most one neighbour on each side.
  candidates.sort((a, b) => Number(b.held) - Number(a.held) || a.distance - b.distance);
  const rightOf = new Map<Placed, Placed>();
  const hasLeft = new Set<Placed>();
  for (const c of candidates) {
    if (rightOf.has(c.left) || hasLeft.has(c.right)) continue;
    rightOf.set(c.left, c.right);
    hasLeft.add(c.right);
  }
  const lineFrom = (h: Placed): Placed[] => {
    const line = [h];
    for (let c = rightOf.get(h); c && !line.includes(c); c = rightOf.get(c)) line.push(c);
    return line;
  };

  // Line to line: a line head sits 1U below the line head above it, and 0, +1 or −1U across.
  const heads = cards.filter((c) => !hasLeft.has(c));
  const used = new Set<Placed>();
  const below = (h: Placed, column: number): { next: Placed; shift: number } | undefined => {
    let best: { next: Placed; shift: number; held: boolean; distance: number } | undefined;
    for (const shift of column > 0 ? [0, 1, -1] : [0, 1]) {
      const spot: Vec = [
        h.tl[0] + s.unitMm * (h.v[0] + shift * h.u[0]),
        h.tl[1] + s.unitMm * (h.v[1] + shift * h.u[1]),
      ];
      for (const o of heads) {
        if (o === h || o.standsAlone || used.has(o)) continue;
        if (Math.abs(angleDiff(h.angle, o.angle)) >= s.maxAngleDeg) continue;
        const held = prev.links.has(pairKey(h.track, o.track));
        const distance = hypot(spot, o.tl);
        if (distance > (held ? s.lineKeepMm : s.lineMakeMm)) continue;
        const better = !best || (held && !best.held) || (held === best.held && distance < best.distance);
        if (better) best = { next: o, shift, held, distance };
      }
    }
    return best && { next: best.next, shift: best.shift };
  };

  const stripHeads = heads
    .filter((h) => h.standsAlone)
    .sort((a, b) => a.tl[1] - b.tl[1] || a.tl[0] - b.tl[0]);
  const strips: { column: number; cards: Placed[] }[][] = [];
  const links = new Set<string>();
  for (const sh of stripHeads) {
    const lines: { column: number; cards: Placed[] }[] = [];
    let h: Placed | undefined = sh;
    let column = 0;
    while (h) {
      used.add(h);
      lines.push({ column, cards: lineFrom(h) });
      const b = below(h, column);
      if (!b) break;
      links.add(pairKey(h.track, b.next.track));
      column += b.shift;
      h = b.next;
    }
    strips.push(lines);
  }

  // The buffer: the entry text's hidden lines, then the strips, one after another with a blank line
  // between, two spaces per U of indent.
  const textLines: string[] = prev.hidden ? prev.hidden.split("\n") : [];
  const spans: CardSpan[] = [];
  const lineCards: LineCards[] = [];
  const skippedLines: SkippedLine[] = [];
  const unknownCards: UnknownCard[] = [];
  for (const lines of strips) {
    if (textLines.length) textLines.push("");
    for (const l of lines) {
      const lineNo = textLines.length + 1;
      let t = "  ".repeat(l.column);
      for (const c of l.cards) {
        spans.push({ track: c.track, span: { line: lineNo, start: t.length, end: t.length + c.notation.length } });
        t += c.notation;
        if (c.unknown) unknownCards.push(c.unknown);
      }
      textLines.push(t);
      lineCards.push({ line: lineNo, tracks: l.cards.map((c) => c.track) });
      const reason = skipReason(l.cards);
      if (reason) skippedLines.push({ line: lineNo, reason });
    }
  }
  const text = textLines.join("\n");
  const version = text === prev.text ? prev.version : prev.version + 1;

  const joins = new Set<string>();
  for (const [l, r] of rightOf) joins.add(pairKey(l.track, r.track));

  return {
    state: { joins, links, hidden: prev.hidden, version, text },
    output: { version, text, map: { version, cards: spans, lines: lineCards }, skippedLines, unknownCards },
  };
}
