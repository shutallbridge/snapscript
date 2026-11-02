// Skipping and follow-on errors (REFERENCE.md §4.3, §8; ADR 0004).
import { describe, expect, test } from "vitest";
import { check, type SkippedLine } from "@snapscript/checker";
import { lines } from "./helpers.ts";

const skippedOf = (text: string, skipped: SkippedLine[] = []): number[] => check(text, skipped).program.skippedLines;

/** Kind, line and the line each error follows from. */
const followsOf = (text: string, skipped: SkippedLine[] = []) =>
  check(text, skipped).errors.map(({ kind, line, followsFrom }) => ({ kind, line, followsFrom }));

describe("a line with an error is skipped", () => {
  test("in draw: [set{x}to] alone, and a half-built [if] with its body", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "[global{a}][num{1}]",
      "[define{draw}]",
      "[call(p5.circle)][num{5}][num{5}][num{2}]",
      "[set{x}to]",
      "[if][get{a}][>]",
      "  [call(print)][get{a}]",
      "[dedent]",
      "[call(print)][str{runs}]",
    );
    expect(skippedOf(text)).toEqual([5, 6, 7, 8]);
  });

  test("a line the table couldn't read is skipped", () => {
    const text = lines("[define{draw}]", "[set{x}to][num{}]", "[call(print)][str{hi}]");
    expect(skippedOf(text, [2])).toEqual([2]);
    expect(skippedOf(text, [{ line: 2 }])).toEqual([2]);
  });

  test("a line with a NameError is skipped", () => {
    const text = lines("[define{draw}]", "[call(print)][get{nowhere}]", "[call(print)][str{hi}]");
    expect(skippedOf(text)).toEqual([2]);
  });

  test("lines that are not part of the program are not marked", () => {
    const text = lines("[call(print)][get{nowhere}]", "[define{draw}]", "[call(print)][str{hi}]");
    expect(skippedOf(text)).toEqual([]);
    expect(check(text, [1]).program.skippedLines).toEqual([]);
  });

  test("a program with no errors skips nothing", () => {
    expect(skippedOf(lines("[define{draw}]", "[call(print)][str{hi}]"))).toEqual([]);
  });
});

describe("a skipped block head skips its body", () => {
  test("a skipped [repeat] takes its body and its [dedent]", () => {
    const text = lines("[define{f}]", "[repeat][num{0}][num{3}]", "  [call(print)][str{hi}]", "[dedent]", "[call(print)][str{runs}]");
    expect(skippedOf(text)).toEqual([2, 3, 4]);
  });

  test("a skipped [for{}in] the table couldn't read takes its body", () => {
    const text = lines("[define{f}]", "[for{}in][call(range)][num{3}]", "  [call(print)][str{hi}]", "[dedent]", "[call(print)][str{runs}]");
    expect(skippedOf(text, [2])).toEqual([2, 3, 4]);
  });

  test("a NameError on a block head skips its body, whose names are not checked", () => {
    const text = lines("[define{f}]", "[if][get{nowhere}]", "  [call(print)][get{neither}]", "[dedent]");
    expect(followsOf(text)).toEqual([{ kind: "NameError", line: 2, followsFrom: null }]);
    expect(skippedOf(text)).toEqual([2, 3, 4]);
  });

  test("nested: only the inner block is skipped", () => {
    const text = lines(
      "[define{f}]",
      "[repeat][num{3}]",
      "  [if][get{nowhere}]",
      "    [call(print)][str{a}]",
      "  [dedent]",
      "  [call(print)][str{runs}]",
      "[dedent]",
    );
    expect(skippedOf(text)).toEqual([3, 4, 5]);
  });
});

describe("a skipped [if] or [elif] skips the rest of its chain", () => {
  const chain = (elif: string) =>
    lines(
      "[define{f}][required{a}][required{b}]",
      "[if][get{a}]",
      "  [call(print)][str{a}]",
      elif,
      "  [call(print)][str{b}]",
      "[else]",
      "  [call(print)][str{neither}]",
      "[dedent]",
    );

  test("a half-built [elif] skips its block and the [else]; the [if] block runs", () => {
    expect(skippedOf(chain("[elif][get{b}][>]"))).toEqual([4, 5, 6, 7]);
  });

  test("an [elif] with a NameError skips the rest of the chain", () => {
    expect(skippedOf(chain("[elif][get{nowhere}]"))).toEqual([4, 5, 6, 7]);
  });

  test("a skipped [if] skips the whole chain and its [dedent]", () => {
    expect(skippedOf(chain("[elif][get{b}]"), [2])).toEqual([2, 3, 4, 5, 6, 7, 8]);
  });

  test("a skipped [else] skips its block", () => {
    expect(skippedOf(chain("[elif][get{b}]"), [6])).toEqual([6, 7]);
  });

  test("an [else] with no [dedent] before a line: the chain is skipped, the line after it runs", () => {
    const text = lines(
      "[define{f}][required{a}]",
      "[if][get{a}]",
      "  [call(print)][str{a}]",
      "[else]",
      "  [call(print)][str{not_a}]",
      "[call(print)][str{done}]",
    );
    expect(skippedOf(text)).toEqual([2, 3, 4, 5]);
  });
});

describe("a missing [dedent] skips only that block", () => {
  test("h: the block is skipped with its body, and the line after it runs", () => {
    const text = lines("[define{h}][required{a}]", "[if][get{a}]", "  [call(print)][get{a}]", "[call(print)][str{done}]");
    expect(skippedOf(text)).toEqual([2, 3]);
  });

  test("j: two missing, the outer block is skipped with everything in it", () => {
    const text = lines(
      "[define{j}][required{a}]",
      "[repeat][num{3}]",
      "  [if][get{a}]",
      "    [call(print)][get{a}]",
      "[call(print)][str{done}]",
    );
    expect(skippedOf(text)).toEqual([2, 3, 4]);
  });

  test("k: the inner block is skipped, and the line after it runs", () => {
    const text = lines(
      "[define{k}][required{a}]",
      "[repeat][num{3}]",
      "  [if][get{a}]",
      "    [call(print)][get{a}]",
      "  [call(print)][str{y}]",
      "[dedent]",
    );
    expect(skippedOf(text)).toEqual([3, 4]);
  });

  test("m: an empty block is skipped, and the line after it runs", () => {
    expect(skippedOf(lines("[define{m}][required{ready}]", "[if][get{ready}]", "[call(print)][str{done}]"))).toEqual([2]);
  });

  test("the line after it can use what runs before the block", () => {
    const text = lines("[define{h}][required{a}]", "[set{n}to][num{1}]", "[if][get{a}]", "  [set{n}to][num{2}]", "[call(print)][get{n}]");
    expect(followsOf(text)).toEqual([{ kind: "IndentationError", line: 3, followsFrom: null }]);
  });
});

describe("a skipped [define{…}] or [on(…)] header skips its strip", () => {
  test("its whole strip is skipped", () => {
    const text = lines("[define{f}][optional{a}][required{b}]", "[call(print)][str{a}]", "[repeat][num{2}]", "  [call(print)][str{b}]", "[dedent]");
    expect(skippedOf(text)).toEqual([1, 2, 3, 4, 5]);
  });

  test("its body's names are not checked", () => {
    const text = lines("[on(load)][num{1}]", "[call(print)][get{nowhere}]");
    expect(followsOf(text)).toEqual([{ kind: "SyntaxError", line: 1, followsFrom: null }]);
  });

  test("a call to a function whose header is skipped follows from the header", () => {
    const text = lines("[define{f}][optional{a}][required{b}]", "", "[define{draw}]", "[call{f}][num{1}]");
    expect(followsOf(text)).toEqual([
      { kind: "SyntaxError", line: 1, followsFrom: null },
      { kind: "NameError", line: 4, followsFrom: 1 },
    ]);
  });

  test("a skipped import's name follows from the import", () => {
    const text = lines("[import(snapscript-p5)as(p5)]", "[define{draw}]", "[call(p5.circle)][num{1}][num{2}][num{3}]");
    expect(followsOf(text, [1])).toEqual([{ kind: "NameError", line: 3, followsFrom: 1 }]);
  });

  test("a skipped [global{…}] makes the name a local, not set yet, following from it", () => {
    const text = lines("[global{count}][num{1}][/][num{2}]", "[define{draw}]", "[set{count}to][get{count}][+][num{1}]");
    const { errors } = check(text, []);
    expect(errors.map(({ kind, line, message, followsFrom }) => ({ kind, line, message, followsFrom }))).toEqual([
      { kind: "SyntaxError", line: 1, message: expect.any(String), followsFrom: null },
      { kind: "NameError", line: 3, message: "count is a local of draw, not set yet", followsFrom: 1 },
    ]);
  });
});

describe("follow-on errors name the skipped line they come from", () => {
  test("NameError, from the line above: skipped", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "[define{draw}]",
      "[set{x}to]",
      "[call(p5.circle)][get{x}][num{20}][num{20}]",
    );
    const { errors, program } = check(text, []);
    expect(errors.map(({ kind, line, message, followsFrom }) => ({ kind, line, message, followsFrom }))).toEqual([
      { kind: "SyntaxError", line: 3, message: expect.any(String), followsFrom: null },
      { kind: "NameError", line: 4, message: "x is not defined", followsFrom: 3 },
    ]);
    expect(program.skippedLines).toEqual([3, 4]);
  });

  test("from a line the table couldn't read", () => {
    const text = lines("[define{draw}]", "[set{x}to][num{}]", "[call(print)][get{x}]");
    expect(followsOf(text, [2])).toEqual([{ kind: "NameError", line: 3, followsFrom: 2 }]);
  });

  test("from a line skipped for its own NameError, which follows from nothing", () => {
    const text = lines("[define{draw}]", "[set{y}to][get{nowhere}]", "[call(print)][get{y}]");
    expect(followsOf(text)).toEqual([
      { kind: "NameError", line: 2, followsFrom: null },
      { kind: "NameError", line: 3, followsFrom: 2 },
    ]);
  });

  test("each link of a chain names the line before it", () => {
    const text = lines("[define{draw}]", "[set{x}to]", "[set{y}to][get{x}]", "[call(print)][get{y}]");
    expect(followsOf(text)).toEqual([
      { kind: "SyntaxError", line: 2, followsFrom: null },
      { kind: "NameError", line: 3, followsFrom: 2 },
      { kind: "NameError", line: 4, followsFrom: 3 },
    ]);
  });

  test("from a line skipped with its block: the line that sets the name", () => {
    const text = lines("[define{draw}]", "[repeat][num{0}][num{3}]", "  [set{x}to][num{1}]", "[dedent]", "[call(print)][get{x}]");
    expect(followsOf(text)).toEqual([
      { kind: "SyntaxError", line: 2, followsFrom: null },
      { kind: "NameError", line: 5, followsFrom: 3 },
    ]);
  });

  test("the nearest skipped line above it", () => {
    const text = lines("[define{draw}]", "[set{x}to]", "[set{x}to][num{}]", "[call(print)][get{x}]");
    expect(followsOf(text, [3])).toEqual([
      { kind: "SyntaxError", line: 2, followsFrom: null },
      { kind: "NameError", line: 4, followsFrom: 3 },
    ]);
  });

  test("a local not set yet, because the line that sets it first is skipped", () => {
    const text = lines("[define{draw}]", "[set{x}to]", "[call(print)][get{x}]", "[set{x}to][num{1}]");
    const { errors } = check(text, []);
    expect(errors.map(({ line, message, followsFrom }) => ({ line, message, followsFrom }))).toEqual([
      { line: 2, message: expect.any(String), followsFrom: null },
      { line: 3, message: "x is a local of draw, not set yet", followsFrom: 2 },
    ]);
  });

  test("a skipped line below the use is not where it comes from", () => {
    const text = lines("[define{draw}]", "[call(print)][get{x}]", "[set{x}to]");
    expect(followsOf(text)).toEqual([
      { kind: "NameError", line: 2, followsFrom: null },
      { kind: "SyntaxError", line: 3, followsFrom: null },
    ]);
  });

  test("a skipped line that sets a name makes it no local: the top-level declaration is used", () => {
    const text = lines("[define{helper}]", "", "[define{draw}]", "[call{helper}]", "[set{helper}to][get{nowhere}]");
    expect(followsOf(text)).toEqual([{ kind: "NameError", line: 5, followsFrom: null }]);
  });

  test("an error that no skip causes follows from nothing, and suggests nothing when nothing is close", () => {
    const [error] = check(lines("[define{draw}]", "[call(print)][get{zzzzzz}]"), []).errors;
    expect(error.followsFrom).toBeNull();
    expect(error.suggestion).toBeNull();
  });
});
