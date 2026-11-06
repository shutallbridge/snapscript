// `pnpm print` (#200) itself: Electron makes the three PDFs, or stops with an error and writes none.
// It builds the print script first, and needs a display, as Electron does.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, test } from "vitest";
import { fixtureProject } from "./helpers.ts";

const app = fileURLToPath(new URL("../", import.meta.url));
const confetti = fileURLToPath(new URL("../../../projects/confetti/", import.meta.url));

/** Runs `pnpm print <project> <out> [<kit file>]` past its build. */
function print(project: string, kit?: string): { status: number | null; output: string; out: string } {
  const out = join(mkdtempSync(join(tmpdir(), "snapscript-print-")), "print");
  const run = spawnSync(process.execPath, ["src/print/run.ts", project, out, ...(kit ? [kit] : [])], { cwd: app, encoding: "utf8", timeout: 60_000 });
  return { status: run.status, output: run.stdout + run.stderr, out };
}

/** A PDF's page count, from its page objects. */
const pdfPages = (file: string): number => readFileSync(file, "latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;

describe("pnpm print", () => {
  beforeAll(() => {
    execFileSync("pnpm", ["--filter", "@snapscript/table^...", "build"], { cwd: app, stdio: "ignore" });
    execFileSync("pnpm", ["exec", "electron-vite", "build"], { cwd: app, stdio: "ignore" });
  }, 120_000);

  test("writes sheets.pdf, pages.pdf and ruler.pdf for confetti, every page on one A4 sheet", () => {
    const { status, output, out } = print(confetti);
    expect(output).not.toMatch(/error/i);
    expect(status).toBe(0);
    // The kit's 111 faces on 16 sheets of A4; one page per confetti.md page; the ruler page.
    expect(pdfPages(join(out, "sheets.pdf"))).toBe(16);
    expect(pdfPages(join(out, "pages.pdf"))).toBe(9);
    expect(pdfPages(join(out, "ruler.pdf"))).toBe(1);
  }, 60_000);

  test("prints another kit file's sheets in place of kit.yaml's", () => {
    const kit = join(mkdtempSync(join(tmpdir(), "snapscript-kit-")), "more.yaml");
    writeFileSync(kit, '"[repeat]": 1\n');
    const { status, out } = print(confetti, kit);
    expect(status).toBe(0);
    expect(pdfPages(join(out, "sheets.pdf"))).toBe(1);
  }, 60_000);

  test("stops on a kit card with no marker, naming it, and writes nothing", () => {
    const dir = fixtureProject({ dependencies: ["fixture-shapes"] });
    writeFileSync(join(dir, "kit.yaml"), '"[call(shapes.starburst)]": 1\n');
    const { status, output, out } = print(dir);
    expect(status).toBe(1);
    expect(output).toContain("kit card [call(shapes.starburst)] has no marker");
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  test("stops on a page that doesn't fit its A4 sheet, and writes nothing", () => {
    const dir = fixtureProject({ dependencies: ["fixture-long-page"], lock: "400 = page fixture-long-page/long 1\n401 = page fixture-long-page/long 2\n" });
    writeFileSync(join(dir, "kit.yaml"), '"[repeat]": 1\n');
    const { status, output, out } = print(dir);
    expect(status).toBe(1);
    expect(output).toContain("pages.pdf: fixture-long-page/long page 2 (Too long) doesn't fit its A4 sheet");
    expect(existsSync(out)).toBe(false);
  }, 60_000);
});
