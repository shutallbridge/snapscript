// Handwriting at the table (#196): waiting for reads, read-back and losing the internet.
import { describe, expect, test } from "vitest";
import type { Handwriting, TableCard } from "@snapscript/table-reader";
import { createSession } from "../src/session.ts";
import { defaultTableSettings } from "../src/settings.ts";
import { GET, layout, marker, NUM, ON_LOAD, onLoad, PRINT, project, strip, table, U } from "./session-helpers.ts";

const SET = marker("[set{}to]", 4);

/** The session's sketch commands, by type and run only. */
const commands = (out: { sketch: { type: string; run?: number }[] }) => out.sketch.map((c) => [c.type, c.run]);

/** `cards` with the one at `track` reading as `hw`. */
const reading = (cards: TableCard[], track: number, hw: Handwriting): TableCard[] =>
  cards.map((c) => (c.track === track ? { ...c, hw } : c));

/** A session showing run 1, an `[on(load)]` strip printing 1 (tracks 1-3, the num card 3), from t = 0. */
function running() {
  const session = createSession({ project, layout });
  session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1")) });
  session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
  return session;
}

/** The strip with a second print line whose num card (track 5) is `hw`. */
const withSecond = (hw: Handwriting) => reading(onLoad(1, 30, 30, "1", "2"), 5, hw);

describe("waiting for handwriting", () => {
  test("while a card is not read yet the old run keeps going; the new one starts once it's read", () => {
    const session = running();
    expect(commands(session.handle({ type: "table", now: 1, state: table(1, ...withSecond({ state: "not read yet" })) }))).toEqual([]);
    expect(commands(session.handle({ type: "table", now: 2, state: table(2, ...withSecond({ state: "read", text: "2" })) }))).toEqual([["start", 2]]);
  });
});

describe("the 5 s wait", () => {
  test("at 5 s the new run starts with the waiting line skipped, and again when its text arrives", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...withSecond({ state: "not read yet" })) });
    // The first num card's read flashes until 3 s; the old run draws on.
    session.handle({ type: "sketch", now: 3, message: { type: "frame", run: 1 } });
    expect(session.wakeAt).toBeCloseTo(6);
    expect(commands(session.handle({ type: "sketch", now: 5.9, message: { type: "frame", run: 1 } }))).toEqual([]);
    expect(commands(session.handle({ type: "tick", now: 6 }))).toEqual([["start", 2]]);
    expect(session.scene.feedback.gutters).toContainEqual(expect.objectContaining({ track: 4, dot: "waiting" }));
    expect(commands(session.handle({ type: "table", now: 7, state: table(7, ...withSecond({ state: "read", text: "2" })) }))).toContainEqual(["start", 3]);
  });

  test("a blank or a read error counts as read: the run starts at once", () => {
    for (const hw of [{ state: "blank" }, { state: "read error" }] as const) {
      const session = running();
      expect(commands(session.handle({ type: "table", now: 1, state: table(1, ...withSecond(hw)) }))).toEqual([["start", 2]]);
    }
  });

  test("a waiting line's follow-on errors are hidden while it waits", () => {
    const session = createSession({ project, layout });
    // [set{x}to][num{…}], then [call(print)][get{x}].
    const cards = strip(1, 30, 30, [ON_LOAD], [[SET, "x"], [NUM]], [[PRINT], [GET, "x"]]);
    session.handle({ type: "table", now: 0, state: table(0, ...reading(cards, 3, { state: "not read yet" })) });
    expect(session.scene.errors).toEqual([]);
    session.handle({ type: "table", now: 1, state: table(1, ...reading(cards, 3, { state: "read error" })) });
    expect(session.scene.errors.map((e) => e.kind)).toContain("NameError");
  });
});

describe("re-reads", () => {
  test("a card being re-read keeps its text: no restart, and the scene doesn't change", () => {
    const session = running();
    session.handle({ type: "tick", now: 4 });
    const before = session.scene;
    const out = session.handle({ type: "table", now: 4.5, state: table(4.5, ...reading(onLoad(1, 30, 30, "1"), 3, { state: "reading", text: "1" })) });
    expect(commands(out)).toEqual([]);
    expect(session.scene).toEqual(before);
    expect(commands(session.handle({ type: "table", now: 5, state: table(5, ...onLoad(1, 30, 30, "1")) }))).toEqual([]);
    expect(session.scene).toEqual(before);
  });
});

describe("read-back", () => {
  test("a not-yet-read card shows … on its whiteboard", () => {
    const session = running();
    session.handle({ type: "table", now: 1, state: table(1, ...withSecond({ state: "not read yet" })) });
    expect(session.scene.handwriting.readBack.map(({ track, text }) => ({ track, text }))).toContainEqual({ track: 5, text: "…" });
  });

  test("flashes for 3 s after each new read, on the card's whiteboard", () => {
    const session = running();
    const [flash] = session.scene.handwriting.readBack;
    expect(flash).toEqual({ track: 3, text: "1", at: expect.any(Object) });
    // [num{}] at 4U, laid at (90, 60): its whiteboard starts right of "num", inset 3 mm top and bottom.
    expect(flash!.at).toMatchObject({ y: 63, angle: 0, height: 24 });
    expect(flash!.at.x).toBeGreaterThan(90 + 17);
    expect(flash!.at.x + flash!.at.width).toBeCloseTo(90 + 4 * U - 3);
    expect(session.wakeAt).toBeCloseTo(3);
    session.handle({ type: "tick", now: 3 });
    expect(session.scene.handwriting.readBack).toEqual([]);
    session.handle({ type: "table", now: 4, state: table(4, ...onLoad(1, 30, 30, "7")) });
    expect(session.scene.handwriting.readBack.map((r) => r.text)).toEqual(["7"]);
  });

  test("a NameError shows read-back on the blamed card and on the cards defining the suggested name", () => {
    const session = createSession({ project, layout });
    const cards = strip(1, 30, 30, [ON_LOAD], [[SET, "score"], [NUM, "1"]], [[PRINT], [GET, "scare"]]);
    session.handle({ type: "table", now: 0, state: table(0, ...cards) });
    session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    // Past the reads' flash.
    session.handle({ type: "tick", now: 3 });
    expect(session.scene.errors.map((e) => e.message)).toEqual(["scare is not defined. Did you mean score?"]);
    expect(session.scene.handwriting.readBack.map(({ track, text }) => ({ track, text }))).toEqual([
      { track: 2, text: "score" },
      { track: 5, text: "scare" },
    ]);
  });

  test("a SyntaxError about a card's handwriting shows its read-back; one about where the card sits doesn't", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...strip(1, 30, 30, [ON_LOAD], [[PRINT], [NUM, "4o"]])) });
    session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    session.handle({ type: "tick", now: 3 });
    expect(session.scene.errors.map((e) => e.kind)).toEqual(["SyntaxError"]);
    expect(session.scene.handwriting.readBack.map(({ track, text }) => ({ track, text }))).toEqual([{ track: 3, text: "4o" }]);

    const other = createSession({ project, layout });
    other.handle({ type: "table", now: 0, state: table(0, ...strip(1, 30, 30, [ON_LOAD], [[NUM, "1"], [NUM, "2"]])) });
    other.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    other.handle({ type: "tick", now: 3 });
    expect(other.scene.errors.map((e) => [e.kind, e.cards])).toEqual([["SyntaxError", [{ track: 3 }]]]);
    expect(other.scene.handwriting.readBack).toEqual([]);
  });

  test("with the Debug setting on, every handwritten card shows read-back", () => {
    const session = createSession({ project, layout, tableSettings: { ...defaultTableSettings, readBack: true } });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 30, 30, "1", "2")) });
    session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    session.handle({ type: "tick", now: 3 });
    expect(session.scene.handwriting.readBack.map((r) => r.text)).toEqual(["1", "2"]);
  });
});

describe("no internet", () => {
  test("a connection error skips its line at once, with a yellow ! dot and the one status message; printed cards still run", () => {
    const session = running();
    const out = session.handle({ type: "table", now: 1, state: table(1, ...withSecond({ state: "connection error" })) });
    expect(commands(out)).toEqual([["start", 2]]);
    const { feedback, handwriting, errors } = session.scene;
    expect(feedback.gutters).toContainEqual(expect.objectContaining({ track: 4, dot: "no internet", badges: [] }));
    expect(feedback.lit).toEqual([]);
    expect(errors).toEqual([]);
    expect(handwriting.status).toBe("No internet: new handwriting can't be read. Printed cards still work.");
  });
});
