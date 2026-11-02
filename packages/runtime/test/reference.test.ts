// Every REFERENCE.md example marked runtime-only, or showing a result, through
// the run-a-program seam (#186). The checker's reference.test.ts and
// types.test.ts hold the check half of the same examples. A value the checker
// would type is passed in through a parameter, which it knows nothing about,
// so its error is found at run time.
import { describe, expect, test } from "vitest";
import { lines, runProgram } from "./helpers.ts";

/** A program whose `[on(load)]` runs these lines. */
const onLoad = (...body: string[]): string => lines("[on(load)]", ...body);

/** What `[call(print)]` shows for a value, with lines run before it. */
async function shown(value: string, ...before: string[]): Promise<string> {
  const seen = await runProgram(onLoad(...before, `[call(print)]${value}`));
  expect(seen.checkErrors).toEqual([]);
  expect(seen.errors).toEqual([]);
  return seen.prints.map((p) => p.text).join("\n");
}

/** The one error a clean program meets when it runs. */
async function errorOf(text: string) {
  const seen = await runProgram(text);
  expect(seen.checkErrors).toEqual([]);
  expect(seen.errors).toHaveLength(1);
  return seen.errors[0]!;
}

/** A function `f` of `a` and `b` that runs `body`, called with `values`: the checker can't type `a` and `b`. */
const withValues = (body: string, ...values: string[]): string =>
  lines("[define{f}][required{a}][optional{b}]", body, "", "[on(load)]", `[call{f}]${values.join("")}`);

const scores = "[set{scores}to][call(list)][num{10}][num{20}][num{30}]";
const empty = "[set{empty}to][call(list)]";

describe("§3.1 objects", () => {
  test("a name holds a reference: [get{b}] is the list [get{a}] holds", async () => {
    expect(await shown("[call(len)][get{a}]", "[set{a}to][call(list)]", "[set{b}to][get{a}]", "[get{b}][call(append)][num{1}]")).toBe("1");
  });
});

describe("§6.3 operators", () => {
  test.each([
    ["[num{2}][+][num{3}][*][num{4}]", "14"],
    ["[num{10}][-][num{3}][-][num{2}]", "5"],
    ["[str{ab}][+][str{cd}]", "abcd"],
    ["[num{-1}][%][num{500}]", "499"],
    ["[num{7}][%][num{-3}]", "-2"],
    ["[num{1}][==][str{1}]", "false"],
    ["[str{a}][<][str{b}]", "true"],
    ["[(][num{2}][+][num{3}][)][*][num{4}]", "20"],
  ])("%s gives %s", async (value, result) => {
    expect(await shown(value)).toBe(result);
  });

  test("[str{score}][+][num{5}] is a TypeError, at its operator card", async () => {
    expect(await errorOf(withValues("[call(print)][get{a}][+][get{b}]", "[str{score}]", "[num{5}]"))).toEqual({
      type: "runtime",
      kind: "TypeError",
      message: "[+] takes two nums or two strs, not a str and a num",
      at: { line: 2, card: "[+]" },
    });
  });

  test.each([
    ["[-]", "[str{a}]", "[num{1}]", "[-] takes two nums, not a str and a num"],
    ["[<]", "[color(gold)]", "[num{2}]", "[<] takes two nums or two strs, not a color and a num"],
    ["[*]", "[bool(true)]", "[num{2}]", "[*] takes two nums, not a bool and a num"],
  ])("%s with %s and %s is a TypeError", async (op, a, b, message) => {
    const error = await errorOf(withValues(`[call(print)][get{a}]${op}[get{b}]`, a, b));
    expect([error.kind, error.message]).toEqual(["TypeError", message]);
  });

  test.each(["[/]", "[%]"])("[num{1}]%s[num{0}] is a ZeroDivisionError, at its operator card", async (op) => {
    const error = await errorOf(onLoad(`[call(print)][num{1}]${op}[num{0}]`));
    expect([error.type, error.kind, error.at]).toEqual(["runtime", "ZeroDivisionError", { line: 2, card: op }]);
  });
});

describe("§6.3 [==] compares by value, and identity for functions and modules", () => {
  test.each([
    ["[num{1}][==][num{1}]", "true"],
    ["[str{a}][==][str{a}]", "true"],
    ["[color(gold)][==][color(gold)]", "true"],
    ["[color(gold)][==][color(tomato)]", "false"],
    ["[(][call(list)][num{1}][num{2}][)][==][(][call(list)][num{1}][num{2}][)]", "true"],
    ["[(][call(list)][num{1}][num{2}][)][==][(][call(list)][num{1}][)]", "false"],
    ["[(][call(list)][num{1}][)][!=][(][call(list)][str{1}][)]", "true"],
    ["[(][call(list)][(][call(list)][num{1}][)][)][==][(][call(list)][(][call(list)][num{1}][)][)]", "true"],
    ["[num{1}][==][bool(true)]", "false"],
    ["[num{0}][==][none]", "false"],
    ["[none][==][none]", "true"],
    ["[root][==][root]", "true"],
  ])("%s gives %s", async (value, result) => {
    expect(await shown(value)).toBe(result);
  });

  test("dicts are equal when their attributes are, names ignoring case", async () => {
    const before = [
      "[set{a}to][call(dict)]",
      "[get{a}][setProp{name}to][str{Ada}]",
      "[set{b}to][call(dict)]",
      "[get{b}][setProp{NAME}to][str{Ada}]",
      "[set{c}to][call(dict)]",
    ];
    expect(await shown("[get{a}][==][get{b}][get{a}][==][get{c}]", ...before)).toBe("true false");
  });

  test("functions are equal only to themselves", async () => {
    const text = lines("[define{f}]", "", "[define{g}]", "", "[on(load)]", "[call(print)][get{f}][==][get{f}][get{f}][==][get{g}]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["true false"]);
  });
});

describe("§6.3 what counts as true", () => {
  test.each([
    ["[num{0}]", "no"],
    ["[str{}]", "no"],
    ["[call(list)]", "no"],
    ["[none]", "no"],
    ["[bool(false)]", "no"],
    ["[num{0.5}]", "yes"],
    ["[str{0}]", "yes"],
    ["[call(list)][num{0}]", "yes"],
    ["[call(dict)]", "yes"],
    ["[color(gold)]", "yes"],
  ])("[if]%s runs its body: %s", async (value, ran) => {
    const text = withValues("[if][get{a}]\n  [call(print)][str{yes}]\n[else]\n  [call(print)][str{no}]\n[dedent]", `[(]${value}[)]`);
    const seen = await runProgram(text);
    expect(seen.errors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual([ran]);
  });

  test("[not] gives a bool", async () => {
    expect(await shown("[not][num{0}][not][str{a}]")).toBe("true false");
    expect(await shown("[not][num{2}][>][num{1}]")).toBe("false");
  });
});

describe("§3.3 lists", () => {
  test.each([
    ["[get{scores}][call(getAt)][num{0}]", "10"],
    ["[get{scores}][call(getAt)][num{-1}]", "30"],
    ["[get{scores}][call(getAt)][num{-3}]", "10"],
    ["[get{scores}][call(pop)]", "30"],
    ["[call(len)][get{scores}]", "3"],
  ])("%s gives %s", async (value, result) => {
    expect(await shown(value, scores)).toBe(result);
  });

  test("setAt and append give none, and change the list", async () => {
    const before = [scores, "[call(print)][get{scores}][call(setAt)][num{0}][num{5}]", "[call(print)][get{scores}][call(append)][num{40}]"];
    expect(await shown("[get{scores}]", ...before)).toBe("none\nnone\n[5, 20, 30, 40]");
  });

  test("setAt counts a negative position from the end", async () => {
    expect(await shown("[get{scores}]", scores, "[get{scores}][call(setAt)][num{-1}][num{5}]")).toBe("[10, 20, 5]");
  });

  test.each([
    [scores, "[get{scores}][call(getAt)][num{3}]", "IndexError"],
    [scores, "[get{scores}][call(getAt)][num{9}]", "IndexError"],
    [scores, "[get{scores}][call(getAt)][num{-4}]", "IndexError"],
    [scores, "[get{scores}][call(setAt)][num{3}][num{1}]", "IndexError"],
    [empty, "[get{empty}][call(pop)]", "IndexError"],
    [scores, "[get{scores}][call(getAt)][num{0.5}]", "ValueError"],
  ])("%s then %s is a %s, at its card", async (before, line, kind) => {
    const error = await errorOf(onLoad(before, line));
    expect([error.type, error.kind, error.at?.line]).toEqual(["runtime", kind, 3]);
    expect(error.at?.card).toMatch(/^\[call\((getAt|setAt|pop)\)\]$/);
  });

  test("a list's method checks what it takes at run time", async () => {
    const error = await errorOf(withValues("[call(print)][get{a}][call(getAt)][get{b}]", "[(][call(list)][num{1}][)]", "[str{a}]"));
    expect([error.kind, error.message]).toEqual(["TypeError", "getAt takes a num, not a str"]);
  });

  test("[for{s}in] goes through a list", async () => {
    const text = onLoad(scores, "[for{s}in][get{scores}]", "  [call(print)][get{s}]", "[dedent]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["10", "20", "30"]);
  });
});

describe("§3.4 dicts", () => {
  const user = ["[set{user}to][call(dict)]", "[get{user}][setProp{message}to][str{Welcome_user!}]"];

  test("an attribute is set and read", async () => {
    expect(await shown("[get{user}][getProp{message}]", ...user)).toBe("Welcome user!");
  });

  test("[get{user}][getProp{missing}] is an AttributeError", async () => {
    const error = await errorOf(onLoad(...user, "[call(print)][get{user}][getProp{missing}]"));
    expect([error.type, error.kind, error.at?.line]).toEqual(["runtime", "AttributeError", 4]);
  });

  test("attributes chain", async () => {
    const before = ["[set{app}to][call(dict)]", ...user.map((l) => l.replace("[set{user}to]", "[set{user}to]")), "[get{app}][setProp{user}to][get{user}]"];
    expect(await shown("[get{app}][getProp{user}][getProp{message}]", ...before)).toBe("Welcome user!");
  });
});

describe("§4.2 naming and binding", () => {
  test("a local that takes a builtin's name hides it", async () => {
    expect(await shown("[get{pi}]", "[set{pi}to][num{3}]")).toBe("3");
  });

  test("a local set on some path is a NameError at run time, when ready is false", async () => {
    const text = lines(
      "[define{show}][required{ready}]",
      "[if][get{ready}]",
      "  [set{n}to][num{1}]",
      "[dedent]",
      "[call(print)][get{n}]",
      "",
      "[on(load)]",
      "[call{show}][bool(true)]",
      "[call{show}][bool(false)]",
    );
    const seen = await runProgram(text);
    expect(seen.checkErrors).toEqual([]);
    expect(seen.prints.map((p) => p.text)).toEqual(["1"]);
    expect(seen.errors.map((e) => [e.kind, e.message])).toEqual([["NameError", "n is a local of show, not set yet"]]);
  });
});

describe("§8.2 loops", () => {
  test("[repeat][num{2.5}] is a ValueError, at its value", async () => {
    const error = await errorOf(onLoad("[repeat][num{2.5}]", "  [call(print)][str{hi}]", "[dedent]"));
    expect([error.type, error.kind, error.at]).toEqual(["runtime", "ValueError", { line: 2, card: "[num{2.5}]" }]);
  });

  test("[repeat] takes a num at run time", async () => {
    const error = await errorOf(withValues("[repeat][get{a}]\n[dedent]", "[str{3}]"));
    expect([error.kind, error.message, error.at]).toEqual(["TypeError", "[repeat] takes a num, not a str", { line: 2, card: "[get{a}]" }]);
  });

  test("[for{…}in] takes a list at run time: dicts are not iterable", async () => {
    const error = await errorOf(withValues("[for{k}in][get{a}]\n[dedent]", "[call(dict)]"));
    expect([error.kind, error.message, error.at]).toEqual(["TypeError", "[for{…}in] takes a list, not a dict", { line: 2, card: "[get{a}]" }]);
  });
});

describe("§9 builtins", () => {
  test.each([
    ["[call(range)][num{10}]", "[0, 1, 2, 3, 4, 5, 6, 7, 8, 9]"],
    ["[call(range)][num{0}][num{500}][num{25}]", "[0, 25, 50, 75, 100, 125, 150, 175, 200, 225, 250, 275, 300, 325, 350, 375, 400, 425, 450, 475]"],
    ["[call(range)][num{5}][num{0}][num{-2}]", "[5, 3, 1]"],
    ["[call(range)][num{2}][num{5}]", "[2, 3, 4]"],
    ["[call(len)][get{scores}]", "3"],
    ["[call(len)][str{hello}]", "5"],
    ["[call(list)][num{1}][num{2}]", "[1, 2]"],
    ["[call(dict)]", "{}"],
    ["[call(abs)][num{-5}]", "5"],
    ["[call(min)][num{3}][num{1}][num{2}]", "1"],
    ["[call(max)][get{scores}]", "30"],
    ["[call(min)][str{b}][str{a}]", "a"],
    ["[call(round)][num{2.5}]", "3"],
    ["[call(round)][num{2.4}]", "2"],
    ["[call(round)][num{-2.5}]", "-3"],
    ["[call(round)][num{-0.4}]", "0"],
    ["[call(sqrt)][num{16}]", "4"],
    ["[call(sin)][num{90}]", "1"],
    ["[call(cos)][num{180}]", "-1"],
    ["[call(sin)][num{30}]", "0.5"],
    ["[call(sin)][num{180}]", "0"],
    ["[call(cos)][num{90}]", "0"],
    ["[call(cos)][num{-60}]", "0.5"],
    ["[call(sin)][num{405}]", String(Math.sin(Math.PI / 4))],
    ["[get(pi)]", "3.141592653589793"],
  ])("%s gives %s", async (value, result) => {
    expect(await shown(value, scores)).toBe(result);
  });

  test.each([
    ["[call(range)][num{0}][num{10}][num{0}]", "ValueError"],
    ["[call(range)][num{2.5}]", "ValueError"],
    ["[call(min)]", "ValueError"],
    ["[call(max)][call(list)]", "ValueError"],
    ["[call(sqrt)][num{-1}]", "ValueError"],
  ])("%s is a %s, at its card", async (value, kind) => {
    const error = await errorOf(onLoad(`[call(print)]${value}`));
    expect([error.type, error.kind, error.at]).toEqual(["runtime", kind, { line: 2, card: value.slice(0, value.indexOf("]") + 1) }]);
  });

  test("[call(min)] of a num and a str is a TypeError", async () => {
    const error = await errorOf(withValues("[call(print)][call(min)][get{a}][get{b}]", "[num{1}]", "[str{a}]"));
    expect([error.kind, error.message]).toEqual(["TypeError", "min can't compare a num and a str"]);
  });

  test("a builtin checks what it takes at run time", async () => {
    const sqrt = await errorOf(withValues("[call(print)][call(sqrt)][get{a}]", "[str{a}]"));
    expect([sqrt.kind, sqrt.message, sqrt.at]).toEqual(["TypeError", "sqrt takes a num, not a str", { line: 2, card: "[call(sqrt)]" }]);
    const len = await errorOf(withValues("[call(print)][call(len)][get{a}]", "[num{5}]"));
    expect([len.kind, len.message]).toEqual(["TypeError", "len takes a list or a str, not a num"]);
    const random = await errorOf(withValues("[call(print)][call(random)][num{0}][get{a}]", "[str{a}]"));
    expect([random.kind, random.message]).toEqual(["TypeError", "random takes nums, not a str"]);
  });
});

describe("§9 random: chosen by the number of values", () => {
  /** Many draws of one `[call(random)]…`. */
  async function draws(values: string): Promise<number[]> {
    const text = onLoad("[repeat][num{200}]", `  [call(print)][call(random)]${values}`, "[dedent]");
    const seen = await runProgram(text);
    expect(seen.checkErrors).toEqual([]);
    expect(seen.errors).toEqual([]);
    return seen.prints.map((p) => Number(p.text));
  }

  test.each([
    ["", 0, 1],
    ["[num{500}]", 0, 500],
    ["[num{0}][num{500}]", 0, 500],
    ["[num{2.5}]", 0, 2.5],
  ])("[call(random)]%s gives nums from %d up to, not including, %d, different across calls", async (values, low, high) => {
    const all = await draws(values);
    expect(all.every((n) => n >= low && n < high)).toBe(true);
    expect(new Set(all).size).toBeGreaterThan(150);
    expect(all.some((n) => !Number.isInteger(n))).toBe(true);
  });

  test.each([
    ["[num{-5}]", -5],
    ["[num{500}][num{0}]", 0],
  ])("[call(random)]%s counts down: the first end can come out, %d never does", async (values, never) => {
    const all = await draws(values);
    const [low, high] = values === "[num{-5}]" ? [-5, 0] : [0, 500];
    expect(all.every((n) => n > low! - 1e-9 && n <= high! && n !== never)).toBe(true);
  });
});

describe("§2.1 names ignore case (ADR 0008)", () => {
  test("a builtin, a parameter and an attribute, written in any case", async () => {
    const text = lines(
      "[define{drawCircle}][required{Size}]",
      "[call(PRINT)][get{size}][get{Pi}][(][call{Round}][num{2.5}][)]",
      "",
      "[on(load)]",
      "[set{user}to][call(dict)]",
      "[get{user}][setProp{Name}to][str{Ada}]",
      "[call{DRAWCIRCLE}][get{user}][getProp{NAME}]",
    );
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["Ada 3.141592653589793 3"]);
  });
});

describe("§2.1 handwriting", () => {
  test("gaps are ignored and _ is a space", async () => {
    expect(await shown("[str{hello_world}][str{hello world}][str{__hi}][str{}][num{1 000}]")).toBe("hello world helloworld   hi  1000");
  });
});

describe("§6.1 value slots: a card grabs values to its right, and a group ends every grab", () => {
  const program = (...body: string[]) =>
    lines(
      "[define{f}][required{x}][required{y}]",
      "[return][get{x}][+][get{y}]",
      "",
      "[define{g}][required{x}]",
      "[return][get{x}][*][num{10}]",
      "",
      "[define{h}][required{x}]",
      "[return][get{x}][+][num{1}]",
      "",
      "[on(load)]",
      ...body,
    );

  test("[call{f}][(][call{g}][call{h}][num{1}][)][num{2}] is f(g(h(1)), 2)", async () => {
    const seen = await runProgram(program("[call(print)][call{f}][(][call{g}][call{h}][num{1}][)][num{2}]"));
    expect(seen.prints.map((p) => p.text)).toEqual(["22"]);
  });

  test("[call(print)][(][call{random}][)][num{0}][num{5}] is print(random(), 0, 5)", async () => {
    const [shownText] = (await runProgram(onLoad("[call(print)][(][call{random}][)][num{0}][num{5}]"))).prints.map((p) => p.text);
    expect(shownText).toMatch(/^0\.\d+ 0 5$/);
  });

  test("[call(print)][call{random}][+][num{5}] is print(random() + 5)", async () => {
    const value = Number(await shown("[call{random}][+][num{5}]"));
    expect(value >= 5 && value < 6).toBe(true);
  });

  test("[if][(][call(len)][get{a}][)][>][num{5}] is if len(a) > 5", async () => {
    const text = onLoad("[set{a}to][str{abcdef}]", "[if][(][call(len)][get{a}][)][>][num{5}]", "  [call(print)][str{long}]", "[dedent]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["long"]);
  });
});

describe("§8 blocks", () => {
  test("a block's body may be empty", async () => {
    const text = onLoad("[if][bool(true)]", "[dedent]", "[repeat][num{2}]", "[dedent]", "[call(print)][str{done}]");
    expect((await runProgram(text)).prints.map((p) => p.text)).toEqual(["done"]);
  });
});
