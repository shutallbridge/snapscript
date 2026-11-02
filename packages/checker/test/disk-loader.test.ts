// The default loader: a thin adapter from the module loader to disk and
// installed packages, through check. The checker itself never touches disk.
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeAll, describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { lines } from "./helpers.ts";

let project: string;

function write(path: string, text: string): void {
  mkdirSync(dirname(join(project, path)), { recursive: true });
  writeFileSync(join(project, path), text);
}

beforeAll(() => {
  project = mkdtempSync(join(tmpdir(), "snapscript-checker-"));
  write("node_modules/snapscript-p5/package.json", JSON.stringify({ name: "snapscript-p5", snapscript: "src/p5.snap" }));
  write("node_modules/snapscript-p5/src/p5.snap", lines("[import(./shapes.snap)as(shapes)]", "[extern(circle)][required(x)][required(y)][required(d)]"));
  write("node_modules/snapscript-p5/src/shapes.snap", lines("[define(star)][required(x)][required(y)]"));
  write("node_modules/no-entry/package.json", JSON.stringify({ name: "no-entry" }));
  write("lib/helpers.snap", lines("[define(twice)][required(n)]"));
});

const errorsOf = (text: string, id = join(project, "main.snap")) =>
  check(text, [], { loader: diskLoader(project), id }).errors.map(({ kind, line, message }) => ({ kind, line, message }));

describe("the disk loader", () => {
  test("loads a package through its package.json's snapscript entry, and its relative imports", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "[define{draw}]",
      "[call(p5.circle)][num{20}]",
      "[call(p5.shapes.star)][num{1}]",
    );
    expect(errorsOf(text)).toEqual([
      { kind: "TypeError", line: 3, message: "circle takes 3 values" },
      { kind: "TypeError", line: 4, message: "star takes 2 values" },
    ]);
  });

  test("loads a path from the importing file's folder", () => {
    const text = lines("[import(./lib/helpers.snap)as(h)]", "[define{draw}]", "[call(h.twice)]");
    expect(errorsOf(text)).toEqual([{ kind: "TypeError", line: 3, message: "twice takes 1 value" }]);
  });

  test("a missing file, a package that isn't installed and one with no snapscript entry are ImportErrors", () => {
    const text = lines("[import(./nothing.snap)as(a)]", "[import(snapscript-sound)as(b)]", "[import(no-entry)as(c)]");
    expect(errorsOf(text).map((e) => [e.kind, e.line])).toEqual([
      ["ImportError", 1],
      ["ImportError", 2],
      ["ImportError", 3],
    ]);
  });

  test("a file importing itself is an ImportError", () => {
    write("self.snap", lines("[import(./self.snap)as(me)]"));
    expect(errorsOf(lines("[import(./self.snap)as(me)]"), join(project, "self.snap"))).toEqual([
      { kind: "ImportError", line: 1, message: "this module imports itself" },
    ]);
  });
});
