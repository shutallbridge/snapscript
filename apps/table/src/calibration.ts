// Calibration (#181 "Calibration", #132), from the settings menu's Rig section. Three steps, each a
// command to the vision service with its result (python/vision/src/snapscript_vision/calibration.py):
//   1. Clear the table, Enter: the service says where its 12 markers go; they're drawn, and said to
//      be shown once they've had time to show. The line-up is fitted from them.
//   2. Lay the ruler page in the drawn box, Enter: it fixes the exposure and the real size.
//   3. The check view outlines every card's face and the ruler page. Enter saves; Esc keeps the old line-up.
import { SHEET } from "@snapscript/faces";
import type { Layout, TableCard } from "@snapscript/table-reader";
import { centred, corners, onSheet } from "./pose.ts";

/** A point on the table, in mm. */
export type Point = [x: number, y: number];

/** A marker to project in step 1: centre and printed width in projector heights from the picture's top-left. */
export interface ProjectedMarker {
  marker: number;
  x: number;
  y: number;
  size: number;
}

/** A command to the vision service. */
export type VisionCommand =
  | { type: "calibrate"; step: "clear"; aspect: number }
  | { type: "calibrate"; step: "shown" | "ruler" | "save" | "keep" };

/** A calibration step's result from the vision service. */
export type CalibrationResult = { type: "calibration"; step: string } & (
  | { ok: false; why: string }
  | {
      ok: true;
      white?: number;
      markers?: ProjectedMarker[];
      seen?: number;
      of?: number;
      error_mm?: { mean: number; max: number };
      mm_per_projector_height?: number;
      exposure?: { ms: number; gain: number };
      /** The ruler page's centre in table mm and its angle in degrees, by the new line-up. */
      ruler_page?: { x: number; y: number; angle: number };
    }
);

/**
 * What the table view draws: black over everything (the sketch too), then the step. Lines are the
 * step's words; the box, outlines and page are in table mm. Markers are drawn black on white squares
 * `white` times their width, upright.
 */
export type CalibrationView =
  | { step: "clear"; lines: string[] }
  | { step: "markers"; lines: string[]; white: number; markers: ProjectedMarker[] }
  | { step: "ruler"; lines: string[]; box: Point[] }
  | { step: "check"; lines: string[]; outlines: Point[][]; page: Point[] | null };

export interface CalibrationSettings {
  /** How long the markers are drawn before the service is told they're shown, in s. */
  settleS: number;
}

export const defaultCalibrationSettings: CalibrationSettings = { settleS: 0.5 };

/** The ruler page: A4 landscape, its two markers on its middle line (#132, `pnpm print`'s ruler.pdf). */
export const RULER_PAGE_MM = { width: 297, height: 210 };

export interface Calibration {
  readonly active: boolean;
  /** When it next needs a tick, or `null`. */
  readonly wakeAt: number | null;
  start(): void;
  key(key: string): VisionCommand[];
  result(result: CalibrationResult, now: number): VisionCommand[];
  tick(now: number): VisionCommand[];
  view(layout: Layout, cards: readonly TableCard[], lengthOf: (marker: number) => number | undefined): CalibrationView | null;
}

type State =
  | { step: "off" }
  | { step: "clear"; waiting: boolean; error: string | null }
  | { step: "markers"; white: number; markers: ProjectedMarker[]; shownAt: number | null }
  | { step: "ruler"; fit: string; waiting: boolean; error: string | null }
  | { step: "check"; size: string; page: { x: number; y: number; angle: number } | null; waiting: boolean; error: string | null };

const TITLE = (n: number): string => `Calibrate: step ${n} of 3`;
const failed = (why: string): string => `That didn't work: ${why}.`;
const errorText = (e: { mean: number; max: number } | undefined): string =>
  e ? `${e.mean} mm on average, ${e.max} mm at worst` : "no error given";

/** A rectangle `width` x `height` about a centre, turned `angle` degrees, as four corners clockwise from the top-left. */
const rect = (cx: number, cy: number, width: number, height: number, angle = 0): Point[] => corners(centred(cx, cy, width, height, angle));

/** A card's face, by its marker's centre and angle: from the marker zone's end to the card's, never on the marker zone. */
const faceOutline = (c: TableCard, length: number): Point[] => corners(onSheet(c, SHEET.markerZoneMm, length * SHEET.unitMm - SHEET.markerZoneMm));

export function createCalibration(aspect: number, settings: CalibrationSettings = defaultCalibrationSettings): Calibration {
  let state: State = { step: "off" };
  /** Whether the service has had a step since calibration started, so Esc must have it keep the old line-up. */
  let told = false;
  const send = (command: VisionCommand): VisionCommand[] => {
    told = true;
    return [command];
  };
  const stop = (): VisionCommand[] => {
    const out: VisionCommand[] = told ? [{ type: "calibrate", step: "keep" }] : [];
    state = { step: "off" };
    told = false;
    return out;
  };

  return {
    get active() {
      return state.step !== "off";
    },
    get wakeAt() {
      return state.step === "markers" ? state.shownAt : null;
    },
    start() {
      state = { step: "clear", waiting: false, error: null };
      told = false;
    },
    key(key) {
      if (state.step === "off") return [];
      if (key === "Escape") return stop();
      if (key !== "Enter") return [];
      if (state.step === "clear" && !state.waiting) {
        state = { ...state, waiting: true, error: null };
        return send({ type: "calibrate", step: "clear", aspect });
      }
      if (state.step === "ruler" && !state.waiting) {
        state = { ...state, waiting: true, error: null };
        return send({ type: "calibrate", step: "ruler" });
      }
      if (state.step === "check" && !state.waiting) {
        state = { ...state, waiting: true, error: null };
        return send({ type: "calibrate", step: "save" });
      }
      return [];
    },
    result(r, now) {
      if (state.step === "clear" && state.waiting && r.step === "clear") {
        if (!r.ok) state = { step: "clear", waiting: false, error: r.why };
        else state = { step: "markers", white: r.white ?? 1.5, markers: r.markers ?? [], shownAt: now + settings.settleS };
      } else if (state.step === "markers" && state.shownAt === null && r.step === "shown") {
        if (!r.ok) state = { step: "clear", waiting: false, error: r.why };
        else state = { step: "ruler", fit: `${r.seen} of ${r.of} markers seen: ${errorText(r.error_mm)}.`, waiting: false, error: null };
      } else if (state.step === "ruler" && state.waiting && r.step === "ruler") {
        if (!r.ok) state = { ...state, waiting: false, error: r.why };
        else {
          const exposure = r.exposure ? ` Exposure ${r.exposure.ms} ms, gain ${r.exposure.gain}.` : "";
          const size = `The table is ${r.mm_per_projector_height} mm deep.${exposure}`;
          state = { step: "check", size, page: r.ruler_page ?? null, waiting: false, error: null };
        }
      } else if (state.step === "check" && state.waiting && r.step === "save") {
        if (!r.ok) state = { ...state, waiting: false, error: r.why };
        else {
          state = { step: "off" };
          told = false;
        }
      }
      return [];
    },
    tick(now) {
      if (state.step !== "markers" || state.shownAt === null || state.shownAt > now) return [];
      state = { ...state, shownAt: null };
      return send({ type: "calibrate", step: "shown" });
    },
    view(layout, cards, lengthOf) {
      const s = state;
      const error = "error" in s && s.error ? [failed(s.error)] : [];
      switch (s.step) {
        case "off":
          return null;
        case "clear":
          return {
            step: "clear",
            lines: [TITLE(1), "Clear the table: take every card and page off, then press Enter.", ...(s.waiting ? ["Working…"] : []), ...error, "Esc stops."],
          };
        case "markers":
          return { step: "markers", lines: [], white: s.white, markers: s.markers };
        case "ruler": {
          const width = layout.canvasSpace.x + layout.canvasSpace.width - layout.codingSpace.x;
          const box = rect(layout.codingSpace.x + width / 2, layout.codingSpace.y + layout.codingSpace.height / 2, RULER_PAGE_MM.width, RULER_PAGE_MM.height);
          return {
            step: "ruler",
            lines: [TITLE(2), s.fit, "Lay the ruler page flat in the box, then press Enter.", ...(s.waiting ? ["Working…"] : []), ...error, "Esc keeps the old line-up."],
            box,
          };
        }
        case "check": {
          const outlines = cards.flatMap((c) => {
            const length = lengthOf(c.marker);
            return length === undefined ? [] : [faceOutline(c, length)];
          });
          const page = s.page && rect(s.page.x, s.page.y, RULER_PAGE_MM.width, RULER_PAGE_MM.height, s.page.angle);
          return {
            step: "check",
            lines: [
              TITLE(3),
              s.size,
              "Check: each outline should sit on its card's edge, and on the ruler page's.",
              ...(s.waiting ? ["Saving…"] : []),
              ...error,
              "Enter saves. Esc keeps the old line-up.",
            ],
            outlines,
            page,
          };
        }
      }
    },
  };
}
