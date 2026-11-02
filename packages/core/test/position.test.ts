import { describe, expect, it } from "vitest";
import { lineColumnAt, offsetAt } from "@snapscript/core";

const text = "[define(setup)]\n  [call(p5.circle)][num{20}]\n\n[dedent]";

describe("text positions", () => {
  it("gives a line from 1 and a column from 0", () => {
    expect(lineColumnAt(text, 0)).toEqual({ line: 1, column: 0 });
    expect(lineColumnAt(text, 18)).toEqual({ line: 2, column: 2 });
  });

  it("puts a line's end at the column after its last letter", () => {
    expect(lineColumnAt(text, 15)).toEqual({ line: 1, column: 15 });
    expect(lineColumnAt(text, 16)).toEqual({ line: 2, column: 0 });
  });

  it("knows an empty line and the end of the text", () => {
    expect(lineColumnAt(text, 45)).toEqual({ line: 3, column: 0 });
    expect(lineColumnAt(text, text.length)).toEqual({ line: 4, column: 8 });
  });

  it("turns a line and column back into the offset", () => {
    expect(offsetAt(text, { line: 2, column: 2 })).toBe(18);
    expect(offsetAt(text, { line: 4, column: 8 })).toBe(text.length);
  });

  it("round-trips every offset in the text, line ends and the end included", () => {
    for (let offset = 0; offset <= text.length; offset++) {
      expect(offsetAt(text, lineColumnAt(text, offset))).toBe(offset);
    }
  });

  it("refuses a position outside the text", () => {
    expect(() => lineColumnAt(text, -1)).toThrow(RangeError);
    expect(() => lineColumnAt(text, text.length + 1)).toThrow(RangeError);
    expect(() => offsetAt(text, { line: 5, column: 0 })).toThrow(RangeError);
    expect(() => offsetAt(text, { line: 1, column: 16 })).toThrow(RangeError);
  });
});
