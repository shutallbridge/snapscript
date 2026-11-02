import { describe, expect, it } from "vitest";
import { builtins, firstStage, stagesOfKind, type ErrorKind } from "@snapscript/core";

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
