// projects/confetti, the one PoC project (#192): the loader reads it, its lockfile is pnpm lock's,
// and its kit is the Stage 1 bases' (#158) and demo programs 2 and 3's (#109).
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
      [419, "[get(snapscript-p5.width)]", 2],
      [420, "[get(snapscript-p5.height)]", 2],
      [421, "[get(snapscript-p5.windowWidth)]", 3],
      [422, "[get(snapscript-p5.windowHeight)]", 4],
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
    expect(project.lockfile.size).toBe(23);
  });

  test("its lockfile is pnpm lock's: running it again adds nothing", () => {
    const dir = copy();
    expect(lock(dir)).toEqual([]);
    expect(readFileSync(join(dir, "snapscript.lock"), "utf8")).toBe(readFileSync(join(confetti, "snapscript.lock"), "utf8"));
  });

  test("its kit is the Stage 1 bases' (#158) and demo programs 2 and 3's: 81 sheets, handwritten cards at 4U only, each side with its marker", () => {
    const kit = loadKit(loadProject(confetti));
    const side = (card: string, length: number, marker: number) => ({ card, length, marker });
    expect(kit.map(({ sides, sheets }) => [sheets, ...sides.map(({ card, length, marker }) => side(card, length, marker!))])).toEqual([
      // call 2U ×17
      [3, side("[call(p5.fill)]", 2, 403)],
      [3, side("[call(p5.rect)]", 2, 404)],
      [6, side("[call(random)]", 2, 40)],
      [1, side("[call(p5.circle)]", 2, 405)],
      [1, side("[call(list)]", 2, 31)],
      [1, side("[call(p5.noise)]", 2, 418)],
      [2, side("[call(range)]", 2, 29)],
      // call 3U ×2, call 4U ×1, define 4U ×1, define 3U ×1
      [1, side("[call(p5.background)]", 3, 401)],
      [1, side("[call(p5.noStroke)]", 3, 402)],
      [1, side("[call(p5.createCanvas)]", 4, 400)],
      [1, side("[define(setup)]", 4, 406)],
      [1, side("[define(draw)]", 3, 407)],
      // literal 4U ×17, simple_head 4U ×6, get 4U ×9
      [17, side("[num{}]", 4, 65), side("[str{}]", 4, 70)],
      [6, side("[set{}to]", 4, 50)],
      [9, side("[get{}]", 4, 55)],
      // snapscript-p5's get 2U ×2, 3U ×3, 4U ×1
      [1, side("[get(p5.width)]", 2, 419)],
      [1, side("[get(p5.height)]", 2, 420)],
      [2, side("[get(p5.frameCount)]", 3, 417)],
      [1, side("[get(p5.windowWidth)]", 3, 421)],
      [1, side("[get(p5.windowHeight)]", 4, 422)],
      // color 4U ×6
      [1, side("[color(mediumblue)]", 4, 42), side("[color(deepskyblue)]", 4, 43)],
      [1, side("[color(gold)]", 4, 44), side("[color(yellow)]", 4, 45)],
      [1, side("[color(hotpink)]", 4, 46), side("[color(tomato)]", 4, 47)],
      [1, side("[color(aquamarine)]", 4, 48), side("[color(limegreen)]", 4, 49)],
      [1, side("[color(black)]", 4, 106), side("[color(red)]", 4, 107)],
      [1, side("[color(white)]", 4, 108), side("[color(orange)]", 4, 109)],
      // operator 2U ×7
      [5, side("[*]", 2, 2), side("[/]", 2, 3)],
      [2, side("[+]", 2, 0), side("[-]", 2, 1)],
      // block_head 4U ×2, block_head 2U ×3, dedent 2U ×3
      [2, side("[for{}in]", 4, 75)],
      [3, side("[repeat]", 2, 19)],
      [3, side("[dedent]", 2, 20)],
    ]);
    expect(kit.reduce((total, { sheets }) => total + sheets, 0)).toBe(81);
  });
});
