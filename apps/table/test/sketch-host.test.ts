// The sketch view's side (#181 "Processes"): what it does with the session's sketch commands, and
// the frame and error messages it sends back. The real runtime and snapscript-p5's own source,
// against a stand-in for p5 that draws a frame when the test says; no browser.
import { fileURLToPath } from "node:url";
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { compile, nativeModulesOf } from "@snapscript/runtime/compiler";
import type { NativeModule } from "@snapscript/runtime";
import { loadProject } from "../src/project.ts";
import { createSketchHost, type RunContainer, type SketchViewCommand } from "../src/sketch/host.ts";
import type { SketchMessage } from "../src/session.ts";

const project = loadProject(fileURLToPath(new URL("../../../projects/confetti/", import.meta.url)));
/** snapscript-p5's native module, from its source: a query makes each import a fresh copy. */
const p5Source = fileURLToPath(new URL("../../../libraries/p5/src/p5.ts", import.meta.url));
const lines = (...text: string[]): string => `${text.join("\n")}\n`;

/** A start command for a program under confetti's main.snap (which imports snapscript-p5 as p5). */
function start(run: number, ...program: string[]): SketchViewCommand {
  const result = check(lines(project.entry.text, "", ...program), [], { loader: project.loader, id: project.entry.id });
  expect(result.errors).toEqual([]);
  return { type: "start", run, js: compile(result.program), natives: nativeModulesOf(result.program).map(({ id }) => ({ id, source: "" })) };
}

/** A stand-in for p5's instance mode: records calls; `frame()` is p5's setup the first time, then draw. */
class FakeP5 {
  static made: FakeP5[] = [];
  readonly calls: unknown[][] = [];
  setup?: () => void;
  draw?: () => void;
  looping = true;
  removed = false;
  private started = false;
  constructor(sketch: (p: FakeP5) => void, readonly container: FakeContainer) {
    FakeP5.made.push(this);
    const recording = new Proxy(this, {
      get: (target, key, receiver) =>
        key in target || typeof key === "symbol" ? Reflect.get(target, key, receiver) : (...args: unknown[]) => void target.calls.push([key, ...args]),
    });
    sketch(recording);
  }
  noLoop(): void {
    this.looping = false;
  }
  remove(): void {
    this.removed = true;
  }
  frame(): void {
    if (!this.looping) return;
    if (!this.started) {
      this.started = true;
      this.setup?.();
    }
    this.draw?.();
  }
}

interface FakeContainer extends RunContainer {
  run: number;
  visible: boolean;
  removed: boolean;
}

/** A host with a fake clock; each run gets its own copy of p5.ts, as the sketch view imports one per run. */
function host() {
  FakeP5.made = [];
  const sent: SketchMessage[] = [];
  const containers: FakeContainer[] = [];
  const clock = { now: 0 };
  const h = createSketchHost({
    p5: FakeP5 as never,
    container: (run) => {
      const c: FakeContainer = { run, visible: false, removed: false, element: null, show: () => void (c.visible = true), hide: () => void (c.visible = false), remove: () => void (c.removed = true) };
      // p5 is given the container itself, to find each run's p5 by.
      c.element = c;
      containers.push(c);
      return c;
    },
    load: async (natives, run) =>
      Object.fromEntries(
        await Promise.all(natives.map(async (n) => [n.id, (await import(/* @vite-ignore */ `${p5Source}?run=${run}`)) as NativeModule] as const)),
      ),
    send: (m) => sent.push(m),
    now: () => clock.now,
  });
  const p5Of = (run: number) => FakeP5.made.find((p) => p.container.run === run)!;
  return { h, sent, containers, clock, p5Of };
}

const blue = ["[define(draw)]", "[call(p5.background)][color(mediumblue)]"];
const gold = ["[define(draw)]", "[call(p5.background)][color(gold)]"];

describe("starting a run", () => {
  test("it draws hidden in a container of its own, and says when it drew its first frame", async () => {
    const { h, sent, containers, p5Of } = host();
    await h.handle(start(1, ...blue));
    expect(containers.map((c) => [c.run, c.visible])).toEqual([[1, false]]);
    expect(sent).toEqual([]);
    p5Of(1).frame();
    expect(sent).toEqual([{ type: "frame", run: 1 }]);
    expect(p5Of(1).calls).toEqual([["background", "mediumblue"]]);
  });

  test("after the first, a frame is sent at most every 250 ms: the session only needs a heartbeat", async () => {
    const { h, sent, clock, p5Of } = host();
    await h.handle(start(1, ...blue));
    for (const t of [0, 0.016, 0.1, 0.25, 0.3, 0.5]) {
      clock.now = t;
      p5Of(1).frame();
    }
    expect(sent).toHaveLength(3);
  });

  test("two runs at once each draw on their own p5", async () => {
    const { h, p5Of } = host();
    await h.handle(start(1, ...blue));
    await h.handle(start(2, ...gold));
    p5Of(1).frame();
    p5Of(2).frame();
    p5Of(1).frame();
    expect(p5Of(1).calls).toEqual([["background", "mediumblue"], ["background", "mediumblue"]]);
    expect(p5Of(2).calls).toEqual([["background", "gold"]]);
  });
});

describe("show, stop and kill", () => {
  test("show shows the run and hides the others, which keep running", async () => {
    const { h, containers, p5Of } = host();
    await h.handle(start(1, ...blue));
    await h.handle({ type: "show", run: 1 });
    await h.handle(start(2, ...gold));
    await h.handle({ type: "show", run: 2 });
    expect(containers.map((c) => [c.run, c.visible])).toEqual([[1, false], [2, true]]);
    p5Of(1).frame();
    expect(p5Of(1).calls).toHaveLength(1);
  });

  test("stop runs the program's [on(stop)]s, and p5 stops its loop", async () => {
    const { h, p5Of } = host();
    await h.handle(start(1, ...blue));
    p5Of(1).frame();
    await h.handle({ type: "stop", run: 1 });
    expect(p5Of(1).looping).toBe(false);
  });

  test("kill removes the run's p5 and its container", async () => {
    const { h, containers, p5Of } = host();
    await h.handle(start(1, ...blue));
    await h.handle({ type: "stop", run: 1 });
    await h.handle({ type: "kill", run: 1 });
    expect(p5Of(1).removed).toBe(true);
    expect(containers[0]!.removed).toBe(true);
  });

  test("commands for a run it doesn't have are ignored", async () => {
    const { h } = host();
    await expect(h.handle({ type: "kill", run: 9 })).resolves.toBeUndefined();
  });
});

describe("print output", () => {
  test("is sent at once, then at most every 250 ms with each card's newest, and with its card's text position", async () => {
    const { h, sent, clock, p5Of } = host();
    await h.handle(start(1, "[define(draw)]", "[call(print)][call(random)][num{1}][num{9}]"));
    for (const t of [0, 0.1, 0.2, 0.3]) {
      clock.now = t;
      p5Of(1).frame();
    }
    const prints = sent.filter((m) => m.type === "print");
    expect(prints).toEqual([
      { type: "print", run: 1, prints: [{ text: expect.any(String), span: { start: expect.any(Number), end: expect.any(Number) } }] },
      { type: "print", run: 1, prints: [{ text: expect.any(String), span: expect.any(Object) }] },
    ]);
  });

  test("of a run that stopped on an error is still sent", async () => {
    const { h, sent, p5Of } = host();
    await h.handle(start(1, "[define(draw)]", "[call(print)][num{1}]", "[call(print)][num{1}][/][num{0}]"));
    p5Of(1).frame();
    expect(sent.map((m) => m.type)).toEqual(["print", "error"]);
  });
});

describe("errors", () => {
  test("an error in a frame, after run returned, is sent for that run, and p5 stops", async () => {
    const { h, sent, p5Of } = host();
    await h.handle(start(1, "[define(draw)]", "[call(print)][num{1}][/][num{0}]"));
    p5Of(1).frame();
    expect(sent).toEqual([
      { type: "error", run: 1, error: { type: "runtime", kind: "ZeroDivisionError", message: expect.any(String), span: expect.any(Object) } },
    ]);
    expect(p5Of(1).looping).toBe(false);
  });

  test("a native module that won't load is a library error", async () => {
    const { h, sent } = host();
    const broken = createSketchHost({
      p5: FakeP5 as never,
      container: (run) => ({ element: null, show() {}, hide() {}, remove() {}, run }) as never,
      load: async () => {
        throw new Error("Unexpected token");
      },
      send: (m) => sent.push(m),
    });
    await broken.handle(start(1, ...blue));
    void h;
    expect(sent).toEqual([{ type: "error", run: 1, error: { type: "library", kind: null, message: "p5.js didn't load: Unexpected token", span: null } }]);
  });
});
