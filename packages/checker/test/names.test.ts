// Names in the check stage (REFERENCE.md §2.1, §4.2, §4.3; ADR 0008).
import { describe, expect, test } from "vitest";
import { check } from "@snapscript/checker";
import { errorsOf, lines } from "./helpers.ts";

const nameError = (line: number, message: string | RegExp) => ({
  kind: "NameError",
  line,
  message: typeof message === "string" ? message : expect.stringMatching(message),
});

describe("§4.2 naming and binding", () => {
  test("a local is gone when its function returns: count is not defined", () => {
    const text = lines("[define{setup}]", "[set{count}to][num{0}]", "", "[define{draw}]", "[call(print)][get{count}]");
    expect(errorsOf(text)).toEqual([nameError(5, /^count is not defined/)]);
  });

  test("a name set nowhere is a NameError", () => {
    expect(errorsOf(lines("[define{draw}]", "[call(print)][get{count}]"))).toEqual([nameError(2, /^count is not defined/)]);
  });

  test("variables are function-scoped: n is not defined", () => {
    const text = lines("[define{a}]", "[set{n}to][num{0}]", "", "[define{b}]", "[call(print)][get{n}]");
    expect(errorsOf(text)).toEqual([nameError(5, "n is not defined")]);
  });

  test("a top-level declaration, and a function as a value", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "",
      "[define{helper}]",
      "[call(print)][str{hi}]",
      "",
      "[define{setup}]",
      "[call{helper}]",
      "[set{f}to][get{helper}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a local or a top-level declaration may take a builtin's name", () => {
    const text = lines(
      "[define{print}][required{message}]",
      "",
      "[define{draw}]",
      "[call(print)][str{hi}]",
      "[set{pi}to][num{3}]",
      "[call(print)][get(pi)]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a name the function sets anywhere is a local throughout: helper is a local of draw, not set yet", () => {
    const text = lines("[define{helper}]", "", "[define{draw}]", "[call{helper}]", "[set{helper}to][num{1}]");
    expect(errorsOf(text)).toEqual([nameError(4, "helper is a local of draw, not set yet")]);
  });

  test("a loop variable outlives its loop", () => {
    const text = lines("[define{f}]", "[for{i}in][call(range)][num{3}]", "  [call(print)][get{i}]", "[dedent]", "[call(print)][get{i}]");
    expect(errorsOf(text)).toEqual([]);
  });

  test("[set{x}to] sets the global when the file declares [global{x}]", () => {
    const text = lines(
      "[global{count}][num{0}]",
      "",
      "[define{draw}]",
      "[set{count}to][get{count}][+][num{1}]",
      "[set{n}to][num{5}]",
      "[call(print)][get{n}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("parameters, builtins and a namespace's first name resolve", () => {
    const text = lines(
      "[import(snapscript-p5)as(p5)]",
      "[define{dot}][required{x}][optional{size}]",
      "[call(p5.circle)][get{x}][get{size}][call(random)][num{5}]",
      "[call(print)][get(p5.frameCount)][get{pi}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a namespace that names nothing is a NameError", () => {
    expect(errorsOf(lines("[define{draw}]", "[call(p5.circle)][num{1}][num{2}][num{3}]"))).toEqual([
      nameError(2, /^p5 is not defined/),
    ]);
  });

  test("a value is read before its name is set", () => {
    expect(errorsOf(lines("[define{f}]", "[set{x}to][get{x}][+][num{1}]"))).toEqual([nameError(2, "x is a local of f, not set yet")]);
  });

  test("a local set on some path only fails at run time, when ready is false", () => {
    const text = lines(
      "[define{show}][required{ready}]",
      "[if][get{ready}]",
      "  [set{n}to][num{1}]",
      "[dedent]",
      "[call(print)][get{n}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a local set later in a loop's body may be set on the next pass round", () => {
    const text = lines(
      "[define{f}]",
      "[repeat][num{3}]",
      "  [call(print)][get{last}]",
      "  [set{last}to][num{1}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("a local set only in a later block of the chain is not set in an earlier one", () => {
    const text = lines(
      "[define{f}][required{a}]",
      "[if][get{a}]",
      "  [call(print)][get{n}]",
      "[else]",
      "  [set{n}to][num{1}]",
      "[dedent]",
    );
    expect(errorsOf(text)).toEqual([nameError(3, "n is a local of f, not set yet")]);
  });

  test("a handler's locals are named by its card", () => {
    expect(errorsOf(lines("[on(load)]", "[call(print)][get{x}]", "[set{x}to][num{1}]"))).toEqual([
      nameError(2, "x is a local of [on(load)], not set yet"),
    ]);
  });

  test("each name a line can't find is its own error", () => {
    const { errors } = check(lines("[define{f}]", "[call(print)][get{aaaa}][get{bbbb}]"), []);
    expect(errors.map((e) => e.message)).toEqual(["aaaa is not defined", "bbbb is not defined"]);
    expect(errors.map((e) => e.stage)).toEqual(["check", "check"]);
  });

  test("a NameError's span is the name that can't be found", () => {
    const text = lines("[define{f}]", "[call(print)][get{nowhere}]");
    const [error] = check(text, []).errors;
    expect(error.spans.map((s) => text.slice(s.start, s.end))).toEqual(["nowhere"]);
  });

  test("attributes, methods and handler events are not bare names", () => {
    const text = lines(
      "[on(load)]",
      "[set{user}to][call(dict)]",
      "[get{user}][setProp{message}to][str{hi}]",
      "[call(print)][get{user}][getProp{message}]",
      // An attribute can be any type, so calling a method of it checks clean (types.test.ts has dict's own methods).
      "[get{user}][getProp{message}][call{greet}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });
});

describe("names ignore case (ADR 0008)", () => {
  test("framecount and frameCount are the same name", () => {
    const text = lines("[define{draw}]", "[set{framecount}to][num{0}]", "[call(print)][get{frameCount}]");
    expect(errorsOf(text)).toEqual([]);
  });

  test("functions, parameters, globals, modules and builtins ignore case", () => {
    const text = lines(
      "[import(snapscript-p5)as(P5)]",
      "[global{Speed}][num{5}]",
      "[define{drawCircle}][required{Size}]",
      "[call(p5.circle)][get{size}][get{SPEED}][get{Pi}]",
      "",
      "[define{draw}]",
      "[call{drawcircle}][num{5}]",
      "[call(PRINT)][str{hi}]",
    );
    expect(errorsOf(text)).toEqual([]);
  });

  test("two declarations that differ only in case are the duplicate-declaration error", () => {
    expect(errorsOf(lines("[define{drawCircle}]", "[define{drawcircle}]"))).toEqual([
      { kind: "SyntaxError", line: 1, message: "drawCircle is declared more than once in this file" },
      { kind: "SyntaxError", line: 2, message: "drawCircle is declared more than once in this file" },
    ]);
  });

  test("messages use the spelling a local was set with first", () => {
    const text = lines("[define{Draw}]", "[call(print)][get{FRAMECOUNT}]", "[set{frameCount}to][num{0}]", "[set{framecount}to][num{1}]");
    expect(errorsOf(text)).toEqual([nameError(2, "frameCount is a local of Draw, not set yet")]);
  });

  test("a suggestion uses the declared spelling", () => {
    const text = lines("[define{draw}]", "[set{highScore}to][num{0}]", "[call(print)][get{highscores}]");
    expect(errorsOf(text)).toEqual([nameError(3, "highscores is not defined. Did you mean highScore?")]);
  });
});

describe("did you mean (§4.3, Python 3.12's rule)", () => {
  const suggestionOf = (text: string) => {
    const [error] = check(text, []).errors;
    return { message: error.message, spans: error.suggestion?.spans.map((s) => text.slice(s.start, s.end)) ?? [] };
  };

  test("scare is not defined. Did you mean score?", () => {
    const text = lines("[define{draw}]", "[set{score}to][num{0}]", "[call(print)][get{scare}]");
    expect(errorsOf(text)).toEqual([nameError(3, "scare is not defined. Did you mean score?")]);
  });

  test("the suggestion lists the spans of every declaration of the suggested name", () => {
    const text = lines("[define{draw}]", "[set{score}to][num{0}]", "[set{Score}to][num{1}]", "[call(print)][get{scare}]");
    expect(suggestionOf(text)).toEqual({ message: "scare is not defined. Did you mean score?", spans: ["score", "Score"] });
    const [error] = check(text, []).errors;
    expect(error.suggestion?.name).toBe("score");
  });

  test("a top-level suggestion lists each of its declarations", () => {
    const text = lines(
      "[extern(fill)][required(color)]",
      "[extern(fill)][required(r)][required(g)][required(b)]",
      "[define{draw}]",
      "[call{fil}][num{1}]",
    );
    expect(suggestionOf(text)).toEqual({ message: "fil is not defined. Did you mean fill?", spans: ["fill", "fill"] });
  });

  test("a builtin can be suggested, and has no declaration in the text", () => {
    // Python 3.12: print(count) in a function → "Did you mean: 'round'?"
    expect(suggestionOf(lines("[define{draw}]", "[call(print)][get{count}]"))).toEqual({
      message: "count is not defined. Did you mean round?",
      spans: [],
    });
  });

  test("the cut-off: a name of one letter is never close enough", () => {
    // Python 3.12: the distance must be less than the wrong name's length.
    expect(suggestionOf(lines("[define{f}]", "[set{m}to][num{1}]", "[call(print)][get{n}]")).message).toBe("n is not defined");
  });

  test("the cut-off: no more than about a third of the characters may change", () => {
    // Python 3.12: abcdef → abcxyz is 6 away, past (6 + 6 + 3) * 2 // 6 = 5; abcdef → abcdxy is 4 away.
    const far = lines("[define{f}]", "[set{abcxyz}to][num{1}]", "[call(print)][get{abcdef}]");
    expect(suggestionOf(far).message).toBe("abcdef is not defined");
    const near = lines("[define{f}]", "[set{abcdxy}to][num{1}]", "[call(print)][get{abcdef}]");
    expect(suggestionOf(near).message).toBe("abcdef is not defined. Did you mean abcdxy?");
  });

  test("ties go to the name defined first", () => {
    // Python 3.12: cat and cot are both 2 away from cut; the first in the list wins.
    const text = lines("[define{f}]", "[set{cot}to][num{1}]", "[set{cat}to][num{1}]", "[call(print)][get{cut}]");
    expect(suggestionOf(text).message).toBe("cut is not defined. Did you mean cot?");
  });

  test("locals come before the file's declarations, which come before builtins", () => {
    // lena, lent and len are each 2 away from lenx; locals are listed first, as in Python.
    const local = lines("[define{lent}]", "[define{f}][required{lena}]", "[call(print)][get{lenx}]");
    expect(suggestionOf(local).message).toBe("lenx is not defined. Did you mean lena?");
    const topLevel = lines("[define{lent}]", "[define{f}]", "[call(print)][get{lenx}]");
    expect(suggestionOf(topLevel).message).toBe("lenx is not defined. Did you mean lent?");
    expect(suggestionOf(lines("[define{f}]", "[call(print)][get{lenx}]")).message).toBe("lenx is not defined. Did you mean len?");
  });

  test("a closer name later beats a farther one earlier", () => {
    const text = lines("[define{f}]", "[set{scoreboard}to][num{1}]", "[set{score}to][num{1}]", "[call(print)][get{scores}]");
    expect(suggestionOf(text).message).toBe("scores is not defined. Did you mean score?");
  });

  test("only names visible at the line are suggested: a local not set yet is not", () => {
    const text = lines("[define{f}]", "[call(print)][get{scare}]", "[set{score}to][num{0}]");
    expect(suggestionOf(text).message).toBe("scare is not defined");
  });

  test("a name longer than 40 letters gets no suggestion", () => {
    const long = "a".repeat(41);
    const text = lines("[define{f}]", `[set{${long}b}to][num{1}]`, `[call(print)][get{${long}}]`);
    expect(suggestionOf(text).message).toBe(`${long} is not defined`);
  });
});
