// Calibration (#181 "Calibration", #132), from the settings menu's Rig section: three steps, each a
// command to the vision service with its result, and what the table view draws at each.
import { describe, expect, test } from "vitest";
import { createSession, type Session } from "../src/session.ts";
import { card, layout, onLoad, PRINT, project, table } from "./session-helpers.ts";

const ASPECT = 16 / 9;
const key = (session: Session, key: string, now = 0) => session.handle({ type: "key", now, key });
const result = (session: Session, now: number, message: object) =>
  session.handle({ type: "vision", now, message: { type: "calibration", ...message } as never });

/** Twelve markers, as step 1 answers: a 4 x 3 grid in projector heights. */
const markers = Array.from({ length: 12 }, (_, i) => ({ marker: 300 + i, x: 0.1 + (i % 4) * 0.5, y: 0.1 + Math.floor(i / 4) * 0.4, size: 0.12 }));
const FIT = { ok: true, seen: 12, of: 12, k1: 0.03, error_mm: { mean: 0.77, max: 1.37 } };
const SIZE = {
  ok: true,
  mm_per_projector_height: 781,
  exposure: { ms: 40, gain: 1 },
  paper: 150,
  error_mm: { mean: 0.8, max: 1.4 },
  ruler_page: { x: 400, y: 300, angle: 0 },
};

/** A session with the menu at Rig's Calibrate row. */
function atCalibrate(): Session {
  const session = createSession({ project, layout, projectorAspect: ASPECT });
  for (const k of [",", "ArrowUp", "ArrowUp", "ArrowUp", "Enter"]) key(session, k);
  expect(session.scene.menu?.title).toBe("Rig");
  expect(session.scene.menu?.rows).toEqual([{ label: "Calibrate", value: null, chosen: true }]);
  return session;
}

/** Through step 1: the markers shown and fitted, at t = 2. */
function atRuler(): Session {
  const session = atCalibrate();
  key(session, "Enter");
  key(session, "Enter", 1);
  result(session, 1.2, { step: "clear", ok: true, white: 1.5, markers });
  session.handle({ type: "tick", now: 1.7 });
  result(session, 2, { step: "shown", ...FIT });
  return session;
}

/** Through step 2, at t = 3. */
function atCheck(): Session {
  const session = atRuler();
  key(session, "Enter", 2.5);
  result(session, 3, { step: "ruler", ...SIZE });
  return session;
}

describe("calibration's steps", () => {
  test("Calibrate closes the menu and asks for a clear table", () => {
    const session = atCalibrate();
    const out = key(session, "Enter");
    expect(out.vision).toEqual([]);
    expect(session.scene.menu).toBeNull();
    expect(session.scene.calibration).toMatchObject({ step: "clear" });
    expect(session.scene.calibration!.lines).toContain("Clear the table: take every card and page off, then press Enter.");
  });

  test("step 1: Enter asks the service where the 12 markers go, with the projector's aspect", () => {
    const session = atCalibrate();
    key(session, "Enter");
    expect(key(session, "Enter", 1).vision).toEqual([{ type: "calibrate", step: "clear", aspect: ASPECT }]);
    expect(key(session, "Enter", 1.1).vision).toEqual([]);
  });

  test("step 1: the markers are drawn where the service says, and said to be shown once they've had time to show", () => {
    const session = atCalibrate();
    key(session, "Enter");
    key(session, "Enter", 1);
    result(session, 1.2, { step: "clear", ok: true, white: 1.5, markers });
    expect(session.scene.calibration).toEqual({ step: "markers", lines: [], white: 1.5, markers });
    expect(session.wakeAt).toBeCloseTo(1.7);
    expect(session.handle({ type: "tick", now: 1.5 }).vision).toEqual([]);
    expect(session.handle({ type: "tick", now: 1.7 }).vision).toEqual([{ type: "calibrate", step: "shown" }]);
    expect(session.handle({ type: "tick", now: 2 }).vision).toEqual([]);
    expect(session.scene.calibration).toMatchObject({ step: "markers" });
  });

  test("step 1 that fails goes back to a clear table, saying why", () => {
    const session = atCalibrate();
    key(session, "Enter");
    key(session, "Enter", 1);
    result(session, 1.2, { step: "clear", ok: true, white: 1.5, markers });
    session.handle({ type: "tick", now: 1.7 });
    result(session, 2, { step: "shown", ok: false, why: "saw 7 of the 12 markers", seen: 7, of: 12 });
    expect(session.scene.calibration).toMatchObject({ step: "clear" });
    expect(session.scene.calibration!.lines).toContain("That didn't work: saw 7 of the 12 markers.");
    expect(key(session, "Enter", 3).vision).toEqual([{ type: "calibrate", step: "clear", aspect: ASPECT }]);
  });

  test("step 2: the ruler page's box is drawn, A4 landscape in the middle of the table, and Enter measures it", () => {
    const session = atRuler();
    const view = session.scene.calibration!;
    expect(view).toMatchObject({ step: "ruler", box: [[251.5, 195], [548.5, 195], [548.5, 405], [251.5, 405]] });
    expect(view.lines).toContain("12 of 12 markers seen: 0.77 mm on average, 1.37 mm at worst.");
    expect(view.lines).toContain("Lay the ruler page flat in the box, then press Enter.");
    expect(key(session, "Enter", 2.5).vision).toEqual([{ type: "calibrate", step: "ruler" }]);
  });

  test("step 2 that fails stays, saying why", () => {
    const session = atRuler();
    key(session, "Enter", 2.5);
    result(session, 3, { step: "ruler", ok: false, why: "didn't see the ruler page's 2 markers" });
    expect(session.scene.calibration).toMatchObject({ step: "ruler" });
    expect(session.scene.calibration!.lines).toContain("That didn't work: didn't see the ruler page's 2 markers.");
  });

  test("step 3: the check view outlines every card's face and the ruler page, as the table moves", () => {
    const session = atCheck();
    const view = session.scene.calibration!;
    expect(view).toMatchObject({ step: "check", outlines: [] });
    expect(view.lines).toContain("The table is 781 mm deep. Exposure 40 ms, gain 1.");
    expect(view.lines).toContain("Enter saves. Esc keeps the old line-up.");
    if (view.step !== "check") throw new Error("not the check view");
    expect(view.page).toEqual([[251.5, 195], [548.5, 195], [548.5, 405], [251.5, 405]]);

    // A 2U card upright with its top-left at (100, 200): its face, not its marker zone (the first 17 mm).
    session.handle({ type: "table", now: 3.5, state: table(3.5, card(1, PRINT, 100, 200)) });
    expect(session.scene.calibration).toMatchObject({ outlines: [[[117, 200], [160, 200], [160, 230], [117, 230]]] });
  });

  test("Enter at the check view saves the new line-up, and calibration ends once it's saved", () => {
    const session = atCheck();
    expect(key(session, "Enter", 4).vision).toEqual([{ type: "calibrate", step: "save" }]);
    expect(session.scene.calibration).not.toBeNull();
    result(session, 4.2, { step: "save", ok: true });
    expect(session.scene.calibration).toBeNull();
  });

  test("Esc at the check view keeps the old line-up", () => {
    const session = atCheck();
    expect(key(session, "Escape", 4).vision).toEqual([{ type: "calibrate", step: "keep" }]);
    expect(session.scene.calibration).toBeNull();
  });

  test("Esc at a step the service has had keeps the old line-up; before any, it only stops", () => {
    const early = atCalibrate();
    key(early, "Enter");
    expect(key(early, "Escape").vision).toEqual([]);
    expect(early.scene.calibration).toBeNull();
    const later = atRuler();
    expect(key(later, "Escape", 3).vision).toEqual([{ type: "calibrate", step: "keep" }]);
    expect(later.scene.calibration).toBeNull();
  });
});

describe("the program during calibration", () => {
  test("clearing the table for calibration doesn't restart the run; once it ends, the table is read again", () => {
    const session = createSession({ project, layout, projectorAspect: ASPECT });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
    session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    for (const k of [",", "ArrowUp", "ArrowUp", "ArrowUp", "Enter", "Enter"]) key(session, k, 0.5);
    expect(session.handle({ type: "table", now: 1, state: table(1) }).sketch).toEqual([]);
    expect(session.scene.cards).toHaveLength(3);
    session.handle({ type: "sketch", now: 2, message: { type: "frame", run: 1 } });
    session.handle({ type: "table", now: 2.5, state: table(2.5, ...onLoad(1, 30, 30, "2")) });
    expect(key(session, "Escape", 3).sketch).toContainEqual({ type: "start", run: 2, js: expect.any(String), natives: [] });
  });

  test("the menu's other keys don't reach calibration, nor calibration's the menu", () => {
    const session = atCalibrate();
    key(session, "Enter");
    key(session, ",");
    expect(session.scene.menu).toBeNull();
    expect(session.scene.calibration).toMatchObject({ step: "clear" });
  });
});
