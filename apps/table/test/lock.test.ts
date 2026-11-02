import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { lock } from "../src/lock.ts";
import { loadProject } from "../src/project.ts";
import { fixtureProject } from "./helpers.ts";

const lockfileOf = (dir: string): string => readFileSync(join(dir, "snapscript.lock"), "utf8");

describe("pnpm lock", () => {
  test("adds each missing library card and page at the next free ID from 400, keeping the entries there", () => {
    const dir = fixtureProject();
    lock(dir);
    expect(lockfileOf(dir)).toBe(
      [
        "# Marker IDs for this project's library cards and textbook pages, kept by pnpm lock.",
        "400 = call fixture-shapes.square 2",
        "402 = call fixture-shapes.retired 2",
        "403 = call fixture-shapes.starburst 3",
        "404 = define fixture-shapes.setup 4",
        "405 = define fixture-shapes.draw 3",
        "406 = page fixture-lessons/first 1",
        "407 = page fixture-lessons/first 2",
        "408 = page fixture-lessons/first 3",
        "409 = page fixture-lessons/second 1",
        "",
      ].join("\n"),
    );
  });

  test("gives the define cards their shortest lengths from the faces' rule: define setup 4U, define draw 3U", () => {
    const dir = fixtureProject();
    lock(dir);
    const defines = [...loadProject(dir).lockfile.values()].filter((e) => e.kind === "library" && e.card === "define");
    expect(defines).toEqual([
      { kind: "library", card: "define", package: "fixture-shapes", name: "setup", length: 4 },
      { kind: "library", card: "define", package: "fixture-shapes", name: "draw", length: 3 },
    ]);
  });

  test("starts at 400 with no lockfile, and the loaded cards and pages then have markers", () => {
    const dir = fixtureProject({ lock: null });
    lock(dir);
    const project = loadProject(dir);
    expect(project.cards.map((c) => c.marker)).toEqual([400, 401, 402, 403]);
    expect(project.pages.map((p) => p.marker)).toEqual([404, 405, 406, 407]);
  });

  test("never renumbers, and adds nothing when nothing is missing", () => {
    const dir = fixtureProject();
    lock(dir);
    const first = lockfileOf(dir);
    expect(lock(dir)).toEqual([]);
    expect(lockfileOf(dir)).toBe(first);
  });

  test("never reuses a removed card's ID, even the highest", () => {
    const dir = fixtureProject({ lock: "400 = call fixture-shapes.square 2\n401 = call fixture-shapes.retired 2\n" });
    const added = lock(dir);
    expect(added[0]).toBe("402 = call fixture-shapes.starburst 3");
    expect(lockfileOf(dir)).toContain("401 = call fixture-shapes.retired 2\n");
  });

  test("returns the lines it added", () => {
    const dir = fixtureProject({ dependencies: ["fixture-shapes"], lock: null });
    expect(lock(dir)).toEqual([
      "400 = call fixture-shapes.square 2",
      "401 = call fixture-shapes.starburst 3",
      "402 = define fixture-shapes.setup 4",
      "403 = define fixture-shapes.draw 3",
    ]);
  });
});
