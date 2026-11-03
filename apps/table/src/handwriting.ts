// Handwriting at the table (#196, #110, #147): which handwritten cards the table is still waiting
// to read, what each card's read-back shows, and the one status message when the internet is gone.
// The session asks it whether a new run may start yet; the scene draws its read-back.
import { whiteboardOf } from "@snapscript/faces";
import type { CardMap, Handwriting, LanguageMarkers, SkippedLine, TableCard, TableState } from "@snapscript/table-reader";
import { onSheet, type Quad } from "./pose.ts";
import type { CardRef, SceneError } from "./session.ts";

/** The decided starting values (#181), in seconds, for the rig to tune. */
export interface HandwritingSettings {
  /** A new run waits this long for a card not read yet, then starts with its line skipped. */
  waitS: number;
  /** Read-back shows this long after each new read. */
  flashS: number;
}

export const defaultHandwritingSettings: HandwritingSettings = { waitS: 5, flashS: 3 };

/** The one status message while handwriting can't reach the cloud. */
export const NO_INTERNET = "No internet: new handwriting can't be read. Printed cards still work.";

/** What the reader saw on a card, or `…` while it's not read yet, in cyan on its whiteboard (`at`, in table mm). */
export interface ReadBack {
  track: number;
  text: string;
  at: Quad;
}

export interface HandwritingView {
  readBack: ReadBack[];
  /** The top status bar's message, if any. */
  status: string | null;
}

export interface HandwritingInput {
  state: TableState | null;
  map: CardMap;
  errors: readonly SceneError[];
  /** The Debug setting: read-back on every card. */
  readBackAll: boolean;
  lengthOf(marker: number): number;
  now: number;
}

/** A card has no text yet: nothing read, or being read for the first time. */
const unread = (hw: Handwriting | undefined): boolean =>
  !hw || hw.state === "not read yet" || (hw.state === "reading" && hw.text === undefined);

/** A card's text as last read ("" for a blank), or null when it has none. A card being read again keeps its text. */
const textOf = (hw: Handwriting | undefined): string | null =>
  hw?.state === "read" || hw?.state === "reading" ? (hw.text ?? null) : hw?.state === "blank" ? "" : null;

/**
 * Errors that show read-back on the cards they blame, as the handwriting may be misread: a
 * `SyntaxError` on what a card holds (not one on where it sits), a `NameError`, an `AttributeError`.
 */
const misread = (e: SceneError): boolean =>
  e.kind === "NameError" || e.kind === "AttributeError" || (e.kind === "SyntaxError" && e.aboutCardText === true);

export interface HandwritingTracker {
  /** Takes the newest table state. */
  see(state: TableState, now: number): void;
  /** The cards a new run is waiting for: those of `lines` (the reader's skipped lines) not read yet, by track. */
  waitingTracks(map: CardMap, lines: readonly SkippedLine[]): number[];
  /** When a new run may start, waiting for `tracks`: now if none of them is still within its wait. */
  readyAt(tracks: readonly number[]): number;
  view(input: HandwritingInput): HandwritingView;
  /** When the read-back next changes by itself (a flash ends), or null. */
  wakeAt(now: number): number | null;
}

export function createHandwriting(languageMarkers: LanguageMarkers, settings?: Partial<HandwritingSettings>): HandwritingTracker {
  const s = { ...defaultHandwritingSettings, ...settings };
  /** Each handwritten card on the table: its text, since when it has waited unread, and when its flash ends. */
  const cards = new Map<number, { text: string | null; hw: Handwriting | undefined; since: number | null; flashUntil: number }>();
  const handwritten = (c: TableCard) => languageMarkers.get(c.marker)?.card.includes("{}") ?? false;

  return {
    see(state, now) {
      const seen = new Set<number>();
      for (const c of state.cards) {
        if (!handwritten(c)) continue;
        seen.add(c.track);
        const card = cards.get(c.track) ?? { text: null, hw: undefined, since: null, flashUntil: -Infinity };
        const text = textOf(c.hw);
        if (text && text !== card.text) card.flashUntil = now + s.flashS;
        card.text = text;
        card.hw = c.hw;
        card.since = unread(c.hw) ? (card.since ?? now) : null;
        cards.set(c.track, card);
      }
      for (const track of cards.keys()) if (!seen.has(track)) cards.delete(track);
    },

    waitingTracks(map, lines) {
      const waiting = new Set(lines.filter((l) => l.reason === "not read yet").map((l) => l.line));
      return map.lines.filter((l) => waiting.has(l.line)).flatMap((l) => l.tracks.filter((t) => cards.get(t)?.since != null));
    },

    readyAt(tracks) {
      return Math.max(-Infinity, ...tracks.map((t) => (cards.get(t)?.since ?? -Infinity) + s.waitS));
    },

    view({ state, map, errors, readBackAll, lengthOf, now }) {
      const inBuffer = new Set(map.cards.flatMap((c) => ("track" in c ? [c.track] : [])));
      const tracksOf = (refs: readonly CardRef[]) => refs.flatMap((r) => ("track" in r ? [r.track] : []));
      const blamed = new Set(errors.flatMap((e) => (misread(e) ? [...tracksOf(e.cards), ...tracksOf(e.suggestion ?? [])] : [])));
      const readBack: ReadBack[] = [];
      let offline = false;
      for (const c of state?.cards ?? []) {
        const card = cards.get(c.track);
        if (!card || !inBuffer.has(c.track)) continue;
        if (card.hw?.state === "connection error") offline = true;
        const text = card.since !== null ? "…" : card.text;
        if (!text) continue;
        if (card.since === null && !readBackAll && card.flashUntil <= now && !blamed.has(c.track)) continue;
        const at = whiteboardOn(c, languageMarkers.get(c.marker)!.card, lengthOf(c.marker));
        if (at) readBack.push({ track: c.track, text, at });
      }
      return { readBack, status: offline ? NO_INTERNET : null };
    },

    wakeAt(now) {
      const at = Math.min(...[...cards.values()].map((c) => (c.flashUntil > now ? c.flashUntil : Infinity)));
      return at === Infinity ? null : at;
    },
  };
}

/** A card's whiteboard on the table, from its marker's centre and turn. */
function whiteboardOn(c: TableCard, notation: string, length: number): Quad | null {
  const wb = whiteboardOf(notation, length);
  return wb && onSheet(c, wb.x, wb.width, wb.y, wb.height);
}
