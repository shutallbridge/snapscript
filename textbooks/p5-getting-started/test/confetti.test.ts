// confetti.md (#191): every page's program checks clean against the real
// snapscript-p5, the happy path uses only the kit's cards, and the last page
// is Session B's ending (#153).
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { loadKit } from "@snapscript/table/kit";
import { loadProject, type Page as LoadedPage } from "@snapscript/table/project";

const textbook = fileURLToPath(new URL("../", import.meta.url));
const volume = readFileSync(`${textbook}confetti.md`, "utf8");

/** The one PoC project, which depends on this textbook. */
const project = loadProject(fileURLToPath(new URL("../../../projects/confetti/", import.meta.url)));

interface Page {
  number: number;
  heading: string;
  /** Its ```snap block's text, if it has one. */
  program: string | null;
  /** The page's markdown below its heading, without its program. */
  prose: string;
  /** Its images' files. */
  images: string[];
}

type Node = LoadedPage["content"]["children"][number];
const nodes = (node: Node): Node[] => [node, ...("children" in node ? (node.children as Node[]).flatMap(nodes) : [])];

/** The volume's pages as the project loader splits it (#190). Loading it already refuses a page with two snap blocks. */
const all: Page[] = project.pages
  .filter((p) => p.textbook === "snapscript-p5-getting-started" && p.volume === "confetti")
  .map(({ page, heading, program, content }) => ({
    number: page,
    heading,
    program,
    prose: content.children.map((n) => volume.slice(n.position!.start.offset, n.position!.end.offset)).join("\n\n"),
    images: content.children.flatMap(nodes).flatMap((n) => (n.type === "image" ? [n.url] : [])),
  }));
const withPrograms = all.filter((p): p is Page & { program: string } => p.program !== null);

/** Every side of every card in the project's kit (#192), handwriting as `{}`. */
const kit = new Set(loadKit(project).flatMap(({ sides }) => sides.map(({ card }) => card)));

/** The cards a program lays on the table, handwriting as `{}`. Imports are never on the table. */
const tableCards = (program: string): string[] =>
  program
    .split("\n")
    .filter((line) => !/^\s*(\/\*\*|\*)/.test(line))
    .flatMap((line) => line.match(/\[[^\]]*\]/g) ?? [])
    .filter((card) => !card.startsWith("[import("))
    .map((card) => card.replace(/\{[^}]*\}/g, "{}"));

describe("confetti.md", () => {
  test("is the textbook's one volume", () => {
    const manifest = JSON.parse(readFileSync(`${textbook}package.json`, "utf8"));
    expect(manifest.name).toBe("snapscript-p5-getting-started");
    expect(manifest.volumes).toEqual(["confetti.md"]);
  });

  test("starts with Before We Get Started, a page with no program", () => {
    expect(all[0]).toMatchObject({ number: 1, heading: "Before We Get Started", program: null });
  });

  test("every other page has a program, one per program state", () => {
    expect(all.slice(1).every((p) => p.program !== null)).toBe(true);
    const programs = withPrograms.map((p) => p.program);
    expect(new Set(programs).size).toBe(programs.length);
  });

  test.each(withPrograms.map((p) => [p.number, p.heading, p.program] as const))(
    "page %i (%s) checks clean against snapscript-p5",
    (_, __, program) => {
      // The page's program stands alone: its own hidden import finds snapscript-p5 beside the volume.
      const { errors, program: checked } = check(program, [], { loader: diskLoader(textbook), id: `${textbook}confetti.md` });
      expect(errors.map(({ kind, line, message }) => ({ kind, line, message }))).toEqual([]);
      expect(checked.skippedLines).toEqual([]);
      expect(program).toMatch(/^\/\*\* @table hidden \*\/\n\[import\(snapscript-p5\)as\(p5\)\]\n/);
    },
  );

  test.each(withPrograms.map((p) => [p.number, p.heading, p.program] as const))(
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
    expect(withPrograms.at(-1)?.program).toBe(
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
    const image = `${textbook}canvas-coordinates.png`;
    expect(all.flatMap((p) => p.images)).toEqual([image]);
    const firstDrawingPage = all.find((p) => p.prose.includes("[call(p5.rect)]"));
    expect(firstDrawingPage?.images).toEqual([image]);
    expect(existsSync(image)).toBe(true);
  });

  test.each(all.map((p) => [p.number, p.heading, p] as const))("page %i (%s) has every part a page has", (_, __, page) => {
    if (page.program === null) return;
    expect(page.prose).toContain("> ✴️ See the virtual cards on the table");
    expect(page.prose).toContain("**You should see:**");
  });
});
