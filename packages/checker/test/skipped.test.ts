// Lines the camera couldn't read are read for structure only.
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { bodyOf, errorsOf, lines } from "./helpers.ts";

describe("skippedLines", () => {
  const text = lines("[define{draw}]", "[for{}in][call(range)][num{3}]", "  [call(print)][str{hi}]", "[dedent]");

  test("a skipped [for{}in]'s empty braces make no error", () => {
    expect(errorsOf(text, [2])).toEqual([]);
    expect(errorsOf(text, [])).toEqual([{ kind: "SyntaxError", line: 2, message: expect.any(String) }]);
  });

  test("a skipped [for{}in] still opens its block", () => {
    const [loop, ...rest] = bodyOf(text);
    expect(errorsOf(text, [2])).toEqual([]);
    expect(rest).toEqual([]);
    expect(loop.type).toBe("for");
    if (loop.type !== "for") return;
    expect(loop.body.map((s) => s.line)).toEqual([3]);
    expect(loop.closed).toBe("dedent");
  });

  test("a skipped line's value with empty braces makes no error", () => {
    expect(errorsOf(lines("[define{draw}]", "[set{x}to][num{}]"), [2])).toEqual([]);
  });

  test("skipped lines may come with their reason", () => {
    const { errors } = check(text, [{ line: 2, reason: "read error" } as { line: number }]);
    expect(errors).toEqual([]);
  });

  test("a skipped line still takes part in its block's structure", () => {
    const missing = lines("[define{draw}]", "[if][get{}]", "  [call(print)][str{hi}]", "[call(print)][str{done}]");
    expect(errorsOf(missing, [2])).toEqual([{ kind: "IndentationError", line: 2, message: expect.stringContaining("no [dedent]") }]);
  });
});
