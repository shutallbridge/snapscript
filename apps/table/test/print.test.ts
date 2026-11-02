// `pnpm print` (#200): what it prints for a project, before Electron makes PDFs of it.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { loadProject } from "../src/project.ts";
import { printDocuments, PrintError } from "../src/print/documents.ts";
import { fixtureProject } from "./helpers.ts";

const confetti = loadProject(fileURLToPath(new URL("../../../projects/confetti/", import.meta.url)));

/** Each face a document draws: its card and the marker ID it carries (null for none), in order. */
const faces = (html: string): { card: string; marker: number | null }[] =>
  [...html.matchAll(/<svg [^>]*data-card="([^"]*)"[^>]*>(.*?)<\/svg>/g)].map(([, card, body]) => {
    const marker = /data-part="marker" data-id="(\d+)"/.exec(body!);
    return { card: card!.replace(/&quot;/g, '"'), marker: marker ? Number(marker[1]) : null };
  });

/** Each printed page of a document, as HTML. */
const pages = (html: string): string[] => html.split(/<section class="page/).slice(1);

describe("sheets.pdf", () => {
  const { sheets } = printDocuments(confetti);

  test("holds every side of the kit's 57 sheets, each with its marker", () => {
    const all = faces(sheets.html);
    // 57 sheets, and a back for the 17 literal and 4 colour flip pairs.
    expect(all).toHaveLength(57 + 17 + 4);
    expect(all.every((f) => f.marker !== null)).toBe(true);
    const count = (card: string, marker: number) => all.filter((f) => f.card === card && f.marker === marker).length;
    expect(count("[call(p5.fill)]", 403)).toBe(3);
    expect(count("[call(random)]", 40)).toBe(6);
    expect(count("[define(setup)]", 406)).toBe(1);
    expect(count("[num{}]", 65)).toBe(17);
    expect(count("[color(hotpink)]", 46)).toBe(1);
    expect(count("[color(tomato)]", 47)).toBe(1);
  });

  test("puts a flip pair's back right after its front", () => {
    const all = faces(sheets.html).map((f) => f.card);
    const front = all.indexOf("[color(gold)]");
    expect(all[front + 1]).toBe("[color(yellow)]");
  });

  test("is A4 pages, each with a 50 mm check bar", () => {
    const printed = pages(sheets.html);
    expect(printed.length).toBe(sheets.pages);
    expect(printed.length).toBeGreaterThan(1);
    expect(printed.every((p) => p.includes('data-part="check-bar"'))).toBe(true);
  });
});

describe("pages.pdf", () => {
  const { pages: document } = printDocuments(confetti);
  const printed = pages(document.html);

  test("is one A4 page per textbook page, each with its marker", () => {
    expect(document.pages).toBe(9);
    expect(printed).toHaveLength(9);
    printed.forEach((page, i) => {
      expect(page).toContain(`data-part="marker" data-id="${408 + i}"`);
      expect(page).toContain(`PAGE ${i + 1}<`);
    });
  });

  test("draws the page's mini cards and images, but not its program", () => {
    const page3 = printed[2]!;
    expect(page3).toContain("Put something on it");
    expect(faces(page3).map((f) => f.card)).toContain("[call(p5.rect)]");
    expect(faces(page3).every((f) => f.marker === null)).toBe(true);
    expect(page3).toMatch(/<img src="file:\/\/[^"]*canvas-coordinates\.png"/);
    expect(page3).not.toContain("[import(");
  });
});

describe("ruler.pdf", () => {
  const { ruler } = printDocuments(confetti);

  test("is one landscape page with the ruler's two markers and a check bar", () => {
    expect(ruler.pages).toBe(1);
    expect(ruler.html).toContain("size: A4 landscape");
    expect(ruler.html).toContain('data-part="marker" data-id="312"');
    expect(ruler.html).toContain('data-part="marker" data-id="313"');
    expect(ruler.html).toContain('data-part="check-bar"');
  });

  test("puts 312 left and 313 right on the middle line, as calibration expects (#199): centres at x 20 and 277, y 105 mm", () => {
    /** A marker's centre on the page, from the black cells drawn for it. */
    const centre = (id: number): [number, number] => {
      const group = new RegExp(`data-part="marker" data-id="${id}"[^>]*>(.*?)</g>`).exec(ruler.html)![1]!;
      const cells = [...group.matchAll(/x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)].map((m) => m.slice(1).map(Number));
      const xs = cells.flatMap(([x, , w]) => [x!, x! + w! - 0.02]);
      const ys = cells.flatMap(([, y, , h]) => [y!, y! + h! - 0.02]);
      return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
    };
    const [left, right] = [centre(312), centre(313)];
    expect(left[0]).toBeCloseTo(20, 2);
    expect(left[1]).toBeCloseTo(105, 2);
    expect(right[0]).toBeCloseTo(277, 2);
    expect(right[1]).toBeCloseTo(105, 2);
  });
});

describe("what stops pnpm print", () => {
  test("a kit card with no marker, named", () => {
    const dir = fixtureProject({ dependencies: ["fixture-shapes"] });
    writeFileSync(join(dir, "kit.yaml"), '"[call(shapes.square)]": 1\n"[call(shapes.starburst)]": 1\n');
    expect(() => printDocuments(loadProject(dir))).toThrow(new PrintError("kit card [call(shapes.starburst)] has no marker in the language markers or the lockfile (run pnpm lock?)"));
  });

  test("a page whose program has a check error", () => {
    const dir = fixtureProject({ dependencies: ["fixture-shapes", "fixture-bad-page"], lock: "400 = call fixture-shapes.square 2\n401 = page fixture-bad-page/bad 1\n" });
    writeFileSync(join(dir, "kit.yaml"), '"[call(shapes.square)]": 1\n');
    expect(() => printDocuments(loadProject(dir))).toThrow(/^fixture-bad-page\/bad page 1 \(Too few values\)'s program has an error: line 5: /);
  });
});
