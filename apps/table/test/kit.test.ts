import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { loadKit } from "../src/kit.ts";
import { loadProject, ProjectError } from "../src/project.ts";
import { fixtureProject } from "./helpers.ts";

/** The fixture project with this `kit.yaml`, loaded. */
function withKit(kit: string) {
  const dir = fixtureProject();
  writeFileSync(join(dir, "kit.yaml"), kit);
  return loadProject(dir);
}

describe("the kit", () => {
  test("names library cards as the entry module imports them, and gives a side with no marker null", () => {
    const kit = loadKit(withKit(['"[call(shapes.square)]": 2', '"[call(shapes.starburst)]": 1', '"[get(shapes.width)]": 1', '"[get{}]": 3'].join("\n")));
    expect(kit).toEqual([
      { sides: [{ card: "[call(shapes.square)]", length: 2, marker: 400 }], sheets: 2 },
      // Offered, but not in the lockfile yet.
      { sides: [{ card: "[call(shapes.starburst)]", length: 3, marker: null }], sheets: 1 },
      // Not offered at all.
      { sides: [{ card: "[get(shapes.width)]", length: 2, marker: null }], sheets: 1 },
      { sides: [{ card: "[get{}]", length: 4, marker: 55 }], sheets: 3 },
    ]);
  });

  test("reads another kit file in place of kit.yaml, naming it in its errors", () => {
    const project = withKit('"[get{}]": 3');
    const other = join(project.dir, "more.yaml");
    writeFileSync(other, '"[call(shapes.square)]": 1');
    expect(loadKit(project, other)).toEqual([{ sides: [{ card: "[call(shapes.square)]", length: 2, marker: 400 }], sheets: 1 }]);
    writeFileSync(other, '"square": 1');
    expect(() => loadKit(project, other)).toThrow(new ProjectError("more.yaml: square isn't a card"));
  });

  test("a flip pair splits between its cards, not on a card's own slash", () => {
    expect(loadKit(withKit('"[*] / [/]": 1\n"[/]": 1')).map(({ sides }) => sides.map(({ card }) => card))).toEqual([["[*]", "[/]"], ["[/]"]]);
  });

  test("a library card's module and name ignore case (ADR 0008), and keep the kit's spelling", () => {
    expect(loadKit(withKit('"[call(Shapes.SQUARE)]": 1'))).toEqual([{ sides: [{ card: "[call(Shapes.SQUARE)]", length: 2, marker: 400 }], sheets: 1 }]);
  });

  test("a flip pair is its two sides, front first", () => {
    expect(loadKit(withKit('"[bool(true)] / [bool(false)]": 2'))).toEqual([
      { sides: [{ card: "[bool(true)]", length: 2, marker: 24 }, { card: "[bool(false)]", length: 2, marker: 25 }], sheets: 2 },
    ]);
  });

  test.each([
    ['"[call(shapes.square)]": 0', "kit.yaml: [call(shapes.square)] needs a whole number of sheets, not 0"],
    ['"[call(shapes.square)]": two', "kit.yaml: [call(shapes.square)] needs a whole number of sheets, not two"],
    ['"square": 1', "kit.yaml: square isn't a card"],
    ['"[+] / [-] / [*]": 1', "kit.yaml: [+] / [-] / [*] has more than two sides"],
  ])("%s is an error", (kit, message) => {
    expect(() => loadKit(withKit(kit))).toThrow(new ProjectError(message));
  });
});
