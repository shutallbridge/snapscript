// snapscript-p5 through the runtime's run-a-program seam (#188): its real
// p5.snap and p5.js, against a recording stand-in for the p5 instance.
import { mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";
import { check, type CheckError } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { compile } from "@snapscript/runtime/compiler";
import { run, type NativeModule, type RunError } from "@snapscript/runtime";
import { loadProject, type LibraryCard } from "@snapscript/table/project";
// The source p5.js is built from: tests never need a build first.
import * as p5Native from "../src/p5.ts";
import type { P5Constructor } from "../src/p5.ts";

const library = fileURLToPath(new URL("../", import.meta.url));
const p5Snap = fileURLToPath(new URL("../p5.snap", import.meta.url));

const lines = (...text: string[]): string => `${text.join("\n")}\n`;

/** A stand-in for p5's instance mode: records every call, and draws frames when the test says. */
class RecordingP5 {
  static made: RecordingP5[] = [];
  readonly calls: unknown[][] = [];
  setup?: () => void;
  draw?: () => void;
  frameCount = 0;

  constructor(sketch: (p: RecordingP5) => void, readonly container: unknown) {
    RecordingP5.made.push(this);
    // Any other p5 function is recorded with its values.
    const recording = new Proxy(this, {
      get: (target, key, receiver) =>
        key in target || typeof key === "symbol"
          ? Reflect.get(target, key, receiver)
          : (...args: unknown[]) => void target.calls.push([key, ...args]),
    });
    sketch(recording);
    return recording;
  }

  /** p5's noise, made up: recorded like any other call, and a number from 0 to 1 for the program to use. */
  noise(x: number, y: number): number {
    this.calls.push(["noise", x, y]);
    return Math.abs(Math.sin(x * 12.9898 + y * 78.233));
  }

  /** What p5 does once it has loaded: setup, then a draw per frame, counting each one. */
  play(frames: number): void {
    this.setup?.();
    for (let i = 0; i < frames; i += 1) {
      this.frameCount += 1;
      this.draw?.();
    }
  }
}

const container = { id: "sketch" };

interface Seen {
  checkErrors: Pick<CheckError, "kind" | "line" | "message">[];
  errors: Omit<RunError, "span">[];
  frames: number;
  p5: RecordingP5 | undefined;
  /** Stops the run from outside, as the table does before replacing it. */
  stop: () => void;
}

/** Checks, compiles and runs program text that imports snapscript-p5, then plays `frames` frames. */
function runSketch(text: string, frames = 0): Seen {
  const disk = diskLoader(library);
  const loader = {
    load: (source: string, from: string | null) =>
      source === "snapscript-p5" ? { id: p5Snap, text: readFileSync(p5Snap, "utf8") } : disk.load(source, from),
  };
  const result = check(text, [], { loader, id: `${library}main.snap` });
  const seen: Seen = { checkErrors: result.errors.map(({ kind, line, message }) => ({ kind, line, message })), errors: [], frames: 0, p5: undefined, stop: () => {} };
  RecordingP5.made = [];
  p5Native.mount(RecordingP5 as unknown as P5Constructor, container);
  const handle = run(compile(result.program), {
    natives: (id) => (id === p5Snap ? (p5Native as NativeModule) : null),
    output: {
      print: () => {},
      error: ({ span: _span, ...error }) => seen.errors.push(error),
      frame: () => {
        seen.frames += 1;
      },
    },
  });
  seen.stop = () => handle.stop();
  seen.p5 = RecordingP5.made[0];
  seen.p5?.play(frames);
  return seen;
}

beforeEach(() => {
  RecordingP5.made = [];
});

describe("run", () => {
  test("makes one p5 instance in the sketch's container", () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]"));
    expect(seen.checkErrors).toEqual([]);
    expect(RecordingP5.made).toHaveLength(1);
    expect(seen.p5?.container).toBe(container);
  });

  test("calls setup once and draw once per frame, and reports each frame", () => {
    const seen = runSketch(
      lines(
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.createCanvas)][num{500}][num{500}]",
        "",
        "[define(draw)]",
        "[call(p5.circle)][num{1}][num{2}][num{3}]",
      ),
      3,
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect(seen.p5?.calls).toEqual([
      ["createCanvas", 500, 500],
      ["circle", 1, 2, 3],
      ["circle", 1, 2, 3],
      ["circle", 1, 2, 3],
    ]);
    expect(seen.frames).toBe(3);
  });

  test("a program with no setup or draw still runs its frames", () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]"), 2);
    expect(seen.errors).toEqual([]);
    expect(seen.p5?.calls).toEqual([]);
    expect(seen.frames).toBe(2);
  });
});

describe("drawing", () => {
  test("a colour reaches p5 as its CSS name", () => {
    const seen = runSketch(
      lines(
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.background)][color(mediumblue)]",
        "[call(p5.fill)][color(hotpink)]",
        "[call(p5.noStroke)]",
        "[call(p5.rect)][num{1}][num{2}][num{3}][num{4}]",
      ),
      1,
    );
    expect(seen.errors).toEqual([]);
    expect(seen.p5?.calls).toEqual([["background", "mediumblue"], ["fill", "hotpink"], ["noStroke"], ["rect", 1, 2, 3, 4]]);
  });

  test("demo program 1 runs: three separate loops of confetti (#109)", () => {
    const confetti = (color: string) => [
      `[call(p5.fill)][color(${color})]`,
      "[repeat][num{200}]",
      "  [set{x}to][call(random)][num{500}]",
      "  [set{y}to][call(random)][num{500}]",
      "  [call(p5.rect)][get{x}][get{y}][num{10}][num{16}]",
      "[dedent]",
    ];
    const seen = runSketch(
      lines(
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.createCanvas)][num{500}][num{500}]",
        "[call(p5.background)][color(mediumblue)]",
        "[call(p5.noStroke)]",
        ...confetti("gold"),
        ...confetti("hotpink"),
        ...confetti("aquamarine"),
      ),
      1,
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    const calls = seen.p5!.calls;
    expect(calls.slice(0, 3)).toEqual([["createCanvas", 500, 500], ["background", "mediumblue"], ["noStroke"]]);
    const rects = calls.filter((c) => c[0] === "rect");
    expect(rects).toHaveLength(600);
    for (const [, x, y, w, h] of rects) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(500);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThan(500);
      expect([w, h]).toEqual([10, 16]);
    }
    expect(calls.filter((c) => c[0] === "createCanvas")).toHaveLength(1);
    expect(calls.filter((c) => c[0] === "fill").map((c) => c[1])).toEqual(["gold", "hotpink", "aquamarine"]);
    expect(calls.findIndex((c) => c[0] === "fill" && c[1] === "hotpink")).toBe(3 + 1 + 200);
  });
});

describe("noise and frameCount", () => {
  test("noise gives p5's noise for x and y", () => {
    const seen = runSketch(
      lines("[import(snapscript-p5)as(p5)]", "", "[define(setup)]", "[set{n}to][call(p5.noise)][num{0.5}][num{2}]", "[call(p5.circle)][get{n}][num{0}][num{1}]"),
      0,
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    const n = Math.abs(Math.sin(0.5 * 12.9898 + 2 * 78.233));
    expect(seen.p5?.calls).toEqual([["noise", 0.5, 2], ["circle", n, 0, 1]]);
  });

  test("frameCount is 0 in setup, then p5's count in each draw", () => {
    const seen = runSketch(
      lines(
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.circle)][get(p5.frameCount)][num{0}][num{1}]",
        "",
        "[define(draw)]",
        "[call(p5.circle)][get(p5.frameCount)][num{0}][num{1}]",
      ),
      3,
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    expect(seen.p5?.calls.map((c) => c[1])).toEqual([0, 1, 2, 3]);
  });

  test("demo program 3's fixed version runs: the noise animation (#109)", () => {
    const seen = runSketch(
      lines(
        "[import(snapscript-p5)as(p5)]",
        "",
        "[define(setup)]",
        "[call(p5.createCanvas)][num{400}][num{400}]",
        "[call(p5.noStroke)]",
        "",
        "[define(draw)]",
        "[call(p5.background)][color(black)]",
        "[call(p5.fill)][color(white)]",
        "[set{tx}to][get(p5.frameCount)][*][num{0.012}]",
        "[set{ty}to][get(p5.frameCount)][*][num{0.016}]",
        "[for{x}in][call(range)][num{12}][num{400}][num{25}]",
        "  [for{y}in][call(range)][num{12}][num{400}][num{25}]",
        "    [set{nx}to][get{x}][*][num{0.015}][+][get{tx}]",
        "    [set{ny}to][get{y}][*][num{0.02}][+][get{ty}]",
        "    [set{n}to][call(p5.noise)][get{nx}][get{ny}]",
        "    [call(p5.circle)][get{x}][get{y}][get{n}][*][num{26}]",
        "  [dedent]",
        "[dedent]",
      ),
      1,
    );
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    const calls = seen.p5!.calls;
    expect(calls.slice(0, 4)).toEqual([["createCanvas", 400, 400], ["noStroke"], ["background", "black"], ["fill", "white"]]);
    const noises = calls.filter((c) => c[0] === "noise");
    const circles = calls.filter((c) => c[0] === "circle");
    // range(12, 400, 25): 12, 37, … 387, 16 in each direction.
    expect(circles).toHaveLength(256);
    expect(noises[0]).toEqual(["noise", 12 * 0.015 + 0.012, 12 * 0.02 + 0.016]);
    expect(circles[0]).toEqual(["circle", 12, 12, Math.abs(Math.sin((12 * 0.015 + 0.012) * 12.9898 + (12 * 0.02 + 0.016) * 78.233)) * 26]);
    expect(circles.at(-1)!.slice(1, 3)).toEqual([387, 387]);
    expect(seen.frames).toBe(1);
  });
});

describe("stopping", () => {
  const drawing = lines("[import(snapscript-p5)as(p5)]", "", "[define(draw)]", "[call(p5.circle)][num{1}][num{2}][num{3}]");

  test("a run stopped from outside stops p5's loop, so draw isn't called again", () => {
    const seen = runSketch(drawing, 1);
    seen.stop();
    expect(seen.p5?.calls).toEqual([["circle", 1, 2, 3], ["noLoop"]]);
  });

  test("a run that stops on an error stops p5's loop", () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]", "", "[define(draw)]", "[call(print)][num{1}][/][num{0}]"), 2);
    expect(seen.errors.map((e) => e.kind)).toEqual(["ZeroDivisionError"]);
    expect(seen.p5?.calls).toEqual([["noLoop"]]);
  });

  test("stopping before p5 has made its instance does nothing", () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]"));
    RecordingP5.made = [];
    expect(() => seen.stop()).not.toThrow();
  });
});

describe("the library's declarations", () => {
  test('[call(p5.circle)][num{20}] is "circle takes 3 values"', () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]", "", "[define(draw)]", "[call(p5.circle)][num{20}]"));
    expect(seen.checkErrors).toEqual([{ kind: "TypeError", line: 4, message: "circle takes 3 values" }]);
  });
});

describe("p5.snap's cards (#156)", () => {
  // As the table reads them: the project loader's cards, for a project that imports this library.
  const project = mkdtempSync(join(tmpdir(), "p5-cards-"));
  writeFileSync(join(project, "package.json"), JSON.stringify({ name: "cards", snapscript: "main.snap", dependencies: { "snapscript-p5": "workspace:*" } }));
  writeFileSync(join(project, "main.snap"), "/** @table hidden */\n[import(snapscript-p5)as(p5)]\n");
  writeFileSync(join(project, "snapscript.lock"), "");
  mkdirSync(join(project, "node_modules"));
  symlinkSync(library, join(project, "node_modules", "snapscript-p5"), "dir");
  const cards = loadProject(project).cards.filter((c) => c.package === "snapscript-p5");
  const label = (c: LibraryCard): string => c.text.replace("snapscript-p5.", "p5.");
  /** Each `[extern(…)]`'s required values, by its name. */
  const required = new Map(
    check(readFileSync(p5Snap, "utf8"), []).program.declarations.flatMap((d) =>
      d.type === "extern" && d.name ? [[d.name.text, d.params.filter((p) => p.type === "required").map((p) => p.name?.text)] as const] : [],
    ),
  );

  test("are the ones #156 lists, each call card with its function colour", () => {
    expect(Object.fromEntries(cards.map((c) => [label(c), c.functionColor]))).toEqual({
      "[call(p5.createCanvas)]": "setting",
      "[call(p5.background)]": "primary",
      "[call(p5.noStroke)]": "setting",
      "[call(p5.fill)]": "setting",
      "[call(p5.rect)]": "primary",
      "[call(p5.circle)]": "primary",
      "[call(p5.noise)]": "helper",
      // Get cards are orange: they have no function colour.
      "[get(p5.frameCount)]": null,
      // Printed define cards are teal: they have no function colour.
      "[define(setup)]": null,
      "[define(draw)]": null,
    });
  });

  test.each(cards.map((c) => [label(c), c] as const))("%s's help is one sentence, then a line per value with no type", (_, card) => {
    const { sentence, values } = card.help;
    expect(sentence).toMatch(/^[A-Z].*\.$/);
    expect(sentence.length).toBeLessThanOrEqual(80);
    if (card.card === "call") expect(values.map((v) => v.name)).toEqual(required.get(card.name));
    for (const { about } of values) {
      expect(about.length).toBeGreaterThan(0);
      expect(about.length).toBeLessThanOrEqual(40);
      expect(about).not.toMatch(/^\{/);
    }
  });

  test("setup and draw say when they run", () => {
    const sentence = (name: string) => cards.find((c) => label(c) === `[define(${name})]`)?.help.sentence;
    expect(sentence("setup")).toBe("Runs once when the program starts.");
    expect(sentence("draw")).toBe("Runs again and again, every frame, after setup.");
  });
});
