// The help corner (#198): a card on the bottom-left corner shows its help beside it.
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import type { Layout, TableCard } from "@snapscript/table-reader";
import { loadProject } from "../src/project.ts";
import { createSession } from "../src/session.ts";
import { marker, NUM, onLoad, project, table, U } from "./session-helpers.ts";

const confetti = loadProject(fileURLToPath(new URL("../../../projects/confetti/", import.meta.url)));
/** The lockfile's ID for one of snapscript-p5's cards. */
const p5Card = (card: string, name: string): number =>
  [...confetti.lockfile].find(([, e]) => e.kind === "library" && e.card === card && e.name === name)![0];

// An 800 x 600 mm table, split in half, with its four 3.5U corners.
const R = 3.5 * U;
const layout: Layout = {
  codingSpace: { x: 0, y: 0, width: 400, height: 600 },
  canvasSpace: { x: 400, y: 0, width: 400, height: 600 },
  corners: [
    { name: "top-left", x: 0, y: 0, radius: R },
    { name: "top-right", x: 800, y: 0, radius: R },
    { name: "bottom-left", x: 0, y: 600, radius: R },
    { name: "bottom-right", x: 800, y: 600, radius: R },
  ],
};

/** A card with its marker's centre at (x, y) mm, turned `angle` degrees. */
const at = (track: number, m: number, x: number, y: number, angle = 0, text?: string): TableCard => ({
  track,
  marker: m,
  x,
  y,
  angle,
  ...(text === undefined ? {} : { hw: { state: "read" as const, text } }),
});
/** A card laid on the help corner, its marker 1.5U in from the table's bottom-left. */
const onCorner = (track: number, m: number, text?: string): TableCard => at(track, m, 1.5 * U, 600 - 1.5 * U, 0, text);

describe("what the help box says", () => {
  test("a library card shows its label, its sentence and a line per value, in the order the cards sit", () => {
    const session = createSession({ project: confetti, layout });
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, p5Card("call", "rect"))) });
    expect(session.scene.help).toMatchObject({
      label: "rect",
      sentence: "Draws a rectangle. x and y are its top-left corner, and y grows downward.",
      values: [{ name: "x" }, { name: "y" }, { name: "width" }, { name: "height" }],
    });
  });
});

describe("names ignore case (ADR 0008)", () => {
  test("a lockfile line in another case still finds its card's help", () => {
    const id = p5Card("call", "rect");
    const entry = confetti.lockfile.get(id)!;
    const lockfile = new Map(confetti.lockfile).set(id, { ...entry, name: "RECT" } as typeof entry);
    const session = createSession({ project: { ...confetti, lockfile }, layout });
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, id)) });
    expect(session.scene.help).toMatchObject({ label: "rect", sentence: expect.stringMatching(/^Draws a rectangle/) });
  });
});

describe("what the help box says, for language cards", () => {
  test("a builtin's help comes from core's table", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, marker("[call(random)]"))) });
    expect(session.scene.help).toMatchObject({
      label: "random",
      sentence: expect.stringMatching(/./),
      values: [{ name: "start" }, { name: "end" }],
    });
    expect(session.scene.help!.sentence).not.toBe("No help for this card");
  });

  test.each([
    ["[repeat]", undefined, "repeat"],
    ["[num{}]", "500", "num"],
  ])("%s shows its label and No help for this card", (card, text, label) => {
    const session = createSession({ project, layout });
    const m = card === "[num{}]" ? NUM : marker(card);
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, m, text)) });
    expect(session.scene.help).toMatchObject({ label, sentence: "No help for this card", values: [] });
  });
});

describe("when the help box shows", () => {
  const RANDOM = marker("[call(random)]");

  test("at once, and until its card has been gone for 1 s", () => {
    const session = createSession({ project, layout });
    expect(session.scene.help).toBeNull();
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, RANDOM)) });
    expect(session.scene.help).not.toBeNull();
    // The table may stay still, sending no states: the second counts from when the card is seen gone.
    session.handle({ type: "table", now: 2, state: table(2) });
    expect(session.scene.help).not.toBeNull();
    expect(session.wakeAt).toBeCloseTo(3);
    session.handle({ type: "tick", now: 2.9 });
    expect(session.scene.help).not.toBeNull();
    session.handle({ type: "tick", now: 3 });
    expect(session.scene.help).toBeNull();
    expect(session.wakeAt).toBeNull();
  });

  test("a brief wobble, the card gone and back within 1 s, doesn't close it", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, RANDOM)) });
    session.handle({ type: "table", now: 0.5, state: table(0.5) });
    session.handle({ type: "table", now: 1.2, state: table(1.2, at(1, RANDOM, 1.6 * U, 600 - 1.4 * U, 4)) });
    session.handle({ type: "tick", now: 1.6 });
    expect(session.scene.help).toMatchObject({ label: "random" });
    expect(session.wakeAt).toBeNull();
  });

  test("a card beside the corner, or a hand's worth of nothing, shows nothing", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, at(1, RANDOM, 4 * U, 600 - 1.5 * U)) });
    expect(session.scene.help).toBeNull();
  });

  test("the card shown stays while it lies there, and a second card there takes over once it's gone", () => {
    const session = createSession({ project, layout });
    const repeat = at(2, marker("[repeat]"), 1 * U, 600 - 2.5 * U);
    session.handle({ type: "table", now: 0, state: table(0, onCorner(1, RANDOM)) });
    session.handle({ type: "table", now: 1, state: table(1, repeat, onCorner(1, RANDOM)) });
    expect(session.scene.help).toMatchObject({ label: "random" });
    session.handle({ type: "table", now: 2, state: table(2, repeat) });
    expect(session.scene.help).toMatchObject({ label: "repeat" });
  });

  test("laying a card on the corner restarts nothing", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 4 * U, 30, "1")) });
    const laid = session.handle({ type: "table", now: 1, state: table(1, ...onLoad(1, 4 * U, 30, "1"), onCorner(9, RANDOM)) });
    expect(laid.sketch).toEqual([]);
    expect(session.scene.cards).toHaveLength(3);
  });
});

describe("where the help box goes", () => {
  /** The card's outline: its four corners, from its marker's centre and angle and its length in U. */
  function outline(c: TableCard, length: number): [number, number][] {
    const a = (c.angle * Math.PI) / 180;
    const [ux, uy, vx, vy] = [Math.cos(a), Math.sin(a), -Math.sin(a), Math.cos(a)];
    return [
      [-8.5, -15],
      [length * U - 8.5, -15],
      [length * U - 8.5, 15],
      [-8.5, 15],
    ].map(([p, q]) => [c.x + p! * ux + q! * vx, c.y + p! * uy + q! * vy]);
  }

  test.each([0, 30, 45, 90, 135, 180, 225, 270, 315, -20])(
    "it sits along the bottom, 0.5U clear of the circle and 1U clear of a 4U card at %i°",
    (angle) => {
      const session = createSession({ project: confetti, layout });
      const c = at(1, p5Card("call", "createCanvas"), 1.5 * U, 600 - 1.5 * U, angle);
      session.handle({ type: "table", now: 0, state: table(0, c) });
      const box = session.scene.help!;
      expect(box.y).toBeCloseTo(600 - 0.5 * U);
      expect(box.x).toBeGreaterThanOrEqual(R + 0.5 * U - 1e-9);
      for (const [x] of outline(c, 4)) expect(box.x - x).toBeGreaterThanOrEqual(U - 1e-9);
    },
  );

  test("with a short card upright it hugs the circle", () => {
    const session = createSession({ project, layout });
    session.handle({ type: "table", now: 0, state: table(0, at(1, marker("[call(random)]"), U, 600 - 1.5 * U)) });
    expect(session.scene.help!.x).toBeCloseTo(R + 0.5 * U);
  });
});
