import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";

describe("check", () => {
  test("a well-formed program checks with no errors", () => {
    const { errors, program } = check(
      "[define{setup}]\n[call(print)][str{hello_world}]\n",
      [],
    );
    expect(errors).toEqual([]);
    expect(program).toBeDefined();
  });

  test("a structure error has its kind, message, stage, line and spans", () => {
    const text = "[define{draw}]\n[set{x}to]\n";
    const { errors } = check(text, []);
    expect(errors).toHaveLength(1);
    const [error] = errors;
    expect(error.kind).toBe("SyntaxError");
    expect(error.stage).toBe("structure");
    expect(error.line).toBe(2);
    expect(error.message).toEqual(expect.any(String));
    expect(error.spans.length).toBeGreaterThan(0);
    for (const span of error.spans) {
      expect(text.slice(span.start, span.end)).toBe("[set{x}to]");
    }
  });
});
