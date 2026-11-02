// snapscript-p5 through the runtime's run-a-program seam (#188): its real
// p5.snap and p5.js, against a recording stand-in for the p5 instance.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, test } from "vitest";
import { check, type CheckError } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { compile } from "@snapscript/runtime/compiler";
import { run, type NativeModule, type RunError } from "@snapscript/runtime";
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

  /** What p5 does once it has loaded: setup, then a draw per frame. */
  play(frames: number): void {
    this.setup?.();
    for (let i = 0; i < frames; i += 1) this.draw?.();
  }
}

const container = { id: "sketch" };

interface Seen {
  checkErrors: Pick<CheckError, "kind" | "line" | "message">[];
  errors: Omit<RunError, "span">[];
  frames: number;
  p5: RecordingP5 | undefined;
}

/** Checks, compiles and runs program text that imports snapscript-p5, then plays `frames` frames. */
function runSketch(text: string, frames = 0): Seen {
  const disk = diskLoader(library);
  const loader = {
    load: (source: string, from: string | null) =>
      source === "snapscript-p5" ? { id: p5Snap, text: readFileSync(p5Snap, "utf8") } : disk.load(source, from),
  };
  const result = check(text, [], { loader, id: `${library}main.snap` });
  const seen: Seen = { checkErrors: result.errors.map(({ kind, line, message }) => ({ kind, line, message })), errors: [], frames: 0, p5: undefined };
  RecordingP5.made = [];
  p5Native.mount(RecordingP5 as unknown as P5Constructor, container);
  run(compile(result.program), {
    natives: (id) => (id === p5Snap ? (p5Native as NativeModule) : null),
    output: {
      print: () => {},
      error: ({ span: _span, ...error }) => seen.errors.push(error),
      frame: () => {
        seen.frames += 1;
      },
    },
  });
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

describe("the library's declarations", () => {
  test('[call(p5.circle)][num{20}] is "circle takes 3 values"', () => {
    const seen = runSketch(lines("[import(snapscript-p5)as(p5)]", "", "[define(draw)]", "[call(p5.circle)][num{20}]"));
    expect(seen.checkErrors).toEqual([{ kind: "TypeError", line: 4, message: "circle takes 3 values" }]);
  });
});

describe("p5.snap's cards (#156)", () => {
  /** Each `@card` doc comment, with the declaration after it (if any). */
  const cards = [...readFileSync(p5Snap, "utf8").matchAll(/\/\*\*([\s\S]*?)\*\/\n(\[[^\n]*)?/g)]
    .map(([, body, declaration]) => ({
      lines: body!.split("\n").map((l) => l.replace(/^\s*\*\s?/, "").trim()).filter(Boolean),
      declaration: declaration ?? null,
    }))
    .filter((c) => c.lines.some((l) => l.startsWith("@card")));
  const label = (c: (typeof cards)[number]): string =>
    c.lines.find((l) => l.startsWith("@card "))?.slice("@card ".length) ?? `[call(p5.${/\[extern\((\w+)\)/.exec(c.declaration!)![1]})]`;

  test("are the ones #156 lists, each call card with its function colour", () => {
    const colorOf = (c: (typeof cards)[number]) => c.lines.find((l) => l.startsWith("@color "))?.slice("@color ".length) ?? null;
    expect(Object.fromEntries(cards.map((c) => [label(c), colorOf(c)]))).toEqual({
      "[call(p5.createCanvas)]": "setting",
      "[call(p5.background)]": "primary",
      "[call(p5.noStroke)]": "setting",
      "[call(p5.fill)]": "setting",
      "[call(p5.rect)]": "primary",
      "[call(p5.circle)]": "primary",
      // Printed define cards are teal, and take no @color.
      "[define(setup)]": null,
      "[define(draw)]": null,
    });
  });

  test.each(cards.map((c) => [label(c), c] as const))("%s's help is one sentence, then a line per value with no type", (_, card) => {
    const [sentence, ...rest] = card.lines;
    expect(sentence).toMatch(/^[A-Z].*\.$/);
    expect(sentence!.length).toBeLessThanOrEqual(80);
    const params = rest.filter((l) => l.startsWith("@param"));
    const required = [...(card.declaration ?? "").matchAll(/\[required\((\w+)\)\]/g)].map((m) => m[1]);
    expect(params.map((l) => /^@param \{\w+\} (\w+)/.exec(l)?.[1])).toEqual(required);
    for (const param of params) {
      const words = /^@param \{\w+\} \w+\s+(.+)$/.exec(param)?.[1] ?? "";
      expect(words.length).toBeGreaterThan(0);
      expect(words.length).toBeLessThanOrEqual(40);
    }
  });

  test("setup and draw say when they run", () => {
    const sentence = (name: string) => cards.find((c) => label(c) === `[define(${name})]`)?.lines[0];
    expect(sentence("setup")).toBe("Runs once when the program starts.");
    expect(sentence("draw")).toBe("Runs again and again, every frame, after setup.");
  });
});
