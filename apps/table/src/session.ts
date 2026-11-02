// The table session (#181 "The table app"): the main process's core, with no Electron in it. It
// takes events (table states, sketch messages, the clock) and gives the scene to draw and the
// commands for the sketch view. The Electron code around it only carries messages and draws.
import { check, type Span } from "@snapscript/checker";
import { offsetAt, type ErrorKind } from "@snapscript/core";
import type { RunError } from "@snapscript/runtime";
import { compile, nativeModulesOf, type NativeModuleFile } from "@snapscript/runtime/compiler";
import {
  initialState,
  step,
  type CardMap,
  type Layout,
  type ReaderState,
  type TableState,
  type VirtualCard,
} from "@snapscript/table-reader";
import { createCalibration, type CalibrationResult, type CalibrationView, type VisionCommand } from "./calibration.ts";
import { createMenu, type MenuView } from "./menu.ts";
import { createHelpCorner, type HelpBox } from "./help.ts";
import type { Project } from "./project.ts";
import { defaultTableSettings, type TableSettings } from "./settings.ts";

/** What the session needs of a loaded project. */
export type SessionProject = Pick<Project, "entry" | "loader" | "lockfile" | "languageMarkers" | "cards">;

/** The session's timings, in seconds: the decided starting values (#181), for the rig to tune. */
export interface SessionSettings {
  /** A run asked to stop runs its `[on(stop)]` handlers this long, then is killed. */
  stopGraceS: number;
  /** A run with no frame for this long (from its start, or its last frame) is frozen: the sketch process is killed. */
  frozenS: number;
}

export const defaultSessionSettings: SessionSettings = {
  stopGraceS: 0.5,
  frozenS: 3,
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
 * error, which the runtime reports with the text position of the table card that led there.
 */
export type SketchMessage = { type: "frame"; run: number } | { type: "error"; run: number; error: RunError };

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
  /** The checker's, or the run's: a runtime error, or a library's own code breaking. */
  from: "check" | "runtime" | "library";
  kind: ErrorKind | null;
  message: string;
  cards: CardRef[];
}

/** What the table view draws. */
export interface Scene {
  /** The program's cards, in buffer order. */
  cards: CardRef[];
  /** The check's errors for the buffer as it is, then the newest run's. */
  errors: SceneError[];
  /** The newest run froze and was killed. */
  frozen: boolean;
  /** The reader's virtual cards: stand-ins, then guides with no real card in their place. */
  virtualCards: VirtualCard[];
  /** The settings menu, while it's open: drawn above everything. */
  menu: MenuView | null;
  /** Calibration's step, while it runs: drawn over everything, the sketch included. */
  calibration: CalibrationView | null;
  settings: TableSettings;
  /** The help corner's box, while a card lies there and for 1 s after. */
  help: HelpBox | null;
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
  /** The last table state, and its clock less the app's, to step it again at the reader's wake. */
  let last: { state: TableState; offset: number } | null = null;
  /** When the reader wants that, on the app's clock. */
  let readerWake: number | null = null;
  let tableSettings = options.tableSettings ?? defaultTableSettings;
  const menu = createMenu();
  const calibration = createCalibration(options.projectorAspect ?? 16 / 9);
  /** The newest table state: calibration's check view outlines its cards, and it's read once calibration ends. */
  let latest: TableState | null = null;
  const lengthOf = (marker: number): number | undefined => {
    const entry = project.lockfile.get(marker);
    return project.languageMarkers.get(marker)?.length ?? (entry?.kind === "library" ? entry.length : undefined);
  };
  const help = createHelpCorner(project);

  const stop = (run: Run, now: number, sketch: SketchCommand[]): void => {
    sketch.push({ type: "stop", run: run.id });
    stopping.push({ run, killAt: now + settings.stopGraceS });
  };

  const onTable = (state: TableState, now: number, sketch: SketchCommand[]): void => {
    if (last?.state !== state) last = { state, offset: state.t - now };
    help.see(state, layout, now);
    const r = step(reader, {
      table: state,
      layout,
      lockfile: project.lockfile,
      languageMarkers: project.languageMarkers,
      now: now + last.offset,
    });
    const changed = r.state.version !== reader.version;
    reader = r.state;
    readerWake = r.output.wakeAt === undefined ? null : r.output.wakeAt - last.offset;
    buffer = { text: r.output.text, map: r.output.map };
    virtualCards = r.output.virtualCards;
    if (!changed) return;
    const checked = check(r.output.text, r.output.skippedLines, { loader: project.loader, id: project.entry.id });
    checkErrors = checked.errors.map((e) => ({ from: "check", kind: e.kind, message: e.message, cards: cardsAt(buffer, e.spans) }));
    if (r.output.placementOnly) return;
    if (next) stop(next, now, sketch);
    runs += 1;
    next = newest = { id: runs, buffer, frozenAt: now + settings.frozenS, error: null };
    frozen = false;
    sketch.push({ type: "start", run: next.id, js: compile(checked.program), natives: nativeModulesOf(checked.program) });
  };

  const onSketch = (message: SketchMessage, now: number, sketch: SketchCommand[]): void => {
    const run = [shown, next].find((r) => r?.id === message.run);
    if (!run) return;
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
    if ([shown, next].some((r) => r && r.frozenAt <= now)) {
      sketch.push({ type: "kill process" });
      frozen = true;
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
          if (r?.settings) tableSettings = changed = r.settings;
          if (r?.action === "calibrate") {
            menu.close();
            calibration.start();
          }
        }
      }
      else if (event.type === "vision") vision = calibration.result(event.message, event.now);
      else {
        vision = calibration.tick(event.now);
        if (!calibrating && last && readerWake !== null && readerWake <= event.now) onTable(last.state, event.now, sketch);
      }
      if (calibrating && !calibration.active && latest) onTable(latest, event.now, sketch);
      return { sketch, settings: changed, vision };
    },
    get scene(): Scene {
      return {
        cards: buffer.map.cards.map(refOf),
        errors: [...checkErrors, ...(newest?.error ? [newest.error] : [])],
        frozen,
        virtualCards,
        menu: menu.view(tableSettings),
        calibration: calibration.view(layout, latest?.cards ?? [], lengthOf),
        settings: tableSettings,
        help: help.box,
      };
    },
    get wakeAt(): number | null {
      const times = [
        calibration.active ? Infinity : (readerWake ?? Infinity),
        calibration.wakeAt ?? Infinity,
        help.wakeAt ?? Infinity,
        ...stopping.map((s) => s.killAt),
        ...[shown, next].map((r) => r?.frozenAt ?? Infinity),
      ];
      const at = Math.min(...times);
      return at === Infinity ? null : at;
    },
  };
}
