// Every REFERENCE.md example marked with a structure-stage error kind, through
// check(text, skippedLines). Examples are wrapped in a strip where the
// reference shows a bare line, since only lines below a [define] are checked.
import { describe, expect, test } from "vitest";
import { errorsOf, lines, python, valueOf } from "./helpers.ts";

const inDefine = (...body: string[]): string => lines("[define{f}]", ...body);

const syntaxErrorOn = (line: number, message?: string) => [
  { kind: "SyntaxError", line, message: message === undefined ? expect.any(String) : expect.stringContaining(message) },
];

describe("§2.1 handwriting", () => {
  test.each(["[num{-1}]", "[num{0.5}]", "[num{1 000}]"])("%s is a number", (card) => {
    expect(errorsOf(inDefine(`[set{n}to]${card}`))).toEqual([]);
  });

  test.each(["[num{.5}]", "[num{5.}]", "[num{1e5}]", "[num{}]"])("%s is a SyntaxError", (card) => {
    expect(errorsOf(inDefine(`[set{n}to]${card}`))).toEqual(syntaxErrorOn(2));
  });

  test("[set{}to] is a SyntaxError", () => {
    expect(errorsOf(inDefine("[set{}to][num{1}]"))).toEqual(syntaxErrorOn(2));
  });

  test("gaps are ignored and _ is a space", () => {
    expect(valueOf("[call(print)][str{hello_world}][str{hello world}][str{__hi}][str{}]")).toBe(
      'print("hello world", "helloworld", "  hi", "")',
    );
    expect(valueOf("[set{frame Count}to][num{1 000}]")).toBe("frameCount = 1000");
    expect(valueOf("[call(print)][get{p5.framecount}]")).toBe("print(p5.framecount)");
  });
});

describe("§3.2 types", () => {
  test("[color(notacolor)] is a SyntaxError", () => {
    expect(errorsOf(inDefine("[set{c}to][color(notacolor)]"))).toEqual(syntaxErrorOn(2));
    expect(errorsOf(inDefine("[set{c}to][color(midnightblue)]"))).toEqual([]);
  });
});

describe("§4.1 structure of a program", () => {
  test("two top-level declarations with the same name are a SyntaxError, both strips", () => {
    expect(errorsOf(lines("[define{f}]", "[define{f}]"))).toEqual([...syntaxErrorOn(1), ...syntaxErrorOn(2)]);
  });

  test("an import and a define with the same name are a SyntaxError, both", () => {
    expect(errorsOf(lines("[import(snapscript-p5)as(p5)]", "[define{p5}]"))).toEqual([
      ...syntaxErrorOn(1),
      ...syntaxErrorOn(2),
    ]);
  });

  test("[extern(…)]s that accept different numbers of values may share a name", () => {
    expect(errorsOf(lines("[extern(fill)][required(color)]", "[extern(fill)][required(r)][required(g)][required(b)]"))).toEqual([]);
    expect(errorsOf(lines("[extern(fill)][required(color)]", "[extern(fill)][required(c)]"))).toEqual([
      ...syntaxErrorOn(1),
      ...syntaxErrorOn(2),
    ]);
  });

  test("a second handler for an event is a SyntaxError", () => {
    expect(errorsOf(lines("[on(load)]", "[call(print)][num{1}]", "[on(load)]"))).toEqual(syntaxErrorOn(3));
  });
});

describe("§4.2 globals", () => {
  test.each(["[global{speed}][num{5}]", "[global{title}][str{hi}]", "[global{scores}][call(list)]", "[global{user}][call(dict)]"])(
    "%s starts with one literal card, or an empty list or dict",
    (line) => {
      expect(errorsOf(lines(line))).toEqual([]);
    },
  );

  test.each(["[global{mid}][num{500}][/][num{2}]", "[global{r}][call(random)]"])("%s is a SyntaxError", (line) => {
    expect(errorsOf(lines(line))).toEqual(syntaxErrorOn(1));
  });
});

describe("§4.3 errors", () => {
  test("[(][)] is a SyntaxError", () => {
    expect(errorsOf(inDefine("[(][)]"))).toEqual(syntaxErrorOn(2));
  });

  test("[repeat][num{0}][num{3}] is a SyntaxError", () => {
    expect(errorsOf(inDefine("[repeat][num{0}][num{3}]", "[dedent]"))).toEqual(syntaxErrorOn(2));
  });

  test("structure errors in draw: [set{x}to] and a half-built [if]", () => {
    const text = lines(
      "[define{draw}]",
      "[call(p5.circle)][num{5}][num{5}][num{2}]",
      "[set{x}to]",
      "[call(p5.circle)][num{5}]",
      "[if][get{a}][>]",
      "  [call(print)][get{a}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([...syntaxErrorOn(3), ...syntaxErrorOn(5)]);
  });

  test("a half-built [elif] is a SyntaxError", () => {
    const text = inDefine(
      "[if][get{a}]",
      "  [call(print)][str{a}]",
      "[elif][get{b}][>]",
      "  [call(print)][str{b}]",
      "[else]",
      "  [call(print)][str{neither}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual(syntaxErrorOn(4));
  });

  test("[set{x}to] alone, then a use of x", () => {
    const text = lines("[define{draw}]", "[set{x}to]", "[call(p5.circle)][get{x}][num{20}][num{20}]");
    expect(errorsOf(text)).toEqual(syntaxErrorOn(2));
  });
});

describe("§5 modules", () => {
  test("a package needs as(…)", () => {
    expect(errorsOf(lines("[import(snapscript-p5)]"))).toEqual(syntaxErrorOn(1, "a package needs as(…)"));
  });

  test("a path without as(…) binds to its file's name", () => {
    expect(errorsOf(lines("[import(snapscript-p5)as(p5)]", "[import(./shapes.snap)as(shapes)]"))).toEqual([]);
    expect(errorsOf(lines("[import(./shapes.snap)]", "[define{shapes}]"))).toEqual([
      ...syntaxErrorOn(1),
      ...syntaxErrorOn(2),
    ]);
  });
});

describe("§6 expressions", () => {
  test.each([
    ["[set{x}to][num{5}][+][num{3}]", "x = 5 + 3"],
    ["[for{i}in][call(range)][num{10}][*][num{2}]", "for i in range(10 * 2)"],
    ["[if][get{a}][>][num{5}]", "if a > 5"],
    ["[call(print)][call{random}]", "print(random())"],
    ["[call(print)][call{random}][+][num{5}]", "print(random() + 5)"],
    ["[if][call(len)][get{a}][>][num{5}]", "if len(a > 5)"],
    ["[call(print)][call{random}][num{0}][num{5}]", "print(random(0, 5))"],
    ["[call(print)][(][call{random}][)][num{0}][num{5}]", "print((random()), 0, 5)"],
    ["[if][(][call(len)][get{a}][)][>][num{5}]", "if (len(a)) > 5"],
    ["[call(p5.circle)][(][call{random}][num{0}][num{500}][)][num{5}][num{5}]", "p5.circle((random(0, 500)), 5, 5)"],
    ["[call{f}][(][call{g}][call{h}][num{1}][)][num{2}]", "f((g(h(1))), 2)"],
    ["[call(print)][get{a}][get{b}]", "print(a, b)"],
    ["[call(print)][get{a}][getProp{b}]", "print(a.b)"],
    ["[call(print)][get{a}][call{b}]", "print(a.b())"],
    ["[get{app}][getProp{items}][call(getAt)][num{0}]", "app.items.getAt(0)"],
  ])("%s is %s (§6.1, §6.2)", (line, expected) => {
    expect(valueOf(line)).toBe(expected);
  });

  test.each([
    ["[set{v}to][num{2}][+][num{3}][*][num{4}]", "v = <2 + <3 * 4>>"],
    ["[set{v}to][num{10}][-][num{3}][-][num{2}]", "v = <<10 - 3> - 2>"],
    ["[set{v}to][not][get{a}][>][num{1}]", "v = <not <a > 1>>"],
    ["[set{v}to][not][get{a}][and][get{b}]", "v = <<not a> and b>"],
    ["[set{v}to][get{name}][or][str{anon}]", 'v = <name or "anon">'],
  ])("%s binds as %s (§6.3)", (line, expected) => {
    const text = inDefine(line);
    expect(errorsOf(text)).toEqual([]);
    const value = valueOf(line).split(" = ")[0];
    expect(`${value} = ${python(firstSetValue(text), true)}`).toBe(expected);
  });

  test("a second comparison outside a group is a SyntaxError", () => {
    expect(errorsOf(inDefine("[set{v}to][get{a}][<][get{b}][<][get{c}]"))).toEqual(syntaxErrorOn(2));
    expect(errorsOf(inDefine("[set{v}to][(][get{a}][<][get{b}][)][and][(][get{b}][<][get{c}][)]"))).toEqual([]);
  });

  test.each(["[(][num{0}][num{500}][)]", "[(][)]"])("a group holds exactly one value: %s is a SyntaxError (§6.4)", (group) => {
    expect(errorsOf(inDefine(`[set{v}to]${group}`))).toEqual(syntaxErrorOn(2, "a group holds exactly one value"));
  });
});

describe("§8 compound statements", () => {
  test("a block's body may be empty", () => {
    expect(errorsOf(inDefine("[if][get{ready}]", "[dedent]"))).toEqual([]);
  });

  test("a [dedent] with no block to close is an IndentationError", () => {
    expect(errorsOf(lines("[define{f}]", "[dedent]"))).toEqual([
      { kind: "IndentationError", line: 2, message: expect.stringContaining("no block to close") },
    ]);
  });

  test("a line indented where no block opens is an IndentationError, with the lines indented under it", () => {
    expect(errorsOf(lines("[define{g}]", "[set{x}to][num{1}]", "  [call(print)][get{x}]"))).toEqual([
      { kind: "IndentationError", line: 3, message: expect.any(String) },
    ]);
  });

  const noDedent = (line: number) => ({ kind: "IndentationError", line, message: expect.stringContaining("no [dedent]") });

  test("h: a block with a line after it in its head's column is an IndentationError on its head", () => {
    expect(errorsOf(lines("[define{h}]", "[if][get{a}]", "  [call(print)][get{a}]", "[call(print)][str{done}]"))).toEqual([
      noDedent(2),
    ]);
  });

  test("j: two missing [dedent]s are one error, on the outer block", () => {
    const text = lines("[define{j}]", "[repeat][num{3}]", "  [if][get{a}]", "    [call(print)][get{a}]", "[call(print)][str{done}]");
    expect(errorsOf(text)).toEqual([noDedent(2)]);
  });

  test("k: only the inner [dedent] missing is an error on the inner block", () => {
    const text = lines(
      "[define{k}]",
      "[repeat][num{3}]",
      "  [if][get{a}]",
      "    [call(print)][get{a}]",
      "  [call(print)][str{y}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([noDedent(3)]);
  });

  test("m: an empty body with no [dedent], then a line in its column", () => {
    expect(errorsOf(lines("[define{m}]", "[if][get{ready}]", "[call(print)][str{done}]"))).toEqual([noDedent(2)]);
  });

  test("a block at the end of its strip needs no [dedent]", () => {
    const text = lines(
      "[define{a}]",
      "[repeat][num{3}]",
      "  [if][get{ready}]",
      "    [call(print)][str{hi}]",
      "",
      "[define{b}]",
      "[for{i}in][call(range)][num{3}]",
      "  [call(print)][get{i}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("§8.1 [if], [elif] and [else]", () => {
  test("a chain closed by one [dedent]", () => {
    const text = inDefine(
      "[if][get{score}][>][num{10}]",
      "  [call(print)][str{win}]",
      "[elif][get{score}][>][num{5}]",
      "  [call(print)][str{close}]",
      "[else]",
      "  [call(print)][str{lose}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a block of a chain may be empty", () => {
    expect(errorsOf(inDefine("[if][get{ready}]", "[else]", "  [call(print)][str{wait}]", "[dedent]"))).toEqual([]);
  });

  test("an [else] after a [dedent] is a SyntaxError: no chain to continue", () => {
    const text = inDefine("[if][get{a}]", "  [call(print)][get{a}]", "[dedent]", "[else]");
    expect(errorsOf(text)).toEqual(syntaxErrorOn(5, "no chain to continue"));
  });

  test("an [else] after a [repeat] body is a SyntaxError: [repeat] has no [else]", () => {
    const text = inDefine("[repeat][num{3}]", "  [call(print)][str{hi}]", "[else]");
    expect(errorsOf(text)).toEqual(syntaxErrorOn(4, "[repeat] has no [else]"));
  });

  test("an [elif] after an [else] is a SyntaxError", () => {
    const text = inDefine("[if][get{a}]", "[else]", "[elif][get{b}]");
    expect(errorsOf(text)).toEqual(syntaxErrorOn(4, "[elif] after [else]"));
  });

  test("a chain with no [dedent] is an IndentationError on its [if]", () => {
    const text = inDefine(
      "[if][get{a}]",
      "  [call(print)][str{a}]",
      "[else]",
      "  [call(print)][str{not_a}]",
      "[call(print)][str{done}]",
    );
    expect(errorsOf(text)).toEqual([{ kind: "IndentationError", line: 2, message: expect.stringContaining("no [dedent]") }]);
  });

  test("an [else] after the line that runs is still no chain to continue", () => {
    const text = inDefine("[if][get{a}]", "  [call(print)][get{a}]", "[call(print)][str{done}]", "[else]");
    expect(errorsOf(text)).toEqual([
      { kind: "IndentationError", line: 2, message: expect.stringContaining("no [dedent]") },
      ...syntaxErrorOn(5, "no chain to continue"),
    ]);
  });
});

describe("§8.2 loops and §8.3 functions", () => {
  test("[repeat][num{0}][num{3}] is a SyntaxError", () => {
    expect(errorsOf(inDefine("[repeat][num{0}][num{3}]"))).toEqual(syntaxErrorOn(2));
  });

  test("parameters, with optional defaults of one leaf card", () => {
    expect(errorsOf(lines("[define{greet}][required{message}][optional{title}][str{Mx}][optional{suffix}]"))).toEqual([]);
    expect(errorsOf(lines("[define{dot}][optional{size}][get{width}]"))).toEqual([]);
  });

  test("a default of more than one card is a SyntaxError", () => {
    expect(errorsOf(lines("[define{blob}][optional{size}][num{1}][+][num{2}]"))).toEqual(syntaxErrorOn(1));
  });

  test("required parameters come before optional ones", () => {
    expect(errorsOf(lines("[define{f}][optional{a}][required{b}]"))).toEqual(syntaxErrorOn(1));
  });
});

function firstSetValue(text: string) {
  return (checkBody(text)[0] as { value: Parameters<typeof python>[0] }).value;
}

import { bodyOf as checkBody } from "./helpers.ts";
