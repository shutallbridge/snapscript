// The text notation of REFERENCE.md §1.1: brackets, comments, doc comments and their tags.
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { bodyOf, errorsOf, lines, valueOf } from "./helpers.ts";

describe("brackets", () => {
  test("a printed card and the same card handwritten mean the same thing", () => {
    expect(valueOf("[call(p5.circle)][num(1)][num{2}][num{3}]")).toBe("p5.circle(1, 2, 3)");
    expect(valueOf("[call{p5.circle}][num{1}][num{2}][num{3}]")).toBe("p5.circle(1, 2, 3)");
  });

  test("text that is not a card is a SyntaxError", () => {
    expect(errorsOf(lines("[define{f}]", "[call(print)][num{1}] runs"))).toEqual([
      { kind: "SyntaxError", line: 2, message: expect.any(String) },
    ]);
    expect(errorsOf(lines("[define{f}]", "[call(print)][bogus{1}]"))).toEqual([
      { kind: "SyntaxError", line: 2, message: expect.any(String) },
    ]);
  });
});

describe("comments", () => {
  test("// and /* */ comments exist only in text", () => {
    const text = lines(
      "// a line comment",
      "/* a block comment */",
      "[define{setup}]   // the setup",
      "/* spread",
      "   over lines */",
      "[call(print)][num{1}] /* inline */ [num{2}]",
    );
    expect(errorsOf(text)).toEqual([]);
    expect(bodyOf(text)).toHaveLength(1);
  });

  test("a comment never starts inside a card", () => {
    expect(valueOf("[set{v}to][num{1}][/][num{2}]")).toBe("v = 1 / 2");
    expect(valueOf("[call(print)][str{a//b}]")).toBe('print("a//b")');
  });
});

describe("doc comments", () => {
  const library = lines(
    "/**",
    " * Draws a circle.",
    " * @param {num} x  how far from the left",
    " * @param {num} y  how far from the top",
    " * @param {num} d  how wide",
    " * @card",
    " */",
    "[extern(circle)][required(x)][required(y)][required(d)]",
    "",
    "/**",
    " * Sets the color that shapes are filled with.",
    " * @param {color | str} c",
    " * @card",
    " * @color setting",
    " */",
    "[extern(fill)][required(c)]",
    "",
    "/**",
    " * How far apart two points are.",
    " * @returns {num}",
    " */",
    "[extern(dist)][required(x1)][required(y1)][required(x2)][required(y2)]",
    "",
    "/**",
    " * Runs once, before the first draw.",
    " * @card [define(setup)]",
    " */",
  );

  test("a doc comment just before a declaration is kept on it, with its tags", () => {
    const { errors, program } = check(library, []);
    expect(errors).toEqual([]);
    const [circle, fill, dist] = program.declarations;
    expect(circle.doc?.description).toBe("Draws a circle.");
    expect(circle.doc?.params).toEqual([
      { name: "x", types: ["num"], description: "how far from the left" },
      { name: "y", types: ["num"], description: "how far from the top" },
      { name: "d", types: ["num"], description: "how wide" },
    ]);
    expect(circle.doc?.cards).toEqual([null]);
    expect(fill.doc?.params).toEqual([{ name: "c", types: ["color", "str"], description: "" }]);
    expect(fill.doc?.color).toBe("setting");
    expect(dist.doc?.returns).toEqual({ types: ["num"], description: "" });
  });

  test("a doc comment anywhere else stands alone", () => {
    const { program } = check(library, []);
    expect(program.docComments).toHaveLength(1);
    expect(program.docComments[0].description).toBe("Runs once, before the first draw.");
    expect(program.docComments[0].cards).toEqual(["[define(setup)]"]);
  });

  test("a doc comment with a blank line before the declaration stands alone", () => {
    const { program } = check(lines("/** Helps. */", "", "[define{helper}]"), []);
    expect(program.declarations[0].doc).toBeNull();
    expect(program.docComments).toHaveLength(1);
  });

  test("@table says where a strip lies", () => {
    const text = lines(
      "/** @table 120 40 */",
      "[define{setup}]",
      "[call(p5.createCanvas)][num{500}][num{500}]",
      "",
      "/**",
      " * Draws the confetti.",
      " * @table 40 210 15",
      " */",
      "[define{draw}]",
      "[call(p5.circle)][num{250}][num{250}][num{5}]",
      "",
      "/** @table hidden */",
      "[define{helper}]",
      "[return][num{1}]",
      "",
      "[define{other}]",
      "",
      "/** @table here, please */",
      "[define{unread}]",
      "",
      "/** @table 10 20 */",
      "[import(snapscript-p5)as(p5)]",
    );
    const { errors, program } = check(text, []);
    expect(errors).toEqual([]);
    expect(program.declarations.map((d) => d.table)).toEqual([
      { type: "at", x: 120, y: 40, turn: 0 },
      { type: "at", x: 40, y: 210, turn: 15 },
      { type: "hidden" },
      { type: "auto" },
      { type: "auto" },
      { type: "hidden" },
    ]);
    expect(program.declarations[1].doc?.description).toBe("Draws the confetti.");
  });
});

describe("text positions", () => {
  test("program nodes keep their text positions", () => {
    const text = lines("[define{draw}]", "[call(p5.circle)][get{x}][num{20}][num{20}]");
    const { program } = check(text, []);
    const draw = program.declarations[0];
    expect(text.slice(draw.span.start, draw.span.end)).toBe("[define{draw}]");
    const [statement] = bodyOf(text);
    expect(statement.line).toBe(2);
    if (statement.type !== "expression" || statement.value?.type !== "call") throw new Error("not a call");
    expect(text.slice(statement.value.card.span.start, statement.value.card.span.end)).toBe("[call(p5.circle)]");
    expect(text.slice(statement.value.span.start, statement.value.span.end)).toBe(
      "[call(p5.circle)][get{x}][num{20}][num{20}]",
    );
    const [x] = statement.value.args;
    expect(text.slice(x.span.start, x.span.end)).toBe("[get{x}]");
  });
});
