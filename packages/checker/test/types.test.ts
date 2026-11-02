// Types in the check stage (REFERENCE.md §3, §4.3, §6, §8, §9): only what
// would certainly fail is reported.
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { errorsOf, lines } from "./helpers.ts";

const inDefine = (...body: string[]): string => lines("[define{f}]", ...body);

const typeError = (line: number, message: string) => ({ kind: "TypeError", line, message });
const attributeError = (line: number, message: string) => ({ kind: "AttributeError", line, message });

describe("§6.3 operators", () => {
  test("[str{score}][+][num{5}] is a TypeError", () => {
    expect(errorsOf(inDefine("[call(print)][str{score}][+][num{5}]"))).toEqual([
      typeError(2, "[+] takes two nums or two strs, not a str and a num"),
    ]);
  });

  test("its span is the whole value", () => {
    const text = inDefine("[call(print)][str{score}][+][num{5}]");
    const [error] = check(text, []).errors;
    expect(error.stage).toBe("check");
    expect(error.spans.map((s) => text.slice(s.start, s.end))).toEqual(["[str{score}][+][num{5}]"]);
  });

  test.each([
    "[str{ab}][+][str{cd}]",
    "[num{-1}][%][num{500}]",
    "[num{1}][==][str{1}]",
    "[str{a}][<][str{b}]",
    "[get{name}][or][str{anon}]",
    "[not][get{a}][and][get{b}]",
  ])("%s checks clean", (value) => {
    expect(errorsOf(lines("[define{f}][required{a}][required{b}][required{name}]", `[call(print)]${value}`))).toEqual([]);
  });

  test("[num{1}][/][num{0}] is a ZeroDivisionError only at run time", () => {
    expect(errorsOf(inDefine("[call(print)][num{1}][/][num{0}]"))).toEqual([]);
  });

  test.each([
    ["[num{2}][-][str{a}]", "[-] takes two nums, not a num and a str"],
    ["[bool(true)][*][num{2}]", "[*] takes two nums, not a bool and a num"],
    ["[color(gold)][<][num{2}]", "[<] takes two nums or two strs, not a color and a num"],
    ["[num{1}][+][call(list)]", "[+] takes two nums or two strs, not a num and a list"],
  ])("%s is a TypeError", (value, message) => {
    expect(errorsOf(inDefine(`[call(print)]${value}`))).toEqual([typeError(2, message)]);
  });

  test("[and] and [or] give the value that decided, so either type follows", () => {
    expect(errorsOf(inDefine("[set{v}to][num{1}][or][str{a}]", "[call(print)][get{v}][+][num{1}]"))).toEqual([]);
    expect(errorsOf(inDefine("[set{v}to][num{1}][or][num{2}]", "[call(print)][get{v}][+][str{a}]"))).toEqual([
      typeError(3, "[+] takes two nums or two strs, not a num and a str"),
    ]);
  });

  test("[not] gives a bool", () => {
    expect(errorsOf(inDefine("[call(print)][(][not][num{1}][)][+][num{1}]"))).toEqual([
      typeError(2, "[+] takes two nums or two strs, not a bool and a num"),
    ]);
  });
});

describe("what a name holds", () => {
  test("a local holds every type it is set to anywhere in its function", () => {
    const text = inDefine("[set{x}to][num{1}]", "[call(print)][get{x}][+][num{1}]", "[set{x}to][str{a}]");
    expect(errorsOf(text)).toEqual([]);
    expect(errorsOf(inDefine("[set{x}to][str{a}]", "[call(print)][get{x}][+][num{1}]"))).toEqual([
      typeError(3, "[+] takes two nums or two strs, not a str and a num"),
    ]);
  });

  test("a local set from itself keeps its type", () => {
    const text = inDefine("[set{x}to][num{0}]", "[set{x}to][get{x}][+][num{1}]", "[call(print)][get{x}][+][str{a}]");
    expect(errorsOf(text)).toEqual([typeError(4, "[+] takes two nums or two strs, not a num and a str")]);
  });

  test("a parameter with no type can be any type", () => {
    expect(errorsOf(lines("[define{f}][required{a}]", "[call(print)][get{a}][+][num{1}]", "[call(print)][get{a}][+][str{b}]"))).toEqual([]);
  });

  test("a loop variable can be any type, since a list's items can", () => {
    const text = inDefine("[for{i}in][call(list)][num{1}]", "  [call(print)][get{i}][+][str{a}]", "[dedent]");
    expect(errorsOf(text)).toEqual([]);
  });

  test("a global holds its start and every type a function sets it to", () => {
    const start = lines("[global{count}][num{0}]", "", "[define{draw}]", "[call(print)][get{count}][+][str{a}]");
    expect(errorsOf(start)).toEqual([typeError(4, "[+] takes two nums or two strs, not a num and a str")]);
    const set = lines(
      "[global{count}][num{0}]",
      "",
      "[define{setup}]",
      "[set{count}to][str{none_yet}]",
      "",
      "[define{draw}]",
      "[call(print)][get{count}][+][str{a}]",
    );
    expect(errorsOf(set)).toEqual([]);
  });

  test("a global set through its module can be any type", () => {
    const text = lines("[global{count}][num{0}]", "", "[define{draw}]", "[root][setProp{count}to][str{a}]", "[call(print)][get{count}][+][str{a}]");
    expect(errorsOf(text)).toEqual([]);
  });

  test("a line with a type error is skipped, so it sets nothing", () => {
    const text = inDefine("[set{x}to][str{a}][-][num{1}]", "[call(print)][get{x}]");
    const { errors, program } = check(text, []);
    expect(errors.map(({ kind, line, followsFrom }) => ({ kind, line, followsFrom }))).toEqual([
      { kind: "TypeError", line: 2, followsFrom: null },
      { kind: "NameError", line: 3, followsFrom: 2 },
    ]);
    expect(program.skippedLines).toEqual([2, 3]);
  });

  test("a skipped line's value counts for nothing", () => {
    const text = inDefine("[set{x}to][str{a}]", "[set{x}to][num{1}]", "[call(print)][get{x}][+][num{1}]");
    expect(errorsOf(text, [2])).toEqual([]);
    expect(errorsOf(text, [3])).toEqual([typeError(4, "[+] takes two nums or two strs, not a str and a num")]);
  });
});

describe("§8.3 calls are checked against the declared parameters", () => {
  test("[call{greet}] is a TypeError: greet takes 1 to 3 values", () => {
    const text = lines(
      "[define{greet}][required{message}][optional{title}][str{Mx}][optional{suffix}]",
      "[call(print)][get{title}][+][str{_}][+][get{message}]",
      "",
      "[define{setup}]",
      "[call{greet}][str{Ada}]",
      "[call{greet}]",
    );
    expect(errorsOf(text)).toEqual([typeError(6, "greet takes 1 to 3 values")]);
  });

  test("§2.1: a message uses the declared spelling: drawCircle takes 3 values", () => {
    const text = lines(
      "[define{drawCircle}][required{x}][required{y}][required{d}]",
      "",
      "[define{draw}]",
      "[call{drawcircle}][num{5}]",
    );
    expect(errorsOf(text)).toEqual([typeError(4, "drawCircle takes 3 values")]);
  });

  test("a function with no parameters takes no values, and one with one takes 1 value", () => {
    const text = lines("[define{a}]", "[define{b}][required{x}]", "[define{f}]", "[call{a}][num{1}]", "[call{b}]");
    expect(errorsOf(text)).toEqual([typeError(4, "a takes no values"), typeError(5, "b takes 1 value")]);
  });

  test("[extern(…)]s with one name dispatch on the number of values", () => {
    const text = lines(
      "[extern(fill)][required(color)]",
      "[extern(fill)][required(r)][required(g)][required(b)]",
      "",
      "[define{draw}]",
      "[call{fill}][color(gold)]",
      "[call{fill}][num{1}][num{2}][num{3}]",
      "[call{fill}][num{1}][num{2}]",
    );
    expect(errorsOf(text)).toEqual([typeError(7, "fill takes 1 or 3 values")]);
  });

  test("calling a value that is not a function is a TypeError", () => {
    expect(errorsOf(inDefine("[set{n}to][num{1}]", "[call{n}]"))).toEqual([typeError(3, "n is a num, not a function")]);
    expect(errorsOf(inDefine("[call(pi)]"))).toEqual([typeError(2, "pi is a num, not a function")]);
  });

  test("a function held in a value can be called with any values", () => {
    const text = lines("[define{helper}]", "", "[define{f}]", "[set{g}to][get{helper}]", "[call{g}][num{1}]");
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("§9 builtins", () => {
  test.each([
    "[call(print)][get{a}][get{b}]",
    "[call(range)][num{10}]",
    "[call(range)][num{0}][num{500}][num{25}]",
    "[call(len)][get{scores}]",
    "[call(len)][str{abc}]",
    "[call(list)][num{1}][num{2}]",
    "[call(dict)]",
    "[call(abs)][num{-5}]",
    "[call(min)][num{3}][num{1}][num{2}]",
    "[call(max)][get{scores}]",
    "[call(round)][num{2.5}]",
    "[call(sqrt)][num{16}]",
    "[call(sin)][num{90}]",
    "[call(cos)][num{180}]",
    "[call(random)]",
    "[call(random)][num{500}]",
    "[call(random)][num{0}][num{500}]",
    "[call(random)][num{2.5}]",
    "[call(random)][num{500}][num{0}]",
    "[get(pi)]",
    "[num{1}][str{a}][(][call(list)][str{a}][)]",
  ])("%s checks clean", (value) => {
    const text = lines("[define{f}][required{a}][required{b}]", "[set{scores}to][call(list)][num{10}][num{20}][num{30}]", `[call(print)]${value}`);
    expect(errorsOf(text)).toEqual([]);
  });

  test.each([
    "[call(range)][num{0}][num{10}][num{0}]",
    "[call(min)]",
    "[call(max)][call(list)]",
    "[call(sqrt)][num{-1}]",
    "[call(round)][num{-2.5}]",
  ])("%s is a ValueError only at run time, or none", (value) => {
    expect(errorsOf(inDefine(`[call(print)]${value}`))).toEqual([]);
  });

  test("[call(random)] takes 0 to 2 values (#119)", () => {
    expect(errorsOf(inDefine("[call(print)][call(random)][num{0}][num{1}][num{2}]"))).toEqual([
      typeError(2, "random takes 0 to 2 values"),
    ]);
  });

  test("a builtin's values are checked against what it takes", () => {
    expect(errorsOf(inDefine("[call(print)][call(len)][num{5}]"))).toEqual([typeError(2, "len takes a list or a str, not a num")]);
    expect(errorsOf(inDefine("[call(print)][call(sqrt)][str{a}]"))).toEqual([typeError(2, "sqrt takes a num, not a str")]);
    expect(errorsOf(inDefine("[call(print)][call(random)][num{0}][str{a}]"))).toEqual([typeError(2, "random takes nums, not a str")]);
    expect(errorsOf(inDefine("[call(print)][call(abs)]"))).toEqual([typeError(2, "abs takes 1 value")]);
  });

  test("a builtin's result has its type", () => {
    expect(errorsOf(inDefine("[call(print)][(][call(len)][str{a}][)][+][str{b}]"))).toEqual([
      typeError(2, "[+] takes two nums or two strs, not a num and a str"),
    ]);
    expect(errorsOf(inDefine("[call(print)][(][call(max)][num{1}][)][+][str{b}]"))).toEqual([]);
  });

  test("a local or a top-level declaration that takes a builtin's name hides it", () => {
    expect(errorsOf(inDefine("[set{pi}to][str{three}]", "[call(print)][get{pi}][+][str{a}]"))).toEqual([]);
    expect(errorsOf(lines("[define{len}]", "[define{f}]", "[call(print)][call(len)]"))).toEqual([]);
  });
});

describe("§3.3 lists and §3.4 dicts", () => {
  const scores = (...body: string[]) => inDefine("[set{scores}to][call(list)][num{10}][num{20}][num{30}]", "[set{empty}to][call(list)]", ...body);

  test.each([
    "[call(print)][get{scores}][call(getAt)][num{0}]",
    "[get{scores}][call(setAt)][num{0}][num{5}]",
    "[get{scores}][call(append)][num{40}]",
    "[call(print)][get{scores}][call(pop)]",
    "[call(print)][call(len)][get{scores}]",
  ])("%s checks clean", (line) => {
    expect(errorsOf(scores(line))).toEqual([]);
  });

  test.each([
    "[get{scores}][call(getAt)][num{3}]",
    "[get{empty}][call(pop)]",
    "[get{scores}][call(getAt)][num{0.5}]",
    "[get{scores}][call(getAt)][num{9}]",
  ])("%s is an IndexError or a ValueError only at run time", (line) => {
    expect(errorsOf(scores(line))).toEqual([]);
  });

  test("a list has no attributes", () => {
    expect(errorsOf(scores("[get{scores}][setProp{label}to][str{round_one}]"))).toEqual([attributeError(4, "list has no attributes")]);
    expect(errorsOf(scores("[call(print)][get{scores}][getProp{label}]"))).toEqual([attributeError(4, "list has no attributes")]);
  });

  test("a method is checked against what it takes", () => {
    expect(errorsOf(scores("[get{scores}][call(getAt)]"))).toEqual([typeError(4, "getAt takes 1 value")]);
    expect(errorsOf(scores("[get{scores}][call(getAt)][str{a}]"))).toEqual([typeError(4, "getAt takes a num, not a str")]);
    expect(errorsOf(scores("[get{scores}][call(setAt)][str{a}][num{1}]"))).toEqual([typeError(4, "setAt takes a num, not a str")]);
  });

  test("method names ignore case", () => {
    expect(errorsOf(scores("[get{scores}][call{GETAT}][num{0}]"))).toEqual([]);
  });

  test("a value names an object: [get{b}] is the list [get{a}] holds", () => {
    const text = inDefine("[set{a}to][call(list)]", "[set{b}to][get{a}]", "[get{b}][call(append)][num{1}]", "[call(print)][call(len)][get{a}]");
    expect(errorsOf(text)).toEqual([]);
  });

  const user = (...body: string[]) => inDefine("[set{user}to][call(dict)]", "[get{user}][setProp{message}to][str{Welcome_user!}]", ...body);

  test("a dict's attributes are set and read, and can be any type", () => {
    expect(errorsOf(user("[call(print)][get{user}][getProp{message}]", "[call(print)][get{user}][getProp{message}][+][num{1}]"))).toEqual([]);
  });

  test("[get{user}][getProp{missing}] is an AttributeError only at run time", () => {
    expect(errorsOf(user("[call(print)][get{user}][getProp{missing}]"))).toEqual([]);
  });

  test("[get{user}][call{greet}] is an AttributeError: dict has no method greet (§6.2)", () => {
    expect(errorsOf(user("[get{user}][call{greet}]"))).toEqual([attributeError(4, "dict has no method greet")]);
  });

  test("a namespace on a card is a receiver to the left: [call{user.greet}]", () => {
    expect(errorsOf(user("[call{user.greet}]"))).toEqual([attributeError(4, "dict has no method greet")]);
  });

  test("a function held in a dict is called from a name", () => {
    expect(errorsOf(user("[set{f}to][get{user}][getProp{greet}]", "[call{f}]"))).toEqual([]);
  });

  test("other types have no methods", () => {
    expect(errorsOf(inDefine("[call(print)][str{abc}][call{upper}]"))).toEqual([attributeError(2, "str has no method upper")]);
  });

  test("a module's functions and attributes check clean: what they take comes with the module", () => {
    const text = lines("[import(snapscript-p5)as(p5)]", "[define{f}]", "[call(p5.circle)][num{1}]", "[call(print)][get(p5.frameCount)][+][str{a}]");
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("§8.2 loops", () => {
  test("[repeat] takes a num", () => {
    expect(errorsOf(inDefine("[repeat][str{a}]", "[dedent]"))).toEqual([typeError(2, "[repeat] takes a num, not a str")]);
  });

  test("[repeat][num{2.5}] is a ValueError only at run time", () => {
    expect(errorsOf(inDefine("[repeat][num{2.5}]", "  [call(print)][str{hi}]", "[dedent]"))).toEqual([]);
  });

  test("[for{…}in] iterates a list: dicts are not iterable", () => {
    expect(errorsOf(inDefine("[for{k}in][call(dict)]", "[dedent]"))).toEqual([typeError(2, "[for{…}in] takes a list, not a dict")]);
  });

  test("a skipped block head skips its body, so the body's errors aren't reported", () => {
    const text = inDefine("[repeat][str{a}]", "  [call(print)][str{a}][-][num{1}]", "[dedent]");
    expect(errorsOf(text)).toEqual([typeError(2, "[repeat] takes a num, not a str")]);
    expect(check(text, []).program.skippedLines).toEqual([2, 3, 4]);
  });
});

describe("§4.3 skipping lines with type errors", () => {
  test("an [elif] with a type error is skipped with the rest of its chain, and the earlier blocks run", () => {
    const text = lines(
      "[define{f}][required{a}]",
      "[if][get{a}]",
      "  [call(print)][str{a}]",
      "[elif][str{b}][-][num{1}]",
      "  [call(print)][str{b}][-][num{1}]",
      "[else]",
      "  [call(print)][str{c}][-][num{1}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([typeError(4, "[-] takes two nums, not a str and a num")]);
    expect(check(text, []).program.skippedLines).toEqual([4, 5, 6, 7]);
  });
});

describe("§4.3 only what would certainly fail is reported", () => {
  test("a local set on some path only fails at run time, when ready is false", () => {
    const text = lines("[define{show}][required{ready}]", "[if][get{ready}]", "  [set{n}to][num{1}]", "[dedent]", "[call(print)][get{n}]");
    expect(errorsOf(text)).toEqual([]);
  });

  test("the skipping example: a call with too few values is skipped, and the rest runs", () => {
    const text = lines(
      "[extern(circle)][required(x)][required(y)][required(d)]",
      "",
      "[define{draw}]",
      "[call(circle)][num{5}][num{5}][num{2}]",
      "[call(circle)][num{5}]",
      "[call(print)][str{runs}]",
    );
    expect(errorsOf(text)).toEqual([typeError(5, "circle takes 3 values")]);
    expect(check(text, []).program.skippedLines).toEqual([5]);
  });
});

describe("demo program 1: three separate loops confetti (#109)", () => {
  const confetti = (color: string) => [
    `[call(p5.fill)][color(${color})]`,
    "[repeat][num{200}]",
    "  [set{x}to][call(random)][num{500}]",
    "  [set{y}to][call(random)][num{500}]",
    "  [call(p5.rect)][get{x}][get{y}][num{10}][num{16}]",
    "[dedent]",
  ];

  test("checks with no errors", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "",
      "[define(setup)]",
      "[call(p5.createCanvas)][num{500}][num{500}]",
      "[call(p5.background)][color(mediumblue)]",
      "[call(p5.noStroke)]",
      ...confetti("gold"),
      ...confetti("hotpink"),
      ...confetti("aquamarine"),
    );
    const { errors, program } = check(text, []);
    expect(errors).toEqual([]);
    expect(program.skippedLines).toEqual([]);
  });
});
