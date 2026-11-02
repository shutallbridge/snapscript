import { describe, expect, test } from "vitest";
import { createSession } from "../src/session.ts";
import { card, DEFINE, DIVIDE, GET, layout, NUM, ON_LOAD, onLoad, PRINT, project, runErrors, strip, table } from "./session-helpers.ts";

describe("when a run starts", () => {
  test("a change that isn't placement-only sends one start command once checked", () => {
    const session = createSession({ project, layout });
    const out = session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
    expect(out.sketch).toEqual([{ type: "start", run: 1, js: expect.any(String), natives: [] }]);
    expect(session.handle({ type: "table", now: 0.1, state: table(0.1, ...onLoad(1, 30, 30, "1")) }).sketch).toEqual([]);
  });

  test("sliding a whole strip sends none", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
    const slid = session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 90, 150, "1")) });
    expect(slid.sketch).toEqual([]);
  });

  test("changing a card restarts", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
    const changed = session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    expect(changed.sketch).toContainEqual({ type: "start", run: 2, js: expect.any(String), natives: [] });
  });
});

/** A session that has started run 1 from one strip and shown it, at t = 0. */
function running() {
  const session = createSession({ project, layout });
  session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
  session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
  return session;
}

describe("swapping runs", () => {
  test("a run is shown at its first frame, and only then", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
    expect(session.handle({ type: "tick", now: 0.05 }).sketch).toEqual([]);
    expect(session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } }).sketch).toEqual([{ type: "show", run: 1 }]);
    expect(session.handle({ type: "sketch", now: 0.12, message: { type: "frame", run: 1 } }).sketch).toEqual([]);
  });

  test("the old run shows until the new one's first frame, which swaps it in and stops the old one", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    expect(session.handle({ type: "sketch", now: 1.05, message: { type: "frame", run: 1 } }).sketch).toEqual([]);
    expect(session.handle({ type: "sketch", now: 1.1, message: { type: "frame", run: 2 } }).sketch).toEqual([
      { type: "show", run: 2 },
      { type: "stop", run: 1 },
    ]);
  });

  test("a stopped run is killed 0.5 s after it was asked to stop", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    session.handle({ type: "sketch", now: 1.1, message: { type: "frame", run: 2 } });
    expect(session.wakeAt).toBeCloseTo(1.6);
    expect(session.handle({ type: "tick", now: 1.5 }).sketch).toEqual([]);
    expect(session.handle({ type: "tick", now: 1.6 }).sketch).toEqual([{ type: "kill", run: 1 }]);
    expect(session.handle({ type: "tick", now: 2 }).sketch).toEqual([]);
  });

  test("a new run replaced before its first frame is stopped and killed, and the shown one stays", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    expect(session.handle({ type: "table", now: 1.2, state: table(1.2, ...onLoad(1, 30, 30, "3")) }).sketch).toEqual([
      { type: "stop", run: 2 },
      { type: "start", run: 3, js: expect.any(String), natives: [] },
    ]);
    expect(session.handle({ type: "tick", now: 1.7 }).sketch).toEqual([{ type: "kill", run: 2 }]);
    expect(session.handle({ type: "sketch", now: 1.8, message: { type: "frame", run: 3 } }).sketch).toEqual([
      { type: "show", run: 3 },
      { type: "stop", run: 1 },
    ]);
  });
});

describe("a frozen sketch", () => {
  test("no frame for 3 s kills the sketch process", () => {
    const session = running();
    session.handle({ type: "sketch", now: 1, message: { type: "frame", run: 1 } });
    expect(session.wakeAt).toBeCloseTo(4);
    expect(session.handle({ type: "tick", now: 3.9 }).sketch).toEqual([]);
    expect(session.handle({ type: "tick", now: 4 }).sketch).toEqual([{ type: "kill process" }]);
    expect(session.handle({ type: "tick", now: 10 }).sketch).toEqual([]);
    expect(session.wakeAt).toBeNull();
  });

  test("a new run with no first frame (stuck in its [on(load)]) for 3 s kills it, though the old one draws", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    for (const now of [1.5, 2, 2.5, 3, 3.5]) session.handle({ type: "sketch", now, message: { type: "frame", run: 1 } });
    expect(session.handle({ type: "tick", now: 4 }).sketch).toEqual([{ type: "kill process" }]);
  });

  test("the next buffer change starts a fresh run, shown at its first frame with nothing to stop", () => {
    const session = running();
    session.handle({ type: "tick", now: 3.1 });
    expect(session.handle({ type: "table", now: 5, state: table(5, ...onLoad(1, 30, 30, "2")) }).sketch).toEqual([
      { type: "start", run: 2, js: expect.any(String), natives: [] },
    ]);
    expect(session.handle({ type: "sketch", now: 5.1, message: { type: "frame", run: 2 } }).sketch).toEqual([{ type: "show", run: 2 }]);
  });
});

describe("the scene", () => {
  test("shows which cards are in the program", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1", "2"), card(9, NUM, 300, 500, "7")) });
    expect(session.scene.cards).toEqual([{ track: 1 }, { track: 2 }, { track: 3 }, { track: 4 }, { track: 5 }]);
  });

  test("a check error blames the cards its text positions are", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...strip(1, 30, 30, [ON_LOAD], [[PRINT], [GET, "y"]])) });
    expect(session.scene.errors).toEqual([{ from: "check", kind: "NameError", message: expect.stringContaining("y"), cards: [{ track: 3 }] }]);
  });

  test("a runtime error blames its cards in its run's buffer version, though a strip has slid since", () => {
    const session = createSession({ project, layout });
    const broken = (x: number, y: number) => strip(5, x, y, [ON_LOAD], [[PRINT], [NUM, "1"], [DIVIDE], [NUM, "0"]]);
    const f = (x: number, y: number) => strip(1, x, y, [DEFINE, "f"], [[PRINT], [NUM, "1"]]);
    const start = session.handle({ type: "table", now: 0, state: table(0, ...f(30, 30), ...broken(30, 150)) }).sketch[0];
    if (start?.type !== "start") throw new Error("no run started");
    // The first strip slides, so every card after it moves along the buffer's text, and no run starts.
    expect(session.handle({ type: "table", now: 1, state: table(1, ...f(130, 60), ...broken(30, 150)) }).sketch).toEqual([]);
    const [error] = runErrors(start.js);
    session.handle({ type: "sketch", now: 1.1, message: { type: "error", run: start.run, error: error! } });
    expect(session.scene.errors).toEqual([{ from: "runtime", kind: "ZeroDivisionError", message: error!.message, cards: [{ track: 8 }] }]);
  });
});

describe("a run that stops on an error", () => {
  const error = { type: "runtime", kind: "ZeroDivisionError", message: "can't divide by 0", span: null } as const;

  test("isn't frozen for drawing no more frames", () => {
    const session = running();
    session.handle({ type: "sketch", now: 0.5, message: { type: "error", run: 1, error } });
    expect(session.handle({ type: "tick", now: 10 }).sketch).toEqual([]);
    expect(session.scene.frozen).toBe(false);
    expect(session.scene.errors).toEqual([{ from: "runtime", kind: "ZeroDivisionError", message: "can't divide by 0", cards: [] }]);
  });

  test("before its first frame is swapped in with what it drew, and the old one stopped", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    expect(session.handle({ type: "sketch", now: 1.1, message: { type: "error", run: 2, error } }).sketch).toEqual([
      { type: "show", run: 2 },
      { type: "stop", run: 1 },
    ]);
  });

  test("an old run's error isn't the scene's", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 30, 30, "2")) });
    session.handle({ type: "sketch", now: 1.1, message: { type: "error", run: 1, error } });
    expect(session.scene.errors).toEqual([]);
  });
});

describe("the scene of a frozen sketch", () => {
  test("says so, until the next run starts", () => {
    const session = running();
    expect(session.scene.frozen).toBe(false);
    session.handle({ type: "tick", now: 3.1 });
    expect(session.scene.frozen).toBe(true);
    session.handle({ type: "table", now: 5, state: table(5, ...onLoad(1, 30, 30, "2")) });
    expect(session.scene.frozen).toBe(false);
  });
});

describe("the reader's wake", () => {
  test("steps the last table state again at the reader's wakeAt, on the app's clock", () => {
    // A stand-in strip from the entry text; a real [num{2}] laid still on its [num{1}] takes its place after a while.
    const entry = "/** @table 30 30 0 */\n[on(load)]\n[call(print)][num{1}]";
    const session = createSession({ project: { ...project, entry: { ...project.entry, text: entry } }, layout });
    session.handle({ type: "table", now: 100, state: table(5, card(1, NUM, 90, 60, "2")) });
    session.handle({ type: "sketch", now: 100.1, message: { type: "frame", run: 1 } });
    expect(session.scene.virtualCards.map((v) => v.id)).toEqual(["s1", "s2", "s3"]);
    const wake = session.wakeAt!;
    expect(wake).toBeGreaterThan(100.1);
    expect(wake).toBeLessThan(103);
    session.handle({ type: "tick", now: wake });
    expect(session.scene.virtualCards.map((v) => v.id)).toEqual(["s1", "s2"]);
  });
});
