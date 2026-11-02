import type {
  CardKey,
  CardSpan,
  DetachedLine,
  Handwriting,
  Layout,
  LineCards,
  Mismatch,
  Place,
  Pose,
  ReaderSettings,
  ReaderState,
  SkippedLine,
  SkipReason,
  StandIn,
  StepInput,
  StepResult,
  StripSlot,
  TableCard,
  UnknownCard,
  VirtualCard,
} from "./types.ts";
import { hiddenLines, importedNames } from "./entry.ts";
import { shortestLength, STANDS_ALONE, textStrips } from "./program.ts";

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
  placeStillS: 0.4,
  placeMakeMm: 10,
  placeMakeDeg: 15,
  placeKeepMm: 15,
  placeKeepDeg: 20,
  valueGuideLength: 4,
};

/**
 * The reader before any table state, starting from the project's entry text (there's no prelude).
 * Each strip with a `@table` position becomes stand-ins on its grid. Hidden strips, and for now
 * `auto` ones (#157), are kept exactly as written.
 */
export function initialState(entryText = ""): ReaderState {
  const slots: StripSlot[] = [];
  const standIns: StandIn[] = [];
  for (const strip of textStrips(entryText)) {
    const place = strip.table;
    if (typeof place === "string") {
      slots.push({ verbatim: strip.verbatim });
      continue;
    }
    let head: string | undefined;
    strip.lines.forEach((line, row) => {
      let along = line.column;
      for (const card of line.cards) {
        const id = `s${standIns.length + 1}`;
        head ??= id;
        const length = shortestLength(card);
        standIns.push({ id, card, length, strip: place, along, row });
        along += length;
      }
    });
    slots.push({ head: head!, doc: strip.doc });
  }
  return {
    entryText,
    joins: new Set(),
    links: new Set(),
    slots,
    standIns,
    poses: new Map(),
    places: new Map(),
    version: 0,
    text: entryText,
    cards: [],
  };
}

type Vec = readonly [number, number];

/** A card on the coding space, real or a stand-in, with where it lies. */
interface Placed {
  key: CardKey;
  track?: number;
  standIn?: string;
  angle: number;
  centre: Vec;
  /** Along the card and down it. */
  u: Vec;
  v: Vec;
  /** Its top-left corner. */
  tl: Vec;
  lengthMm: number | undefined;
  notation: string;
  /** Which card it is, by marker, for mismatches and fastening. */
  kind: string;
  standsAlone: boolean;
  skip?: SkipReason;
  unknown?: UnknownCard;
}

/** Handwriting can't hold brackets, so they're dropped from a read (#111). */
const BRACKETS = /[{}[\]()]/g;

const pairKey = (a: CardKey, b: CardKey): string => `${a}>${b}`;
const hypot = (p: Vec, q: Vec): number => Math.hypot(p[0] - q[0], p[1] - q[1]);
/** The smallest signed difference b − a between two angles, in degrees. */
const angleDiff = (a: number, b: number): number => ((((b - a) % 360) + 540) % 360) - 180;
const unit = (deg: number): Vec => [Math.cos((deg * Math.PI) / 180), Math.sin((deg * Math.PI) / 180)];
const add = (p: Vec, q: Vec, k = 1): Vec => [p[0] + k * q[0], p[1] + k * q[1]];

/** A card's frame from its top-left corner and angle. */
function frame(tl: Vec, angle: number, s: ReaderSettings): Pick<Placed, "tl" | "u" | "v" | "centre" | "angle"> {
  const u = unit(angle);
  const v: Vec = [-u[1], u[0]];
  return { tl, u, v, angle, centre: add(add(tl, u, s.markerAlongMm), v, s.markerDownMm) };
}

function inRect(x: number, y: number, r: Layout["codingSpace"]): boolean {
  return x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;
}

function counts(c: TableCard, layout: Layout): boolean {
  if (!inRect(c.x, c.y, layout.codingSpace)) return false;
  return !layout.corners.some((k) => Math.hypot(c.x - k.x, c.y - k.y) < k.radius);
}

/**
 * What a card writes as and its length in U (unknown for a marker the table doesn't know), which
 * card it is by marker, why its line is skipped, if it is, and what makes it an unknown card, if it is one.
 */
interface CardText {
  notation: string;
  kind: string;
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

/** A library card by marker, whatever name a program imports its library as. */
const libraryKind = (card: string, pkg: string, name: string): string =>
  // A library's [define(setup)] names the program's own function, so it takes no namespace.
  card === "define" ? `[define(${name})]` : `[${card}(${pkg}.${name})]`;

/**
 * Which card a card written in a program text is, by marker: handwriting doesn't count, and a
 * library card is known by its package, whatever the text imports it as. `packages` maps each local
 * name to its package.
 */
function textKind(card: string, packages: ReadonlyMap<string, string>): string {
  return card
    .replace(/\{[^}]*\}/g, "{}")
    .replace(/\(([^().]+)\.([^()]*)\)/g, (m, local: string, name: string) => {
      const pkg = packages.get(local);
      return pkg === undefined ? m : `(${pkg}.${name})`;
    });
}

/**
 * What a card writes as, or undefined for a marker that isn't a card (a page). `imports` maps each
 * imported package to its local name.
 */
function cardOf(c: TableCard, input: StepInput, imports: ReadonlyMap<string, string>): CardText | undefined {
  const lang = input.languageMarkers.get(c.marker);
  if (lang) {
    if (!lang.card.includes("{}")) return { notation: lang.card, kind: lang.card, length: lang.length };
    const hw = handwriting(c.hw);
    return { notation: lang.card.replace("{}", `{${hw.text}}`), kind: lang.card, length: lang.length, skip: hw.skip };
  }
  const entry = input.lockfile.get(c.marker);
  if (entry?.kind === "page") return undefined;
  if (!entry) {
    // The table can't write it as text, nor knows its length.
    return { notation: "", kind: `?${c.marker}`, skip: "unknown card", unknown: {} };
  }
  const kind = libraryKind(entry.card, entry.package, entry.name);
  const local = imports.get(entry.package);
  if (local === undefined) {
    // Its kind is known, so it still takes its place in the line's structure (a [define{}] still
    // starts a strip), with empty braces.
    return {
      notation: `[${entry.card}{}]`,
      kind,
      length: entry.length,
      skip: "unknown card",
      unknown: { package: entry.package },
    };
  }
  const name = entry.card === "define" ? entry.name : `${local}.${entry.name}`;
  return { notation: `[${entry.card}(${name})]`, kind, length: entry.length };
}

/**
 * A line with several unread cards is skipped for the reason that lasts longest: an unknown card
 * stays until the program changes, and a card not read yet only until its read arrives.
 */
const SKIP_ORDER: readonly SkipReason[] = ["unknown card", "read error", "connection error", "not read yet"];

function skipReason(cards: readonly Placed[]): SkipReason | undefined {
  return SKIP_ORDER.find((r) => cards.some((c) => c.skip === r));
}

/** Where a strip lies: its first card's top-left corner from the coding space's top-left, and its turn. */
function tablePosition(head: Placed, layout: Layout): string {
  const x = Math.round(head.tl[0] - layout.codingSpace.x);
  const y = Math.round(head.tl[1] - layout.codingSpace.y);
  const turn = Math.round(angleDiff(0, head.angle)) || 0;
  return `@table ${x} ${y} ${turn}`;
}

const TABLE_TAG = /@table\b[^\n]*?(?=\s*\*\/|\s*$)/m;
const TABLE_POSITIONS = /@table -?\d+ -?\d+ -?\d+/g;
const withoutTableTags = (text: string): string => text.replace(TABLE_POSITIONS, "@table");

/** A virtual card that isn't part of the program: a page's guide, or a value guide. */
interface Guide {
  id: string;
  kind: "guide" | "value";
  /** The card it asks for, or the value's name. */
  text: string;
  /** Which card it asks for, by marker (page guides only). */
  cardKind?: string;
  length: number;
  at: ReturnType<typeof frame>;
}

/** Something a real card can take the place of, where its marker would be. */
interface Spot {
  id: string;
  centre: Vec;
  angle: number;
}

/**
 * Which real cards take which places: each card at most one, each place at most one card, the
 * places already held first and then the nearest. `holds` says whether the card may hold the place.
 */
function assignPlaces(
  spots: readonly Spot[],
  cards: readonly Placed[],
  holds: (spot: Spot, card: Placed, distance: number, turn: number) => { ok: boolean; held: boolean },
): Map<string, Placed> {
  const candidates: { spot: Spot; card: Placed; held: boolean; distance: number }[] = [];
  for (const spot of spots) {
    for (const card of cards) {
      const distance = hypot(spot.centre, card.centre);
      const turn = Math.abs(angleDiff(spot.angle, card.angle));
      const { ok, held } = holds(spot, card, distance, turn);
      if (ok) candidates.push({ spot, card, held, distance });
    }
  }
  candidates.sort((a, b) => Number(b.held) - Number(a.held) || a.distance - b.distance);
  const taken = new Map<string, Placed>();
  const busy = new Set<Placed>();
  for (const c of candidates) {
    if (taken.has(c.spot.id) || busy.has(c.card)) continue;
    taken.set(c.spot.id, c.card);
    busy.add(c.card);
  }
  return taken;
}

export function step(prev: ReaderState, input: StepInput): StepResult {
  const s: ReaderSettings = { ...defaultSettings, ...input.settings };
  const now = input.now ?? input.table.t;
  const cs = input.layout.codingSpace;
  const origin: Vec = [cs.x, cs.y];

  const imports = importedNames(hiddenLines(prev.entryText));
  const real: Placed[] = [];
  const poses = new Map<number, Pose>();
  for (const c of input.table.cards) {
    if (!counts(c, input.layout)) continue;
    const k = cardOf(c, input, imports);
    if (!k) continue;
    const u = unit(c.angle);
    const v: Vec = [-u[1], u[0]];
    const tl = add(add([c.x, c.y], u, -s.markerAlongMm), v, -s.markerDownMm);
    real.push({
      key: `t${c.track}`,
      track: c.track,
      ...frame(tl, c.angle, s),
      centre: [c.x, c.y],
      lengthMm: k.length === undefined ? undefined : k.length * s.unitMm,
      notation: k.notation,
      kind: k.kind,
      skip: k.skip,
      unknown: k.unknown && { track: c.track, marker: c.marker, ...k.unknown },
      standsAlone: STANDS_ALONE.test(k.notation),
    });
    // A card is still while the vision service reports it in the same pose: it sends a move only
    // past its dead band.
    const p = prev.poses.get(c.track);
    const same = p && p.x === c.x && p.y === c.y && p.angle === c.angle;
    poses.set(c.track, { x: c.x, y: c.y, angle: c.angle, since: same ? p.since : now });
  }
  const stillSince = (c: Placed): number => poses.get(c.track!)!.since;
  const still = (c: Placed): boolean => now - stillSince(c) >= s.placeStillS - 1e-9;
  const canTake = (distance: number, turn: number): boolean => distance <= s.placeMakeMm && turn <= s.placeMakeDeg;

  // Stand-ins: a real card lying still in one's place replaces it, for good.
  const standInAt = (si: StandIn): ReturnType<typeof frame> => {
    const head = add(origin, [si.strip.x, si.strip.y]);
    const u = unit(si.strip.turn);
    const v: Vec = [-u[1], u[0]];
    return frame(add(add(head, u, si.along * s.unitMm), v, si.row * s.unitMm), si.strip.turn, s);
  };
  const standIns = prev.standIns.map((si) => ({ si, at: standInAt(si) }));
  const replaced = assignPlaces(
    standIns.map(({ si, at }) => ({ id: si.id, centre: at.centre, angle: at.angle })),
    real,
    (_, card, distance, turn) => ({ ok: still(card) && canTake(distance, turn), held: false }),
  );
  const remaining = standIns.filter(({ si }) => !replaced.has(si.id));
  const cards: Placed[] = [
    ...real,
    ...remaining.map(({ si, at }) => ({
      key: si.id,
      standIn: si.id,
      ...at,
      lengthMm: si.length * s.unitMm,
      notation: si.card,
      kind: si.card,
      standsAlone: STANDS_ALONE.test(si.card),
    })),
  ];
  const renamed = (key: CardKey): CardKey => replaced.get(key)?.key ?? key;

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
      const held = prev.joins.has(pairKey(left.key, right.key));
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
      const spot = add(add(h.tl, h.v, s.unitMm), h.u, shift * s.unitMm);
      for (const o of heads) {
        if (o === h || o.standsAlone || used.has(o)) continue;
        if (Math.abs(angleDiff(h.angle, o.angle)) >= s.maxAngleDeg) continue;
        const held = prev.links.has(pairKey(h.key, o.key));
        const distance = hypot(spot, o.tl);
        if (distance > (held ? s.lineKeepMm : s.lineMakeMm)) continue;
        const better = !best || (held && !best.held) || (held === best.held && distance < best.distance);
        if (better) best = { next: o, shift, held, distance };
      }
    }
    return best && { next: best.next, shift: best.shift };
  };

  // Strip order is stable: a strip keeps its place while its head stays (a real card that replaces
  // a stand-in head keeps it, with its doc comment), and new strips go at the end (several new in
  // one step go top to bottom, then left to right). Strips kept as written always stay.
  const headOf = new Map(heads.filter((h) => h.standsAlone).map((h) => [h.key, h]));
  // A head laid on a stand-in head counted as a new strip until it took the place: it now takes
  // the stand-in's strip instead.
  const takers = new Set([...replaced.values()].map((c) => c.key));
  const slots: StripSlot[] = prev.slots
    .filter((slot) => !("head" in slot) || !takers.has(slot.head))
    .map((slot) => ("head" in slot ? { ...slot, head: renamed(slot.head) } : slot))
    .filter((slot) => !("head" in slot) || headOf.has(slot.head));
  const inSlots = new Set(slots.flatMap((slot) => ("head" in slot ? [slot.head] : [])));
  const added = [...headOf.values()]
    .filter((h) => !inSlots.has(h.key))
    .sort((a, b) => a.tl[1] - b.tl[1] || a.tl[0] - b.tl[0]);
  slots.push(...added.map((h) => ({ head: h.key })));
  const strips: { slot: StripSlot; lines: { column: number; cards: Placed[] }[] }[] = [];
  const links = new Set<string>();
  for (const slot of slots) {
    if (!("head" in slot)) {
      strips.push({ slot, lines: [] });
      continue;
    }
    const lines: { column: number; cards: Placed[] }[] = [];
    let h: Placed | undefined = headOf.get(slot.head)!;
    let column = 0;
    while (h) {
      used.add(h);
      lines.push({ column, cards: lineFrom(h) });
      const b = below(h, column);
      if (!b) break;
      links.add(pairKey(h.key, b.next.key));
      column += b.shift;
      h = b.next;
    }
    strips.push({ slot, lines });
  }
  const stripHeads = strips.flatMap(({ lines }) => (lines.length ? [lines[0].cards[0]] : []));

  // The buffer: the entry text's hidden lines as written, then the strips in their order, with a
  // blank line between and two spaces per U of indent.
  const hidden = hiddenLines(prev.entryText);
  const textLines: string[] = hidden ? hidden.split("\n") : [];
  const spans: CardSpan[] = [];
  const lineCards: LineCards[] = [];
  const skippedLines: SkippedLine[] = [];
  const unknownCards: UnknownCard[] = [];
  for (const { slot, lines } of strips) {
    if (textLines.length) textLines.push("");
    if ("verbatim" in slot) {
      textLines.push(...slot.verbatim.split("\n"));
      continue;
    }
    const position = tablePosition(lines[0].cards[0], input.layout);
    textLines.push(...(slot.doc ? slot.doc.replace(TABLE_TAG, position) : `/** ${position} */`).split("\n"));
    for (const l of lines) {
      const lineNo = textLines.length + 1;
      let t = "  ".repeat(l.column);
      for (const c of l.cards) {
        const span = { line: lineNo, start: t.length, end: t.length + c.notation.length };
        spans.push(c.track === undefined ? { standIn: c.standIn!, span } : { track: c.track, span });
        t += c.notation;
        if (c.unknown) unknownCards.push(c.unknown);
      }
      textLines.push(t);
      lineCards.push({ line: lineNo, ...idsOf(l.cards) });
      const reason = skipReason(l.cards);
      if (reason) skippedLines.push({ line: lineNo, reason });
    }
  }
  const text = textLines.join("\n");

  // Detached lines: every line whose head no strip reached, top to bottom, then left to right. They
  // stay out of the buffer.
  const detached: DetachedLine[] = heads
    .filter((h) => !used.has(h))
    .sort((a, b) => a.tl[1] - b.tl[1] || a.tl[0] - b.tl[0])
    .map((h) => {
      const line = lineFrom(h);
      return { ...idsOf(line), text: line.map((c) => c.notation).join("") };
    });
  const version = text === prev.text ? prev.version : prev.version + 1;
  const placementOnly = text !== prev.text && withoutTableTags(text) === withoutTableTags(prev.text);

  const joins = new Set<string>();
  for (const [l, r] of rightOf) joins.add(pairKey(l.key, r.key));

  // Guides: the current page's strips, fastened to the real strip that starts with the same card,
  // and the values call cards expect.
  const guides: Guide[] = [];
  const sources = input.guideSources ?? {};
  if (sources.page !== undefined) {
    const packages = new Map([...importedNames(hiddenLines(sources.page))].map(([pkg, local]) => [local, pkg]));
    textStrips(sources.page).forEach((strip, n) => {
      if (strip.table === "hidden") return;
      const pageHead = strip.lines[0].cards[0];
      let start: { tl: Vec; angle: number; withHead: boolean } | undefined;
      if (strip.table === "auto") {
        // With no matching real strip, auto placement belongs to #157: the strip shows no guides.
        const kind = textKind(pageHead, packages);
        const handwritten = pageHead.includes("{");
        const head = stripHeads.find(
          (h) =>
            h.track !== undefined &&
            h.kind === kind &&
            (!handwritten || h.notation.toLowerCase() === pageHead.toLowerCase()),
        );
        if (head) start = { tl: head.tl, angle: head.angle, withHead: false };
      } else {
        start = { tl: add(origin, [strip.table.x, strip.table.y]), angle: strip.table.turn, withHead: true };
      }
      if (!start) return;
      const u = unit(start.angle);
      const v: Vec = [-u[1], u[0]];
      strip.lines.forEach((line, row) => {
        let along = line.column;
        line.cards.forEach((card, i) => {
          const length = shortestLength(card);
          if (start.withHead || row > 0 || i > 0) {
            guides.push({
              id: `g${n + 1}.${row + 1}.${i + 1}`,
              kind: "guide",
              text: card,
              cardKind: textKind(card, packages),
              length,
              at: frame(add(add(start.tl, u, along * s.unitMm), v, row * s.unitMm), start.angle, s),
            });
          }
          along += length;
        });
      });
    });
  }
  for (const source of sources.values ?? []) {
    // Text positions are the buffer's from the version the checker checked.
    if (source.version !== prev.version) continue;
    const span = prev.cards.find((c) => c.span.line === source.at.line && c.span.start === source.at.start);
    if (!span) continue;
    const key = renamed("track" in span ? `t${span.track}` : span.standIn);
    const call = cards.find((c) => c.key === key);
    if (!call || call.lengthMm === undefined) continue;
    let along = call.lengthMm;
    source.values.forEach((value, i) => {
      guides.push({
        id: `v.${key}.${i + 1}`,
        kind: "value",
        text: value,
        length: s.valueGuideLength,
        at: frame(add(call.tl, call.u, along), call.angle, s),
      });
      along += s.valueGuideLength * s.unitMm;
    });
  }

  // Places on guides: taken by a card lying still within reach, and kept until it moves past the
  // keep limits.
  const held = assignPlaces(
    guides.map((g) => ({ id: g.id, centre: g.at.centre, angle: g.at.angle })),
    real,
    (spot, card, distance, turn) => {
      if (prev.places.get(spot.id) === card.track) {
        return { ok: distance <= s.placeKeepMm && turn <= s.placeKeepDeg, held: true };
      }
      return { ok: still(card) && canTake(distance, turn), held: false };
    },
  );
  const places: Place[] = [];
  const mismatches: Mismatch[] = [];
  for (const g of guides) {
    const card = held.get(g.id);
    if (!card) continue;
    places.push({ track: card.track!, virtual: g.id });
    // A mismatch is judged by marker only, and value guides never give one.
    if (g.kind === "guide" && card.kind !== g.cardKind) {
      mismatches.push({ track: card.track!, virtual: g.id, card: g.text });
    }
  }

  const virtualCards: VirtualCard[] = [
    ...remaining.map(({ si, at }) => ({
      id: si.id,
      kind: "stand-in" as const,
      card: si.card,
      length: si.length,
      x: at.centre[0],
      y: at.centre[1],
      angle: at.angle,
    })),
    ...guides
      .filter((g) => !held.has(g.id))
      .map((g) => {
        const where = { length: g.length, x: g.at.centre[0], y: g.at.centre[1], angle: g.at.angle };
        return g.kind === "value"
          ? { id: g.id, kind: "value" as const, value: g.text, ...where }
          : { id: g.id, kind: "guide" as const, card: g.text, ...where };
      }),
  ];

  // A card that has stopped within reach of a free virtual card takes its place once it has lain
  // still long enough: say when, so the table app steps again then.
  const free: Spot[] = [
    ...remaining.map(({ si, at }) => ({ id: si.id, centre: at.centre, angle: at.angle })),
    ...guides.filter((g) => !held.has(g.id)).map((g) => ({ id: g.id, centre: g.at.centre, angle: g.at.angle })),
  ];
  const busy = new Set(held.values());
  let wakeAt: number | undefined;
  for (const card of real) {
    if (still(card) || busy.has(card)) continue;
    const near = free.some((f) => canTake(hypot(f.centre, card.centre), Math.abs(angleDiff(f.angle, card.angle))));
    if (near) wakeAt = Math.min(wakeAt ?? Infinity, stillSince(card) + s.placeStillS);
  }

  const output = {
    version,
    text,
    map: { version, cards: spans, lines: lineCards },
    stripHeads: stripHeads.flatMap((h) => (h.track === undefined ? [] : [h.track])),
    detached,
    placementOnly,
    skippedLines,
    unknownCards,
    virtualCards,
    places,
    mismatches,
    ...(wakeAt === undefined ? {} : { wakeAt }),
  };
  return {
    state: {
      entryText: prev.entryText,
      joins,
      links,
      slots: strips.map(({ slot }) => slot),
      standIns: remaining.map(({ si }) => si),
      poses,
      places: new Map([...held].map(([id, card]) => [id, card.track!])),
      version,
      text,
      cards: spans,
    },
    output,
  };
}

/** A line's real cards by track, and its stand-ins if it has any. */
function idsOf(cards: readonly Placed[]): { tracks: number[]; standIns?: string[] } {
  const tracks = cards.flatMap((c) => (c.track === undefined ? [] : [c.track]));
  const standIns = cards.flatMap((c) => (c.standIn === undefined ? [] : [c.standIn]));
  return standIns.length ? { tracks, standIns } : { tracks };
}
