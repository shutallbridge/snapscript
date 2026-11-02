// The table session (#181 "The table app"): the main process's core, with no Electron in it. It
// takes events (table states, sketch messages, the clock) and gives the scene to draw and the
// commands for the sketch view. The Electron code around it only carries messages and draws.
import { check, type Span } from "@snapscript/checker";
import { offsetAt, type ErrorKind } from "@snapscript/core";
import type { RunError } from "@snapscript/runtime";
import { compile, nativeModulesOf, type NativeModuleFile } from "@snapscript/runtime/compiler";
import {
  defaultSettings as readerDefaults,
  initialState,
  step,
  type CardMap,
  type DetachedLine,
  type Layout,
  type Mismatch,
  type ReaderState,
  type SkippedLine,
  type TableState,
  type UnknownCard,
  type VirtualCard,
} from "@snapscript/table-reader";
import { createCalibration, type CalibrationResult, type CalibrationView, type VisionCommand } from "./calibration.ts";
import { createMenu, type MenuView } from "./menu.ts";
import { feedback, type Feedback } from "./feedback.ts";
import { createGuides, labelOf, type PageCut, type VirtualFace } from "./guides.ts";
import { createHandwriting, type HandwritingView } from "./handwriting.ts";
import { createHelpCorner, type HelpBox } from "./help.ts";
import type { Project } from "./project.ts";
import { defaultTableSettings, type TableSettings } from "./settings.ts";

/** What the session needs of a loaded project. */
export type SessionProject = Pick<Project, "entry" | "loader" | "lockfile" | "languageMarkers" | "cards" | "pages">;

/** The session's timings, in seconds: the decided starting values (#181), for the rig to tune. */
export interface SessionSettings {
  /** A run asked to stop runs its `[on(stop)]` handlers this long, then is killed. */
  stopGraceS: number;
  /** A run with no frame for this long (from its start, or its last frame) is frozen: the sketch process is killed. */
  frozenS: number;
  /** A new run waits this long for a card not read yet, then starts with its line skipped. */
  handwritingWaitS: number;
  /** Read-back shows this long after each new read. */
  readFlashS: number;
}

export const defaultSessionSettings: SessionSettings = {
  stopGraceS: 0.5,
  frozenS: 3,
  handwritingWaitS: 5,
  readFlashS: 3,
};

export interface SessionOptions {
  project: SessionProject;
  layout: Layout;
  settings?: Partial<SessionSettings>;
  /** The settings menu's settings, as kept in their file. */
  tableSettings?: TableSettings;
  /** The projector picture's width over its height, for calibration's markers. */
  projectorAspect?: number;
}

/**
 * What the sketch view says about a run: it drew a frame (the first shows it), or it stopped on an
 * error, which the runtime reports with the text position of the table card that led there. It
 * printed (the newest output of each `[call(print)]` card since it last said). And, from main once
 * a frozen sketch's process is killed, where the run was stuck.
 */
export type SketchMessage =
  | { type: "frame"; run: number }
  | { type: "error"; run: number; error: RunError }
  | { type: "print"; run: number; prints: { text: string; span: Span | null }[] }
  | { type: "stuck"; run: number; span: Span };

/** Something that happened, at `now` seconds on the app's clock. */
export type SessionEvent =
  | { type: "table"; now: number; state: TableState }
  | { type: "sketch"; now: number; message: SketchMessage }
  /** The clock: the host sends one at `wakeAt`, if not sooner. */
  | { type: "tick"; now: number }
  /** The windows changed (resized, or the table's size in mm came with a state): the last state is read again with them. */
  | { type: "layout"; now: number; layout: Layout }
  /** A key on the facilitator's keyboard, by its `KeyboardEvent.key` (",", "ArrowUp", "Enter", "Escape" …). */
  | { type: "key"; now: number; key: string }
  /** What the vision service said that isn't a table state: a calibration step's result. */
  | { type: "vision"; now: number; message: CalibrationResult };

/**
 * What the sketch view is told to do. Runs are numbered from 1. A run starts hidden; `show` swaps
 * it in for the one shown. `stop` runs its `[on(stop)]` handlers; `kill` then removes it. A frozen
 * run can't take commands: `kill process` kills the sketch process with every run in it, and the
 * next `start` goes to a new one.
 */
export type SketchCommand =
  | { type: "start"; run: number; js: string; natives: NativeModuleFile[] }
  | { type: "show"; run: number }
  | { type: "stop"; run: number }
  | { type: "kill"; run: number }
  | { type: "kill process" };

/** What an event gives. */
export interface SessionOutput {
  sketch: SketchCommand[];
  /** The settings, when the menu changed them: the host keeps them in their file and lays the windows out again. */
  settings: TableSettings | null;
  /** Commands to the vision service: calibration's steps. */
  vision: VisionCommand[];
}

/** A card on the table: a real card by its track, or a stand-in by its id. */
export type CardRef = { track: number } | { standIn: string };

/** An error, and the cards it blames. */
export interface SceneError {
  /** The checker's; the run's (a runtime error, or a library's own code breaking); or the table's own (a card it can't read, a frozen sketch). */
  from: "check" | "runtime" | "library" | "table";
  kind: ErrorKind | null;
  message: string;
  cards: CardRef[];
  /** A follow-on error: the skipped line it comes from, and the name that line would have set. */
  followsFrom?: { line: number; name: string };
  /** A `NameError`'s suggested name: the cards that define it. */
  suggestion?: CardRef[];
}

/** What the table view draws. */
export interface Scene {
  /** The program's cards, in buffer order. */
  cards: CardRef[];
  /** The check's errors for the buffer as it is, the table's, then the newest run's, then a frozen sketch's. */
  errors: SceneError[];
  /** The newest run froze and was killed. */
  frozen: boolean;
  /** The reader's virtual cards: stand-ins, then guides with no real card in their place. */
  virtualCards: VirtualCard[];
  /** The virtual cards to draw: stand-ins, a page's guides, and value guides after call cards (#197). */
  virtual: VirtualFace[];
  /** Every page on the table, to cut out of everything projected. */
  pages: PageCut[];
  /** The top status bar's messages: handwriting's no internet (#196), then the guides' (#197). */
  status: string[];
  /** The settings menu, while it's open: drawn above everything. */
  menu: MenuView | null;
  /** Calibration's step, while it runs: drawn over everything, the sketch included. */
  calibration: CalibrationView | null;
  settings: TableSettings;
  /** The help corner's box, while a card lies on a corner set to Help and for 1 s after. */
  help: HelpBox | null;
  /** The card feedback's look: lit cards, gutters, badges, the error bar and print output (#195). */
  feedback: Feedback;
  /** Handwriting's read-back, and the no-internet status (#196). */
  handwriting: HandwritingView;
}

export interface Session {
  handle(event: SessionEvent): SessionOutput;
  readonly scene: Scene;
  /** When the session next needs a `tick`, on the app's clock, or `null` when it needn't. */
  readonly wakeAt: number | null;
}

/** One version of the buffer: its text, and which card each span of it is. */
interface Buffer {
  text: string;
  map: CardMap;
}

/** A run the session started. */
interface Run {
  id: number;
  /** The buffer it was compiled from, for its errors' text positions. */
  buffer: Buffer;
  /** When it counts as frozen, unless a frame comes first; `Infinity` once it stopped on an error. */
  frozenAt: number;
  error: SceneError | null;
  /** The newest output of each `[call(print)]` card, by its text position. */
  prints: Map<string, { text: string; span: Span }>;
}

const refOf = (c: CardMap["cards"][number]): CardRef => ("track" in c ? { track: c.track } : { standIn: c.standIn });

/** The cards a buffer's text positions fall on, in buffer order. */
function cardsAt(buffer: Buffer, spans: readonly Span[]): CardRef[] {
  return buffer.map.cards
    .filter((c) => {
      const start = offsetAt(buffer.text, { line: c.span.line, column: c.span.start });
      const end = offsetAt(buffer.text, { line: c.span.line, column: c.span.end });
      return spans.some((s) => s.start < end && start < s.end);
    })
    .map(refOf);
}

/** The word a handwritten card is named by in a message: `num` for `[num{}]`. */
const wordOf = (notation: string): string => /^\[(\w+)/.exec(notation)?.[1] ?? "handwritten";

export function createSession(options: SessionOptions): Session {
  const { project } = options;
  let layout = options.layout;
  const settings: SessionSettings = { ...defaultSessionSettings, ...options.settings };
  let reader: ReaderState = initialState(project.entry.text);
  let runs = 0;
  /** The run on show, and the newer one waiting for its first frame. */
  let shown: Run | null = null;
  let next: Run | null = null;
  /** Runs asked to stop, and when each is killed. */
  let stopping: { run: Run; killAt: number }[] = [];
  /** The newest run started, whatever became of it. */
  let newest: Run | null = null;
  let frozen = false;
  let buffer: Buffer = { text: reader.text, map: { version: reader.version, cards: [], lines: [] } };
  let checkErrors: SceneError[] = [];
  let virtualCards: VirtualCard[] = [];
  let stripHeads: number[] = [];
  let detached: DetachedLine[] = [];
  let skippedLines: number[] = [];
  /** Cards the table can't read or doesn't know, in the buffer as it is. */
  let tableErrors: SceneError[] = [];
  /** The run that froze, and the error that says so, until the next run starts. */
  let frozenRun: { run: Run; error: SceneError } | null = null;
  const lengthOf = (marker: number): number => {
    const entry = project.lockfile.get(marker);
    return project.languageMarkers.get(marker)?.length ?? (entry?.kind === "library" ? entry.length : readerDefaults.unknownMinLength);
  };
  /** The last table state, and its clock less the app's, to step it again at the reader's wake. */
  let last: { state: TableState; offset: number } | null = null;
  /** When the reader wants that, on the app's clock. */
  let readerWake: number | null = null;
  let tableSettings = options.tableSettings ?? defaultTableSettings;
  const menu = createMenu();
  const calibration = createCalibration(options.projectorAspect ?? 16 / 9);
  /** The newest table state: calibration's check view outlines its cards, and it's read once calibration ends. */
  let latest: TableState | null = null;
  /** A card's length when the project knows it: calibration outlines only those. */
  const knownLengthOf = (marker: number): number | undefined => {
    const entry = project.lockfile.get(marker);
    return project.languageMarkers.get(marker)?.length ?? (entry?.kind === "library" ? entry.length : undefined);
  };
  const help = createHelpCorner(project);
  const guides = createGuides(project);
  const handwriting = createHandwriting(project.languageMarkers, { waitS: settings.handwritingWaitS, flashS: settings.readFlashS });
  /** The checked buffer a new run starts from, while it waits for handwriting. */
  let pending: { program: ReturnType<typeof check>["program"]; buffer: Buffer } | null = null;
  /** The cards the pending run waits for, and the lines they're on, which hide their follow-on errors meanwhile. */
  let waitingTracks: number[] = [];
  let waitingLines = new Set<number>();
  let readerSkips: SkippedLine[] = [];
  /** The newest event's time, for what the scene shows by the clock. */
  let clock = 0;

  const stop = (run: Run, now: number, sketch: SketchCommand[]): void => {
    sketch.push({ type: "stop", run: run.id });
    stopping.push({ run, killAt: now + settings.stopGraceS });
  };

  const onTable = (state: TableState, now: number, sketch: SketchCommand[]): void => {
    if (last?.state !== state) last = { state, offset: state.t - now };
    help.see(state, layout, tableSettings.corners, now);
    handwriting.see(state, now);
    const input = { table: state, layout, lockfile: project.lockfile, languageMarkers: project.languageMarkers, now: now + last.offset };
    let r = step(reader, { ...input, guideSources: guides.sources(state, now) });
    const changed = r.state.version !== reader.version;
    reader = r.state;
    buffer = { text: r.output.text, map: r.output.map };
    stripHeads = r.output.stripHeads;
    detached = r.output.detached;
    const { placementOnly } = r.output;
    let checked: ReturnType<typeof check> | null = null;
    if (changed) {
      checked = check(r.output.text, r.output.skippedLines, { loader: project.loader, id: project.entry.id });
      skippedLines = checked.program.skippedLines;
      checkErrors = checked.errors.map((e) => {
        const error: SceneError = { from: "check", kind: e.kind, message: e.message, cards: cardsAt(buffer, e.spans) };
        const name = e.spans[0] && buffer.text.slice(e.spans[0].start, e.spans[0].end);
        if (e.followsFrom !== null && name) error.followsFrom = { line: e.followsFrom, name };
        if (e.suggestion) error.suggestion = cardsAt(buffer, e.suggestion.spans);
        return error;
      });
      // Value guides come from the check of this buffer: step again, with the same table, to place them.
      guides.checked(checked, buffer.map, now);
      r = step(reader, { ...input, guideSources: guides.sources(state, now) });
      reader = r.state;
    }
    readerWake = r.output.wakeAt === undefined ? null : r.output.wakeAt - last.offset;
    virtualCards = r.output.virtualCards;
    guides.see(state, r.output);
    tableErrors = tableErrorsOf(state, r.output.unknownCards, r.output.mismatches);
    waitingTracks = handwriting.waitingTracks(r.output.map, r.output.skippedLines);
    readerSkips = r.output.skippedLines;
    waitingLines = new Set(r.output.skippedLines.filter((l) => l.reason === "not read yet").map((l) => l.line));
    if (!checked) return;
    // A run waiting for handwriting starts from the newest buffer, a slid strip's included.
    if (placementOnly && !pending) return;
    pending = { program: checked.program, buffer };
  };

  /** Starts the pending run once no card it waits for is still within its wait. */
  const startIfReady = (now: number, sketch: SketchCommand[]): void => {
    if (!pending || handwriting.readyAt(waitingTracks) > now) return;
    const { program } = pending;
    if (next) stop(next, now, sketch);
    runs += 1;
    next = newest = { id: runs, buffer: pending.buffer, frozenAt: now + settings.frozenS, error: null, prints: new Map() };
    pending = null;
    frozen = false;
    frozenRun = null;
    sketch.push({ type: "start", run: next.id, js: compile(program), natives: nativeModulesOf(program) });
  };

  /** The read errors, unknown cards and mismatches in the buffer: the table's own errors, each lighting its card. */
  const tableErrorsOf = (state: TableState, unknown: readonly UnknownCard[], mismatches: readonly Mismatch[]): SceneError[] => {
    const inBuffer = new Set(buffer.map.cards.flatMap((c) => ("track" in c ? [c.track] : [])));
    const errors: SceneError[] = [];
    for (const c of state.cards) {
      if (c.hw?.state !== "read error" || !inBuffer.has(c.track)) continue;
      const word = wordOf(project.languageMarkers.get(c.marker)?.card ?? "");
      errors.push({ from: "table", kind: null, message: `Can't read this ${word} card's handwriting. Write it again more clearly.`, cards: [{ track: c.track }] });
    }
    for (const u of unknown) {
      const message = u.package ? `Unknown card: this program doesn't import ${u.package}.` : "Unknown card: the table doesn't know this card.";
      errors.push({ from: "table", kind: null, message, cards: [{ track: u.track }] });
    }
    for (const m of mismatches) {
      const message = `Not the card the page shows (${labelOf(m.card)}). It still runs.`;
      errors.push({ from: "table", kind: null, message, cards: [{ track: m.track }] });
    }
    return errors;
  };

  const onSketch = (message: SketchMessage, now: number, sketch: SketchCommand[]): void => {
    if (message.type === "stuck") {
      if (frozenRun?.run.id === message.run) frozenRun.error.cards = cardsAt(frozenRun.run.buffer, [message.span]);
      return;
    }
    const run = [shown, next].find((r) => r?.id === message.run);
    if (!run) return;
    if (message.type === "print") {
      for (const p of message.prints) if (p.span) run.prints.set(`${p.span.start}-${p.span.end}`, { text: p.text, span: p.span });
      return;
    }
    if (message.type === "frame") run.frozenAt = now + settings.frozenS;
    else {
      // The run stopped itself, and its canvas keeps what it drew: it is shown with its error.
      run.frozenAt = Infinity;
      const { type, kind, message: text, span } = message.error;
      run.error = { from: type, kind, message: text, cards: span ? cardsAt(run.buffer, [span]) : [] };
    }
    if (run === next) {
      sketch.push({ type: "show", run: next.id });
      if (shown) stop(shown, now, sketch);
      shown = next;
      next = null;
    }
  };

  const onClock = (now: number, sketch: SketchCommand[]): void => {
    const stuck = [next, shown].find((r) => r && r.frozenAt <= now);
    if (stuck) {
      sketch.push({ type: "kill process" });
      frozen = true;
      // Where it is stuck comes from main once the process is gone (a "stuck" message).
      const message = `Frozen sketch: it stopped responding for ${settings.frozenS} s, so the table stopped it.`;
      frozenRun = { run: stuck, error: { from: "table", kind: null, message, cards: [] } };
      shown = next = null;
      stopping = [];
      return;
    }
    for (const s of stopping) if (s.killAt <= now) sketch.push({ type: "kill", run: s.run.id });
    stopping = stopping.filter((s) => s.killAt > now);
  };

  return {
    handle(event: SessionEvent): SessionOutput {
      const sketch: SketchCommand[] = [];
      let changed: TableSettings | null = null;
      let vision: VisionCommand[] = [];
      const calibrating = calibration.active;
      clock = event.now;
      onClock(event.now, sketch);
      help.tick(event.now);
      // While calibrating, the table is cleared and laid for calibration: the program is left as it was.
      if (event.type === "table") {
        latest = event.state;
        if (!calibrating) onTable(event.state, event.now, sketch);
      }
      else if (event.type === "sketch") onSketch(event.message, event.now, sketch);
      else if (event.type === "layout") {
        layout = event.layout;
        if (last && !calibrating) onTable(last.state, event.now, sketch);
      }
      else if (event.type === "key") {
        if (calibrating) vision = calibration.key(event.key);
        else {
          const r = menu.key(event.key, tableSettings);
          if (r?.settings) {
            tableSettings = changed = r.settings;
            if (last) help.see(last.state, layout, tableSettings.corners, event.now);
          }
          if (r?.action === "calibrate") {
            menu.close();
            calibration.start();
          }
        }
      }
      else if (event.type === "vision") vision = calibration.result(event.message, event.now);
      else {
        vision = calibration.tick(event.now);
        if (!calibrating && last && Math.min(readerWake ?? Infinity, guides.wakeAt ?? Infinity) <= event.now) onTable(last.state, event.now, sketch);
      }
      if (calibrating && !calibration.active && latest) onTable(latest, event.now, sketch);
      if (!calibration.active) startIfReady(event.now, sketch);
      return { sketch, settings: changed, vision };
    },
    get scene(): Scene {
      // A waiting line's follow-on errors stay hidden until it's read.
      const shownCheckErrors = checkErrors.filter((e) => !(e.followsFrom && waitingLines.has(e.followsFrom.line)));
      const errors = [...shownCheckErrors, ...tableErrors, ...(newest?.error ? [newest.error] : []), ...(frozenRun ? [frozenRun.error] : [])];
      const prints = shown ? [...shown.prints.values()].map((p) => ({ text: p.text, cards: cardsAt(shown!.buffer, [p.span]) })) : [];
      const handwritingView = handwriting.view({ state: last?.state ?? null, map: buffer.map, errors, readBackAll: tableSettings.readBack, lengthOf, now: clock });
      return {
        cards: buffer.map.cards.map(refOf),
        errors,
        frozen,
        virtualCards,
        virtual: guides.virtual,
        pages: guides.pages,
        status: [...(handwritingView.status ? [handwritingView.status] : []), ...guides.status],
        menu: menu.view(tableSettings),
        calibration: calibration.view(layout, latest?.cards ?? [], knownLengthOf),
        settings: tableSettings,
        help: help.box,
        feedback: feedback({ state: last?.state ?? null, map: buffer.map, lengthOf, stripHeads, detached, skippedLines, readerSkips, errors, prints }),
        handwriting: handwritingView,
      };
    },
    get wakeAt(): number | null {
      const times = [
        calibration.active ? Infinity : (readerWake ?? Infinity),
        calibration.wakeAt ?? Infinity,
        help.wakeAt ?? Infinity,
        calibration.active ? Infinity : (guides.wakeAt ?? Infinity),
        pending ? handwriting.readyAt(waitingTracks) : Infinity,
        handwriting.wakeAt(clock) ?? Infinity,
        ...stopping.map((s) => s.killAt),
        ...[shown, next].map((r) => r?.frozenAt ?? Infinity),
      ];
      const at = Math.min(...times);
      return at === Infinity ? null : at;
    },
  };
}
