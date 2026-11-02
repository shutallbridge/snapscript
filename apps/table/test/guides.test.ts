// Virtual cards and textbook pages (#197): value guides after call cards, their overloads taking
// turns, a page's program as guide cards, mismatches, and the page cut-outs.
import { describe, expect, test } from "vitest";
import { createSession } from "../src/session.ts";
import { confetti, lay, libraryMarker } from "./feedback-helpers.ts";
import type { TableCard, TableState } from "@snapscript/table-reader";
import { layout, marker, NUM, table, U } from "./session-helpers.ts";

const RECT = libraryMarker("rect");
const FILL = libraryMarker("fill");
const SETUP = 406;
const RANDOM = marker("[call(random)]");

/** The value guides in the scene: each one's card and name. */
const valueGuides = (session: ReturnType<typeof createSession>) =>
  session.scene.virtual.filter((v) => v.kind === "value").map((v) => [v.text, v.value]);

describe("value guides", () => {
  test("after [call(p5.rect)], [num{…}] guides for x, y, width and height lie end to end after it", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [SETUP], [[RECT]])) });
    expect(valueGuides(session)).toEqual([
      ["[num{…}]", "x"],
      ["[num{…}]", "y"],
      ["[num{…}]", "width"],
      ["[num{…}]", "height"],
    ]);
    // The rect card is 2U, its top-left at (60, 90); the guides are 4U each.
    const ats = session.scene.virtual.filter((v) => v.kind === "value").map((v) => v.at);
    expect(ats.map((a) => [a.x, a.y, a.width])).toEqual([
      [60 + 2 * U, 90, 4 * U],
      [60 + 6 * U, 90, 4 * U],
      [60 + 10 * U, 90, 4 * U],
      [60 + 14 * U, 90, 4 * U],
    ]);
  });

  test("fill shows a colour-card guide", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [SETUP], [[FILL]])) });
    expect(valueGuides(session)).toEqual([["[color(…)]", "color"]]);
  });

  test("a detached call card gets none", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [RECT])) });
    expect(valueGuides(session)).toEqual([]);
  });

  test("a laid value's guide goes, and the rest stay", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [SETUP], [[RECT], [NUM, "300"]])) });
    expect(valueGuides(session)).toEqual([
      ["[num{…}]", "y"],
      ["[num{…}]", "width"],
      ["[num{…}]", "height"],
    ]);
  });
});

const SET = marker("[set{}to]", 4);

describe("overloads", () => {
  test("with nothing laid, random's forms take turns once a second", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [SETUP], [[SET, "x"], [RANDOM]])) });
    expect(valueGuides(session)).toEqual([["[num{…}]", "end"]]);
    expect(session.wakeAt).toBeCloseTo(1);
    session.handle({ type: "tick", now: 1 });
    expect(valueGuides(session)).toEqual([
      ["[num{…}]", "start"],
      ["[num{…}]", "end"],
    ]);
    session.handle({ type: "tick", now: 2 });
    expect(valueGuides(session)).toEqual([["[num{…}]", "end"]]);
  });

  test("laying a value settles on the form it fits, preferring exactly that many values", () => {
    const session = createSession({ project: confetti, layout });
    const strip = (...values: string[]) => lay(1, 60, 60, [SETUP], [[SET, "x"], [RANDOM], ...values.map((v): [number, string] => [NUM, v])]);
    session.handle({ type: "table", now: 0, state: table(0, ...strip()) });
    session.handle({ type: "table", now: 1.5, state: table(1.5, ...strip("1", "500")) });
    // Two laid: random(start, end), with nothing left to show.
    expect(valueGuides(session)).toEqual([]);
    session.handle({ type: "table", now: 1.5, state: table(1.5, ...strip("500")) });
    // One value laid: exactly random(end), so nothing more is asked for, and the turns stop.
    expect(valueGuides(session)).toEqual([]);
    session.handle({ type: "tick", now: 2.5 });
    expect(valueGuides(session)).toEqual([]);
  });

  test("with more laid than a form takes, it settles on the shortest longer one", () => {
    const session = createSession({ project: confetti, layout });
    // circle takes x, y and d: with two laid, d is left.
    const CIRCLE = libraryMarker("circle");
    session.handle({ type: "table", now: 0, state: table(0, ...lay(1, 60, 60, [SETUP], [[CIRCLE], [NUM, "1"], [NUM, "2"]])) });
    expect(valueGuides(session)).toEqual([["[num{…}]", "d"]]);
  });
});

const CANVAS = libraryMarker("createCanvas");
const BACKGROUND = libraryMarker("background");
const CIRCLE = libraryMarker("circle");
const BLUE = marker("[color(mediumblue)]");
/** confetti's pages 2 and 3, by marker: page 2 asks for createCanvas and background, page 3 adds a rect. */
const PAGE_2 = 409;
const PAGE_3 = 410;

/** A page lying upright in the canvas space, its marker's centre at (x, y): track 50. */
const page = (marker: number, x = 600, y = 400): TableCard => ({ track: 50, marker, x, y, angle: 0 });

/** A table state with a page on it as the current page. */
const withPage = (t: number, p: TableCard | null, ...cards: TableCard[]): TableState => ({
  ...table(t, ...cards, ...(p ? [p] : [])),
  page: p?.track ?? null,
});

const guideCards = (session: ReturnType<typeof createSession>) =>
  session.scene.virtual.filter((v) => v.kind === "guide").map((v) => v.text);

describe("a page's guides", () => {
  test("with no setup strip of our own, the page's whole program is stacked in the coding space, its head included", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2)) });
    expect(guideCards(session)).toEqual(["[define(setup)]", "[call(p5.createCanvas)]", "[num{500}]", "[num{500}]", "[call(p5.background)]", "[color(mediumblue)]"]);
    // Auto stacking: the first strip 4U from the coding space's top and left.
    expect(session.scene.virtual.find((v) => v.text === "[define(setup)]")!.at).toMatchObject({ x: 4 * U, y: 4 * U, angle: 0 });
  });

  test("library guides carry their function colour; define guides none", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2)) });
    const colors = Object.fromEntries(session.scene.virtual.map((v) => [v.text, v.functionColor]));
    expect(colors["[call(p5.createCanvas)]"]).toBe(confetti.cards.find((c) => c.name === "createCanvas")!.functionColor);
    expect(colors["[call(p5.createCanvas)]"]).not.toBeNull();
    expect(colors["[define(setup)]"]).toBeNull();
  });

  test("with our own [define(setup)] strip, they go under it, and only what's missing shows", () => {
    const session = createSession({ project: confetti, layout });
    const ours = lay(1, 30, 300, [SETUP], [[CANVAS], [NUM, "500"], [NUM, "500"]]);
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2), ...ours) });
    session.handle({ type: "table", now: 1, state: withPage(1, page(PAGE_2), ...ours) });
    expect(guideCards(session)).toEqual(["[call(p5.background)]", "[color(mediumblue)]"]);
    // background's line is the strip's second line: 2U under its head.
    expect(session.scene.virtual.find((v) => v.text === "[call(p5.background)]")!.at).toMatchObject({ x: 30, y: 300 + 2 * U });
  });

  test("turning the page swaps the guides at the next table state, and taking it away removes them", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2)) });
    session.handle({ type: "table", now: 0.2, state: withPage(0.2, page(PAGE_3)) });
    expect(guideCards(session)).toContain("[call(p5.rect)]");
    session.handle({ type: "table", now: 0.4, state: withPage(0.4, null) });
    expect(session.scene.virtual).toEqual([]);
  });

  test("a page from a textbook the project doesn't have shows no guides, and the status bar says so", () => {
    const lockfile = new Map(confetti.lockfile);
    lockfile.set(499, { kind: "page", textbook: "snapscript-sound-basics", volume: "beeps", page: 1 });
    const session = createSession({ project: { ...confetti, lockfile }, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(499)) });
    expect(session.scene.virtual).toEqual([]);
    expect(session.scene.status).toEqual(["This page is from snapscript-sound-basics, which isn't in this project, so it shows no guides."]);
    session.handle({ type: "table", now: 0.2, state: withPage(0.2, page(PAGE_2)) });
    expect(session.scene.status).toEqual([]);
  });
});

describe("cards laid on a page's guides", () => {
  /** Our setup strip, as page 2 asks, with `last` laid where page 3's rect goes. */
  const ours = (last: number) => lay(1, 30, 300, [SETUP], [[CANVAS], [NUM, "500"], [NUM, "500"]], [[BACKGROUND], [BLUE]], [[last]]);

  test("the right card clears its guide; a different number counts as right", () => {
    const session = createSession({ project: confetti, layout });
    const cards = lay(1, 30, 300, [SETUP], [[CANVAS], [NUM, "300"], [NUM, "500"]]);
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2), ...cards) });
    session.handle({ type: "table", now: 1, state: withPage(1, page(PAGE_2), ...cards) });
    expect(guideCards(session)).toEqual(["[call(p5.background)]", "[color(mediumblue)]"]);
    expect(session.scene.errors).toEqual([]);
  });

  test("[call(p5.circle)] on the [call(p5.rect)] guide lights as a mismatch, and still runs", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_3), ...ours(CIRCLE)) });
    const out = session.handle({ type: "table", now: 1, state: withPage(1, page(PAGE_3), ...ours(CIRCLE)) });
    const mismatch = session.scene.errors.find((e) => e.from === "table");
    expect(mismatch).toEqual({ from: "table", kind: null, message: "Not the card the page shows (rect). It still runs.", cards: [{ track: 7 }] });
    expect(session.scene.feedback.lit.map((l) => l.card)).toContainEqual({ track: 7 });
    expect(session.scene.feedback.errorBar.map((e) => e.text)).toContain("Not the card the page shows (rect). It still runs.");
    // A mismatch changes no text: the run started with the circle card isn't restarted.
    expect(out.sketch).toEqual([]);
    expect(session.scene.cards).toContainEqual({ track: 7 });
  });

  test("a call card on a page guide shows the page's guides, not its own value guides", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_3), ...ours(RECT)) });
    session.handle({ type: "table", now: 1, state: withPage(1, page(PAGE_3), ...ours(RECT)) });
    expect(valueGuides(session)).toEqual([]);
    expect(guideCards(session)).toEqual(["[num{300}]", "[num{300}]", "[num{10}]", "[num{16}]"]);
  });
});

describe("page cut-outs", () => {
  test("every page on the table is cut out by its A4 outline, placed from its marker at the bottom right", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, page(PAGE_2, 600, 400)) });
    expect(session.scene.pages).toEqual([{ track: 50, outline: { x: 600 - 193.5, y: 400 - 280.5, angle: 0, width: 210, height: 297 } }]);
  });

  test("a turned page's outline turns with its marker", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: withPage(0, { ...page(PAGE_2, 600, 400), angle: 90 }) });
    const { outline } = session.scene.pages[0]!;
    // Turned a quarter, the page's top-left lies 280.5 mm right of the marker and 193.5 mm above it.
    expect(outline.angle).toBe(90);
    expect(outline.x).toBeCloseTo(600 + 280.5);
    expect(outline.y).toBeCloseTo(400 - 193.5);
  });
});
