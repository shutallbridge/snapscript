// projects/confetti, the one PoC project (#192): the loader reads it, its lockfile is pnpm lock's,
// and its kit is the Stage 1 bases' (#158).
import { cpSync, mkdtempSync, readFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { languageMarkers } from "@snapscript/core";
import { lock } from "../src/lock.ts";
import { loadKit } from "../src/kit.ts";
import { loadProject } from "../src/project.ts";

const confetti = fileURLToPath(new URL("../../../projects/confetti/", import.meta.url));

/** A copy of the project in a temporary folder, its node_modules linked to the real one's. */
function copy(): string {
  const dir = join(mkdtempSync(join(tmpdir(), "snapscript-confetti-")), "confetti");
  cpSync(confetti, dir, { recursive: true, filter: (path) => !path.includes("node_modules") });
  symlinkSync(join(confetti, "node_modules"), join(dir, "node_modules"), "dir");
  return dir;
}

describe("projects/confetti", () => {
  test("has the five files a p5 project has", () => {
    const manifest = JSON.parse(readFileSync(join(confetti, "package.json"), "utf8"));
    expect(manifest.snapscript).toBe("main.snap");
    expect(Object.keys(manifest.dependencies)).toEqual(["snapscript-p5", "snapscript-p5-getting-started"]);
    expect(readFileSync(join(confetti, "main.snap"), "utf8")).toBe("/** @table hidden */\n[import(snapscript-p5)as(p5)]\n");
    expect(readFileSync(join(confetti, "README.md"), "utf8")).toContain("one PoC project");
    for (const file of ["snapscript.lock", "kit.yaml"]) expect(() => readFileSync(join(confetti, file))).not.toThrow();
  });

  test("loads: snapscript-p5's cards from 400, then every confetti.md page, then the cards added since", () => {
    const project = loadProject(confetti);
    expect(project.languageMarkers).toBe(languageMarkers);
    expect(project.cards.map(({ text, length, marker }) => [marker, text, length])).toEqual([
      [417, "[get(snapscript-p5.frameCount)]", 3],
      [400, "[call(snapscript-p5.createCanvas)]", 4],
      [401, "[call(snapscript-p5.background)]", 3],
      [402, "[call(snapscript-p5.noStroke)]", 3],
      [403, "[call(snapscript-p5.fill)]", 2],
      [404, "[call(snapscript-p5.rect)]", 2],
      [405, "[call(snapscript-p5.circle)]", 2],
      [418, "[call(snapscript-p5.noise)]", 2],
      [406, "[define(setup)]", 4],
      [407, "[define(draw)]", 3],
    ]);
    expect(project.pages.map(({ textbook, volume, page, marker }) => [marker, `${textbook}/${volume}`, page])).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8, 9].map((page) => [407 + page, "snapscript-p5-getting-started/confetti", page]),
    );
    expect(project.pages[0]).toMatchObject({ heading: "Before We Get Started", program: null });
    expect(project.lockfile.size).toBe(19);
  });

  test("its lockfile is pnpm lock's: running it again adds nothing", () => {
    const dir = copy();
    expect(lock(dir)).toEqual([]);
    expect(readFileSync(join(dir, "snapscript.lock"), "utf8")).toBe(readFileSync(join(confetti, "snapscript.lock"), "utf8"));
  });

  test("its kit is the Stage 1 bases' (#158): 57 sheets, handwritten cards at 4U only, each side with its marker", () => {
    const kit = loadKit(loadProject(confetti));
    const side = (card: string, length: number, marker: number) => ({ card, length, marker });
    expect(kit.map(({ sides, sheets }) => [sheets, ...sides.map(({ card, length, marker }) => side(card, length, marker!))])).toEqual([
      // call 2U ×13
      [3, side("[call(p5.fill)]", 2, 403)],
      [3, side("[call(p5.rect)]", 2, 404)],
      [6, side("[call(random)]", 2, 40)],
      [1, side("[call(p5.circle)]", 2, 405)],
      // call 3U ×2, call 4U ×1, define 4U ×1
      [1, side("[call(p5.background)]", 3, 401)],
      [1, side("[call(p5.noStroke)]", 3, 402)],
      [1, side("[call(p5.createCanvas)]", 4, 400)],
      [1, side("[define(setup)]", 4, 406)],
      // literal 4U ×17, simple_head 4U ×6, get 4U ×7
      [17, side("[num{}]", 4, 65), side("[str{}]", 4, 70)],
      [6, side("[set{}to]", 4, 50)],
      [7, side("[get{}]", 4, 55)],
      // color 4U ×4
      [1, side("[color(mediumblue)]", 4, 42), side("[color(deepskyblue)]", 4, 43)],
      [1, side("[color(gold)]", 4, 44), side("[color(yellow)]", 4, 45)],
      [1, side("[color(hotpink)]", 4, 46), side("[color(tomato)]", 4, 47)],
      [1, side("[color(aquamarine)]", 4, 48), side("[color(limegreen)]", 4, 49)],
      // block_head 2U ×3, dedent 2U ×3
      [3, side("[repeat]", 2, 19)],
      [3, side("[dedent]", 2, 20)],
    ]);
    expect(kit.reduce((total, { sheets }) => total + sheets, 0)).toBe(57);
  });
});
