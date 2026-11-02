// Card feedback (#195, #129's look): what the table session's scene says to light, mark and write.
import { describe, expect, test } from "vitest";
import { createSession } from "../src/session.ts";
import type { TableCard } from "@snapscript/table-reader";
import { confetti, lay, libraryErrors, libraryMarker, markerZone, overlap, printsOf, stuckAt } from "./feedback-helpers.ts";
import { card, DEFINE, DIVIDE, GET, layout, marker, NUM, ON_LOAD, PRINT, project, runErrors, table, U } from "./session-helpers.ts";

const CIRCLE = libraryMarker("circle");

describe("a check error", () => {
  test("[call(p5.circle)][num{20}] lights the circle card, with badge E1 in its gutter and its message in the bottom bar", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[CIRCLE], [NUM, "20"]])) });
    const { feedback } = session.scene;
    expect(feedback.lit.map((l) => l.card)).toEqual([{ track: 2 }]);
    expect(feedback.gutters).toContainEqual(expect.objectContaining({ track: 2, dot: "skipped", badges: ["E1"] }));
    expect(feedback.errorBar).toEqual([{ badge: "E1", text: "TypeError: circle takes 3 values" }]);
  });
});

const SET = marker("[set{}to]", 4);
const REPEAT = marker("[repeat]");

describe("the gutter", () => {
  test("a recognised strip head gets a green dot; a skipped line and a detached card a crossed-out grey one", () => {
    const session = createSession({ project: confetti, layout });
    const state = table(0, ...lay(1, 60, 60, [ON_LOAD], [[SET, "x"]], [[PRINT], [NUM, "1"]]), card(9, NUM, 60, 300, "5"));
    session.handle({ type: "table", now: 0, state });
    const gutters = session.scene.feedback.gutters.map(({ track, dot, badges }) => ({ track, dot, badges }));
    expect(gutters).toEqual([
      { track: 1, dot: "ok", badges: [] },
      { track: 2, dot: "skipped", badges: ["E1"] },
      { track: 9, dot: "skipped", badges: [] },
    ]);
  });

  test("badges go in program order: lines top to bottom, then along each line", () => {
    const session = createSession({ project: confetti, layout });
    // The lower strip is laid first, so it comes first in the buffer.
    const lower = lay(1, 30, 240, [DEFINE, "f"], [[PRINT], [GET, "a"], [GET, "b"]]);
    const upper = lay(10, 200, 60, [DEFINE, "g"], [[PRINT], [GET, "c"]]);
    session.handle({ type: "table", now: 0, state: table(0, ...lower) });
    session.handle({ type: "table", now: 1, state: table(1, ...lower, ...upper) });
    expect(session.scene.cards.slice(0, 2)).toEqual([{ track: 1 }, { track: 2 }]);
    const { errorBar, gutters } = session.scene.feedback;
    expect(errorBar.map((e) => e.text)).toEqual(["NameError: c is not defined", "NameError: a is not defined", "NameError: b is not defined"]);
    expect(errorBar.map((e) => e.badge)).toEqual(["E1", "E2", "E3"]);
    expect(gutters.filter((g) => g.badges.length).map(({ track, badges }) => [track, badges])).toEqual([
      [2, ["E2", "E3"]],
      [11, ["E1"]],
    ]);
  });

  test("its marks sit left of the line's first card, which is where it's drawn from", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[PRINT], [NUM, "1"]])) });
    expect(session.scene.feedback.gutters[0]!.at).toEqual({ x: 60, y: 60, angle: 0, width: 3 * U, height: U });
  });
});

describe("a follow-on error", () => {
  test("names the badge of the skipped line it comes from", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[SET, "x"]], [[PRINT], [GET, "x"]])) });
    expect(session.scene.feedback.errorBar).toEqual([
      { badge: "E1", text: "SyntaxError: [set{x}to] needs a value" },
      { badge: "E2", text: "NameError: x is set on a line that's skipped (E1)" },
    ]);
  });
});

describe("table errors light their card, with a badge and a message", () => {
  test("a card whose handwriting can't be read", () => {
    const session = createSession({ project: confetti, layout });
    const cards = lay(1, 60, 60, [ON_LOAD], [[PRINT], [NUM]]);
    cards[2]!.hw = { state: "read error" };
    session.handle({ type: "table", now: 0, state: table(0, ...cards) });
    const { lit, errorBar, gutters } = session.scene.feedback;
    expect(lit.map((l) => l.card)).toEqual([{ track: 3 }]);
    expect(errorBar).toEqual([{ badge: "E1", text: "Can't read this num card's handwriting. Write it again more clearly." }]);
    expect(gutters).toContainEqual(expect.objectContaining({ track: 2, dot: "skipped", badges: ["E1"] }));
  });

  test("a card the table doesn't know", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[PRINT], [999]])) });
    const { lit, errorBar, gutters } = session.scene.feedback;
    expect(lit.map((l) => l.card)).toEqual([{ track: 3 }]);
    expect(errorBar).toEqual([{ badge: "E1", text: "Unknown card: the table doesn't know this card." }]);
    expect(gutters).toContainEqual(expect.objectContaining({ track: 2, dot: "skipped", badges: ["E1"] }));
  });

  test("a frozen sketch lights the card it is stuck at, after 3 s", () => {
    const session = createSession({ project, layout });
    const start = session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[REPEAT], [NUM, "1000000000"]])) }).sketch[0];
    if (start?.type !== "start") throw new Error("no run started");
    expect(session.handle({ type: "tick", now: 3 }).sketch).toEqual([{ type: "kill process" }]);
    const span = stuckAt(start.js);
    session.handle({ type: "sketch", now: 3.1, message: { type: "stuck", run: start.run, span } });
    const { lit, errorBar } = session.scene.feedback;
    expect(lit.map((l) => l.card)).toEqual([{ track: 2 }]);
    expect(errorBar).toEqual([{ badge: "E1", text: "Frozen sketch: it stopped responding for 3 s, so the table stopped it." }]);
  });

  test("a library error lights the card that called into the library", () => {
    const session = createSession({ project: confetti, layout });
    const state = table(0, ...lay(1, 60, 60, [ON_LOAD], [[CIRCLE], [NUM, "1"], [NUM, "2"], [NUM, "3"]]));
    const start = session.handle({ type: "table", now: 0, state }).sketch[0];
    if (start?.type !== "start") throw new Error("no run started");
    const [error] = libraryErrors(start.js, "circle", "no canvas");
    session.handle({ type: "sketch", now: 0.1, message: { type: "error", run: 1, error: error! } });
    const { lit, errorBar } = session.scene.feedback;
    expect(lit.map((l) => l.card)).toEqual([{ track: 2 }]);
    expect(errorBar).toEqual([{ badge: "E1", text: "snapscript-p5 broke inside circle: no canvas" }]);
  });
});

describe("a runtime error", () => {
  test("lights the card where it happened, and the run is shown with what it drew, not killed", () => {
    const session = createSession({ project, layout });
    const start = session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [ON_LOAD], [[PRINT], [NUM, "1"], [DIVIDE], [NUM, "0"]])) }).sketch[0];
    if (start?.type !== "start") throw new Error("no run started");
    const [error] = runErrors(start.js);
    const out = session.handle({ type: "sketch", now: 0.1, message: { type: "error", run: start.run, error: error! } });
    expect(out.sketch).toEqual([{ type: "show", run: 1 }]);
    expect(session.handle({ type: "tick", now: 10 }).sketch).toEqual([]);
    const { lit, errorBar } = session.scene.feedback;
    expect(lit.map((l) => l.card)).toEqual([{ track: 4 }]);
    expect(errorBar).toEqual([{ badge: "E1", text: `ZeroDivisionError: ${error!.message}` }]);
  });
});

describe("nothing lit covers a marker zone", () => {
  test("every card's marker zone is kept clear, and a lit face never takes in its own card's", () => {
    const session = createSession({ project: confetti, layout });
    // A detached [num{5}] lies half over the circle card's face, its marker zone on it.
    const cards = [...lay(1, 60, 60, [ON_LOAD], [[CIRCLE], [NUM, "20"]]), card(9, NUM, 85, 95, "5")];
    session.handle({ type: "table", now: 0, state: table(0, ...cards) });
    const { lit, keepClear } = session.scene.feedback;
    expect(lit).toHaveLength(1);
    for (const c of cards) expect(keepClear).toContainEqual(markerZone(c));
    expect(overlap(lit[0]!.face, markerZone(cards[1]!))).toBe(false);
    // The neighbour's marker is under the lit face: the table view cuts it out, as it is kept clear.
    expect(overlap(lit[0]!.face, markerZone(cards[3]!))).toBe(true);
  });
});

describe("print output", () => {
  /** A session running `[call(print)][num{7}]`, with its output sent, and `more` cards on the table too. */
  function printing(...more: TableCard[]) {
    const session = createSession({ project, layout });
    const cards = lay(1, 60, 60, [ON_LOAD], [[PRINT], [NUM, "7"]]);
    const start = session.handle({ type: "table", now: 0, state: table(0, ...cards, ...more) }).sketch[0];
    if (start?.type !== "start") throw new Error("no run started");
    session.handle({ type: "sketch", now: 0.1, message: { type: "frame", run: 1 } });
    session.handle({ type: "sketch", now: 0.1, message: { type: "print", run: 1, prints: printsOf(start.js) } });
    return { session, cards, span: printsOf(start.js)[0]!.span };
  }

  test("goes right of its [call(print)] line, starting after the line's last card", () => {
    const { session } = printing();
    // The line: [call(print)] (2U) from x = 60, then [num{7}] (4U), so it ends at 240 mm.
    expect(session.scene.feedback.prints).toEqual([{ text: "7", at: { x: 246, y: 90, angle: 0, width: 720, height: U } }]);
  });

  test("runs only up to the next marker zone in its way", () => {
    const next = card(9, NUM, 400, 95, "5");
    const { session, cards } = printing(next);
    const [print] = session.scene.feedback.prints;
    expect(print!.at.width).toBeCloseTo(400 - 246);
    for (const c of [...cards, next]) expect(overlap(print!.at, markerZone(c))).toBe(false);
  });

  test("is the newest a card printed, from the run on show", () => {
    const { session, span } = printing();
    session.handle({ type: "sketch", now: 0.2, message: { type: "print", run: 1, prints: [{ text: "8", span }] } });
    expect(session.scene.feedback.prints.map((p) => p.text)).toEqual(["8"]);
    // Run 2 prints before its first frame: run 1 still shows, with its own output.
    session.handle({ type: "table", now: 1, state: table(1, ...lay(1, 60, 60, [ON_LOAD], [[PRINT], [NUM, "9"]])) });
    session.handle({ type: "sketch", now: 1.1, message: { type: "print", run: 2, prints: [{ text: "9", span }] } });
    expect(session.scene.feedback.prints.map((p) => p.text)).toEqual(["8"]);
    session.handle({ type: "sketch", now: 1.2, message: { type: "frame", run: 2 } });
    expect(session.scene.feedback.prints.map((p) => p.text)).toEqual(["9"]);
  });
});
