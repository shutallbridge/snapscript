// Card feedback (#195, the card feedback prototype's look, #129): which card faces to light red, each
// line's gutter marks and badges, the bottom status bar's errors, and where `print` output goes. All
// in table mm, from where the cards lie now. Nothing projected may cover a card's marker zone: the
// table view cuts `keepClear` out of everything it draws for this.
import type { CardMap, DetachedLine, TableCard, TableState } from "@snapscript/table-reader";
import type { CardRef, SceneError } from "./session.ts";

/** A rectangle on the table: its top-left corner at (x, y) in table mm, turned `angle` degrees about it, `width` along and `height` across. */
export interface Quad {
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
}

/** A card the feedback lights: its face (the card less its marker zone), filled red with a red edge. */
export interface LitCard {
  card: CardRef;
  face: Quad;
}

/**
 * A line's gutter, drawn left of the line's first card (`at`), from the line outward: its dot, then
 * its errors' badges. `ok` is a recognised strip head; `skipped` a skipped or detached line.
 */
export interface Gutter {
  track: number;
  at: Quad;
  dot: "ok" | "skipped" | null;
  badges: string[];
}

/** `print` output: the newest text a `[call(print)]` card printed, and the room it may take right of its line. */
export interface PrintOutput {
  text: string;
  at: Quad;
}

export interface Feedback {
  lit: LitCard[];
  gutters: Gutter[];
  /** The bottom status bar: each error's badge and full message, in program order. */
  errorBar: { badge: string; text: string }[];
  prints: PrintOutput[];
  /** Every card's marker zone: nothing the feedback draws may cover one. */
  keepClear: Quad[];
}

/** The look's sizes, in mm (#129): the decided starting values. */
export interface FeedbackSettings {
  unitMm: number;
  markerZoneMm: number;
  /** A gutter's gap to its line's first card; print output's gap after its line's last card. */
  gapMm: number;
  /** At most this much room for print output. */
  printMaxMm: number;
}

export const defaultFeedbackSettings: FeedbackSettings = { unitMm: 30, markerZoneMm: 17, gapMm: 6, printMaxMm: 720 };

export interface FeedbackInput {
  /** The table as it is now, for where each card lies. */
  state: TableState | null;
  /** The buffer as it is now, for which line each card is on. */
  map: CardMap;
  /** A card's length in U, by its marker. */
  lengthOf(marker: number): number;
  stripHeads: readonly number[];
  detached: readonly DetachedLine[];
  /** The buffer's skipped lines, as the checker gives them. */
  skippedLines: readonly number[];
  errors: readonly SceneError[];
  /** The shown run's print output, by the cards that printed it. */
  prints: readonly { text: string; cards: readonly CardRef[] }[];
  settings?: Partial<FeedbackSettings>;
}

type Vec = [number, number];

export function feedback(input: FeedbackInput): Feedback {
  const s = { ...defaultFeedbackSettings, ...input.settings };
  const H = s.unitMm;
  const poses = new Map<number, TableCard>((input.state?.cards ?? []).map((c) => [c.track, c]));
  const axes = (angle: number): [Vec, Vec] => {
    const a = (angle * Math.PI) / 180;
    return [
      [Math.cos(a), Math.sin(a)],
      [-Math.sin(a), Math.cos(a)],
    ];
  };
  /** A quad `along` mm along a card from its left end, `width` long, all the way across. */
  const onCard = (c: TableCard, along: number, width: number): Quad => {
    const [u, v] = axes(c.angle);
    const tl: Vec = [c.x - (s.markerZoneMm / 2) * u[0] - (H / 2) * v[0], c.y - (s.markerZoneMm / 2) * u[1] - (H / 2) * v[1]];
    return { x: tl[0] + along * u[0], y: tl[1] + along * u[1], angle: c.angle, width, height: H };
  };
  const lengthMm = (c: TableCard) => input.lengthOf(c.marker) * s.unitMm;

  const lineOf = new Map<number, { line: number; column: number }>();
  for (const c of input.map.cards) if ("track" in c) lineOf.set(c.track, { line: c.span.line, column: c.span.start });
  const lineTracks = new Map(input.map.lines.map((l) => [l.line, l.tracks]));
  const tracksOf = (cards: readonly CardRef[]) => cards.flatMap((c) => ("track" in c ? [c.track] : []));

  // Each error belongs to the line of its first card on the table now. Badges go in program order:
  // lines top to bottom, then along each line. An error with no such card comes last.
  const placed = input.errors.map((error, i) => {
    const track = tracksOf(error.cards).find((t) => lineOf.has(t) && poses.has(lineTracks.get(lineOf.get(t)!.line)![0]!));
    if (track === undefined) return { error, i, line: null, head: null, column: 0 };
    const { line, column } = lineOf.get(track)!;
    return { error, i, line, head: poses.get(lineTracks.get(line)![0]!)!, column };
  });
  placed.sort((a, b) => {
    if (!a.head || !b.head) return (a.head ? 0 : 1) - (b.head ? 0 : 1) || a.i - b.i;
    return a.head.y - b.head.y || a.head.x - b.head.x || a.column - b.column || a.i - b.i;
  });
  const badged = placed.map((p, i) => ({ ...p, badge: `E${i + 1}` }));
  const badgeOfLine = new Map<number, string>();
  for (const b of badged) if (b.line !== null && !badgeOfLine.has(b.line)) badgeOfLine.set(b.line, b.badge);

  const errorBar = badged.map(({ error, badge }) => {
    let message = error.message;
    if (error.followsFrom) {
      const from = badgeOfLine.get(error.followsFrom.line);
      message = `${error.followsFrom.name} is set on a line that's skipped${from ? ` (${from})` : ""}`;
    }
    return { badge, text: error.kind ? `${error.kind}: ${message}` : message };
  });

  const lit: LitCard[] = [];
  const litTracks = new Set<number>();
  for (const { error } of badged)
    for (const t of tracksOf(error.cards)) {
      const c = poses.get(t);
      if (!c || litTracks.has(t)) continue;
      litTracks.add(t);
      lit.push({ card: { track: t }, face: onCard(c, s.markerZoneMm, lengthMm(c) - s.markerZoneMm) });
    }

  const gutters: Gutter[] = [];
  const skipped = new Set(input.skippedLines);
  for (const { line, tracks } of input.map.lines) {
    const head = poses.get(tracks[0]!);
    if (!head) continue;
    const badges = badged.filter((b) => b.line === line).map((b) => b.badge);
    const dot = skipped.has(line) ? "skipped" : input.stripHeads.includes(head.track) ? "ok" : null;
    if (dot || badges.length) gutters.push({ track: head.track, at: onCard(head, 0, lengthMm(head)), dot, badges });
  }
  for (const d of input.detached) {
    const head = poses.get(d.tracks[0]!);
    if (head) gutters.push({ track: head.track, at: onCard(head, 0, lengthMm(head)), dot: "skipped", badges: [] });
  }

  const keepClear = [...poses.values()].map((c) => onCard(c, 0, s.markerZoneMm));

  // Print output starts after its line's last card and runs on until the first marker zone in its way.
  const prints: PrintOutput[] = [];
  for (const p of input.prints) {
    const at = tracksOf(p.cards).map((t) => lineOf.get(t)).find((l) => l !== undefined);
    const last = at && poses.get(lineTracks.get(at.line)!.at(-1)!);
    if (!last) continue;
    const start = lengthMm(last) + s.gapMm;
    const room = roomAhead(onCard(last, 0, 0), start, keepClear, H, s.printMaxMm);
    if (room > 0) prints.push({ text: p.text, at: onCard(last, start, room) });
  }

  return { lit, gutters, errorBar, prints, keepClear };
}

/**
 * How far a band `height` across, from `start` mm along a frame's left end, runs before it meets a
 * quad: each quad is taken by its extent in the frame, so a turned one blocks a little early.
 */
function roomAhead(frame: Quad, start: number, quads: readonly Quad[], height: number, max: number): number {
  const a = (frame.angle * Math.PI) / 180;
  const u: Vec = [Math.cos(a), Math.sin(a)];
  const v: Vec = [-u[1], u[0]];
  let room = max;
  for (const q of quads) {
    const b = (q.angle * Math.PI) / 180;
    const qu: Vec = [Math.cos(b), Math.sin(b)];
    const qv: Vec = [-qu[1], qu[0]];
    const pts = [
      [0, 0],
      [q.width, 0],
      [q.width, q.height],
      [0, q.height],
    ].map(([i, j]): Vec => [q.x + i! * qu[0] + j! * qv[0] - frame.x, q.y + i! * qu[1] + j! * qv[1] - frame.y]);
    const along = pts.map((p) => p[0] * u[0] + p[1] * u[1]);
    const across = pts.map((p) => p[0] * v[0] + p[1] * v[1]);
    if (Math.max(...across) <= 0 || Math.min(...across) >= height || Math.max(...along) <= start) continue;
    room = Math.min(room, Math.max(0, Math.min(...along) - start));
  }
  return room;
}
