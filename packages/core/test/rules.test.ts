import { describe, expect, it } from "vitest";
import { builtins, firstStage, stagesOfKind, type Builtin, type ErrorKind } from "@snapscript/core";

const kinds: ErrorKind[] = [
  "SyntaxError",
  "IndentationError",
  "NameError",
  "TypeError",
  "AttributeError",
  "ImportError",
  "IndexError",
  "ValueError",
  "ZeroDivisionError",
  "RecursionError",
];

describe("the rules table", () => {
  it("gives every error kind a stage", () => {
    for (const kind of kinds) expect(stagesOfKind[kind].length).toBeGreaterThan(0);
  });

  it("finds each kind first at its earliest stage", () => {
    expect(firstStage("SyntaxError")).toBe("structure");
    expect(firstStage("NameError")).toBe("check");
    expect(firstStage("ImportError")).toBe("check");
    expect(firstStage("ZeroDivisionError")).toBe("runtime");
  });

  it("lets random take 0, 1 or 2 values", () => {
    const random = builtins.find((b) => b.name === "random");
    expect(random?.type).toBe("function");
    if (random?.type !== "function") return;
    expect(random.overloads.map((o) => o.params.length)).toEqual([0, 1, 2]);
  });
});

describe("the builtins' help", () => {
  /** The values a builtin's help names: its longest form's, or its slot for any number of them. */
  const valuesOf = (b: Builtin): string[] => {
    if (b.type !== "function") return [];
    const longest = b.overloads.reduce((a, o) => (o.params.length > a.params.length ? o : a));
    return [...longest.params.map((p) => p.name), ...(longest.variadic ? [longest.variadic.name] : [])];
  };

  it("is one sentence of at most about 80 letters for every builtin", () => {
    for (const b of builtins) {
      expect(b.help.sentence, b.name).toMatch(/^[A-Z].*\.$/);
      expect(b.help.sentence.length, b.name).toBeLessThanOrEqual(80);
    }
  });

  it("has one line of at most about 40 letters per value, in the order the cards sit", () => {
    for (const b of builtins) {
      expect(b.help.values.map((v) => v.name), b.name).toEqual(valuesOf(b));
      for (const v of b.help.values) expect(v.about.length, `${b.name} ${v.name}`).toBeLessThanOrEqual(40);
    }
    const range = builtins.find((b) => b.name === "range")!;
    expect(range.help.values.map((v) => v.name)).toEqual(["start", "stop", "step"]);
    expect(builtins.find((b) => b.name === "pi")!.help.values).toEqual([]);
  });

  it("colours every builtin helper", () => {
    for (const b of builtins) expect(b.color, b.name).toBe("helper");
  });
});
