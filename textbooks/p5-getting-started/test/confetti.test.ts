// confetti.md (#191): every page's program checks clean against the real
// snapscript-p5, the happy path uses only the kit's cards, and the last page
// is Session B's ending (#153).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";

const textbook = fileURLToPath(new URL("../", import.meta.url));
const volume = readFileSync(`${textbook}confetti.md`, "utf8");

interface Page {
  number: number;
  heading: string;
  /** Each ```snap block's text, in order. */
  programs: string[];
  /** The page's text outside code blocks. */
  prose: string;
}

/**
 * The volume split into pages, the minimal way: a `#` heading outside a code
 * block starts a page. The project loader (#190) owns the real split; switch
 * to it once it has landed.
 */
function pages(markdown: string): Page[] {
  const found: Page[] = [];
  let fence: { snap: boolean; lines: string[] } | null = null;
  for (const line of markdown.split("\n")) {
    const page = found.at(-1);
    if (fence !== null) {
      if (line.startsWith("```")) {
        if (fence.snap) page?.programs.push(`${fence.lines.join("\n")}\n`);
        fence = null;
      } else fence.lines.push(line);
    } else if (line.startsWith("```")) {
      fence = { snap: line.trim() === "```snap", lines: [] };
    } else if (/^# /.test(line)) {
      found.push({ number: found.length + 1, heading: line.slice(2).trim(), programs: [], prose: "" });
    } else if (page !== undefined) page.prose += `${line}\n`;
  }
  return found;
}

const all = pages(volume);
const withPrograms = all.filter((p) => p.programs.length > 0);

/**
 * Program 1's kit, from #158's table (the Stage 1 bases), in card notation
 * with handwriting as `…`. Swap to `projects/confetti/kit.yaml` once #192 has
 * landed it.
 */
const kit = new Set([
  "[call(p5.fill)]",
  "[call(p5.rect)]",
  "[call(random)]",
  "[call(p5.circle)]",
  "[call(p5.background)]",
  "[call(p5.noStroke)]",
  "[call(p5.createCanvas)]",
  "[define(setup)]",
  "[num{…}]",
  "[set{…}to]",
  "[get{…}]",
  ...["mediumblue", "deepskyblue", "gold", "yellow", "hotpink", "tomato", "aquamarine", "limegreen"].map((c) => `[color(${c})]`),
  "[repeat]",
  "[dedent]",
]);

/** The cards a program lays on the table, handwriting as `…`. Imports are never on the table. */
const tableCards = (program: string): string[] =>
  program
    .split("\n")
    .filter((line) => !/^\s*(\/\*\*|\*)/.test(line))
    .flatMap((line) => line.match(/\[[^\]]*\]/g) ?? [])
    .filter((card) => !card.startsWith("[import("))
    .map((card) => card.replace(/\{[^}]*\}/g, "{…}"));

describe("confetti.md", () => {
  test("is the textbook's one volume", () => {
    const manifest = JSON.parse(readFileSync(`${textbook}package.json`, "utf8"));
    expect(manifest.name).toBe("snapscript-p5-getting-started");
    expect(manifest.volumes).toEqual(["confetti.md"]);
  });

  test("starts with Before We Get Started, a page with no program", () => {
    expect(all[0]).toMatchObject({ heading: "Before We Get Started", programs: [] });
  });

  test("every other page has a program, one per program state", () => {
    expect(all.slice(1).every((p) => p.programs.length > 0)).toBe(true);
    const programs = withPrograms.map((p) => p.programs[0]);
    expect(new Set(programs).size).toBe(programs.length);
  });

  test.each(all.map((p) => [p.number, p.heading, p] as const))("page %i (%s) has at most one snap block", (_, __, page) => {
    expect(page.programs.length).toBeLessThanOrEqual(1);
  });

  test.each(withPrograms.map((p) => [p.number, p.heading, p.programs[0]!] as const))(
    "page %i (%s) checks clean against snapscript-p5",
    (_, __, program) => {
      // The page's program stands alone: its own hidden import finds snapscript-p5 beside the volume.
      const { errors, program: checked } = check(program, [], { loader: diskLoader(textbook), id: `${textbook}confetti.md` });
      expect(errors.map(({ kind, line, message }) => ({ kind, line, message }))).toEqual([]);
      expect(checked.skippedLines).toEqual([]);
      expect(program).toMatch(/^\/\*\* @table hidden \*\/\n\[import\(snapscript-p5\)as\(p5\)\]\n/);
    },
  );

  test.each(withPrograms.map((p) => [p.number, p.heading, p.programs[0]!] as const))(
    "page %i (%s) lays only the kit's cards",
    (_, __, program) => {
      expect(tableCards(program).filter((card) => !kit.has(card))).toEqual([]);
    },
  );

  test("the last page is Session B's ending: program 1's shape, 30 confetti each in gold and pink", () => {
    const confetti = (color: string) => [
      `[call(p5.fill)][color(${color})]`,
      "[repeat][num{30}]",
      "  [set{xPos}to][call(random)][num{500}]",
      "  [set{yPos}to][call(random)][num{500}]",
      "  [call(p5.rect)][get{xPos}][get{yPos}][num{10}][num{16}]",
      "[dedent]",
    ];
    expect(withPrograms.at(-1)?.programs[0]).toBe(
      [
        "/** @table hidden */",
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.createCanvas)][num{500}][num{500}]",
        "[call(p5.background)][color(mediumblue)]",
        "[call(p5.noStroke)]",
        ...confetti("gold"),
        ...confetti("hotpink"),
        "",
      ].join("\n"),
    );
  });

  test("its notation is current", () => {
    for (const old of ["midnightblue", "[define:", "[call:", "(xPos)", "[num(", "[repeat(", "↑", "Ask for a run", "flipped over", "facilitator"]) {
      expect(volume).not.toContain(old);
    }
  });

  test("tells how to get a new random result, and once why a swapped card lights red", () => {
    expect(volume).toContain("rewrite a number, or lift a card and lay it again");
    expect(volume.split("The new card lights red because it isn't the one the page shows. It still runs.")).toHaveLength(2);
  });

  test("shows the canvas coordinate diagram on the page that first draws on the canvas, from beside the volume", () => {
    const images = all.map((p) => [...p.prose.matchAll(/!\[[^\]]*\]\(([^)]+)\)/g)].map((m) => m[1]));
    expect(images.flat()).toEqual(["canvas-coordinates.png"]);
    const firstDrawingPage = all.findIndex((p) => p.prose.includes("[call(p5.rect)]"));
    expect(images[firstDrawingPage]).toEqual(["canvas-coordinates.png"]);
    expect(existsSync(`${textbook}canvas-coordinates.png`)).toBe(true);
  });

  test.each(all.map((p) => [p.number, p.heading, p] as const))("page %i (%s) has every part a page has", (_, __, page) => {
    if (page.programs.length === 0) return;
    expect(page.prose).toContain("> ✴️ See the virtual cards on the table");
    expect(page.prose).toContain("**You should see:**");
  });
});
