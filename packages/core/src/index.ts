// The shared rules table: types, which operators and methods each type has,
// the builtins and what they take, and the error kinds with their stages.
// It knows nothing of the table or of text. The checker and the runtime both
// read it, so the two can't disagree.

/** When an error is found (REFERENCE.md §4.3). */
export type Stage = "structure" | "check" | "runtime";

/** What went wrong, named as in Python. */
export type ErrorKind =
  | "SyntaxError"
  | "IndentationError"
  | "NameError"
  | "TypeError"
  | "AttributeError"
  | "ImportError"
  | "IndexError"
  | "ValueError"
  | "ZeroDivisionError"
  | "RecursionError";

/** The stages each kind can be found at, earliest first. */
export const stagesOfKind: Readonly<Record<ErrorKind, readonly Stage[]>> = {
  SyntaxError: ["structure"],
  IndentationError: ["structure"],
  NameError: ["check", "runtime"],
  TypeError: ["check", "runtime"],
  AttributeError: ["check", "runtime"],
  ImportError: ["check", "runtime"],
  IndexError: ["runtime"],
  ValueError: ["runtime"],
  ZeroDivisionError: ["runtime"],
  RecursionError: ["runtime"],
};

/** The earliest stage a kind can be found at: where a stage that finds it reports it. */
export const firstStage = (kind: ErrorKind): Stage => stagesOfKind[kind][0]!;

/** The types (§3.2). */
export type Type = "num" | "str" | "bool" | "color" | "none" | "list" | "dict" | "function" | "module";

/** Every type, in the order the reference lists them. */
export const types: readonly Type[] = ["num", "str", "bool", "color", "none", "list", "dict", "function", "module"];

/** What a slot takes: some types, or any value. */
export type Takes = readonly Type[] | "any";

/** The type each leaf card gives (§2, §3.2). `[root]` is the module object of the file the program runs. */
export const leafTypes: Readonly<Record<string, Type>> = {
  num: "num",
  str: "str",
  bool: "bool",
  color: "color",
  none: "none",
  root: "module",
};

/** The two-value operator cards (§6.3). */
export type Operator = "+" | "-" | "*" | "/" | "%" | "<" | ">" | "<=" | ">=" | "==" | "!=" | "and" | "or";

/**
 * One pair of values an operator takes, and what it gives for them. `either`
 * gives one of its two values: `[and]` and `[or]` give the value that decided.
 */
export interface OperatorRule {
  left: Type | "any";
  right: Type | "any";
  gives: Type | "either";
}

const numbers: OperatorRule[] = [{ left: "num", right: "num", gives: "num" }];
const ordered: OperatorRule[] = [
  { left: "num", right: "num", gives: "bool" },
  { left: "str", right: "str", gives: "bool" },
];
const anyTwo = (gives: Type | "either"): OperatorRule[] => [{ left: "any", right: "any", gives }];

/** What each operator takes (§6.3). A pair matching no rule is a `TypeError`. */
export const operators: Readonly<Record<Operator, readonly OperatorRule[]>> = {
  "+": [
    { left: "num", right: "num", gives: "num" },
    { left: "str", right: "str", gives: "str" },
  ],
  "-": numbers,
  "*": numbers,
  "/": numbers,
  "%": numbers,
  "<": ordered,
  ">": ordered,
  "<=": ordered,
  ">=": ordered,
  "==": anyTwo("bool"),
  "!=": anyTwo("bool"),
  and: anyTwo("either"),
  or: anyTwo("either"),
};

/** `[not]` takes any value and gives a `bool`. */
export const notGives: Type = "bool";

/** A value a function takes. */
export interface Param {
  name: string;
  takes: Takes;
}

/** One way to call a function: its values in order, and what it gives. */
export interface Signature {
  params: readonly Param[];
  /** A slot that takes any number of values, after `params`. */
  variadic: Param | null;
  gives: Type | "any";
}

/** How many values one way to call a function takes: `params`, or at least that many when `variadic`. */
export interface Count {
  params: number;
  variadic: boolean;
}

/** A function's counts, for messages: `no values`, `1 value`, `3 values`, `1 to 3 values`, `1 or 3 values`, `at least 2 values`. */
export function describeCounts(counts: readonly Count[]): string {
  const variadic = counts.filter((c) => c.variadic).map((c) => c.params);
  if (variadic.length > 0) {
    const least = Math.min(...variadic);
    return least === 0 ? "any number of values" : `at least ${least} value${least === 1 ? "" : "s"}`;
  }
  const sorted = [...new Set(counts.map((c) => c.params))].sort((a, b) => a - b);
  const plural = (n: number) => (n === 1 ? "value" : "values");
  const first = sorted[0]!;
  const last = sorted[sorted.length - 1]!;
  if (sorted.length === 1) return first === 0 ? "no values" : `${first} ${plural(first)}`;
  if (last - first === sorted.length - 1) return `${first} to ${last} values`;
  return `${sorted.slice(0, -1).join(", ")} or ${last} values`;
}

/** A signature's count. */
export const countOf = (s: Signature): Count => ({ params: s.params.length, variadic: s.variadic !== null });

const sig = (params: Param[], gives: Type | "any", variadic: Param | null = null): Signature => ({ params, variadic, gives });
const num = (name: string): Param => ({ name, takes: ["num"] });
const anything = (name: string): Param => ({ name, takes: "any" });

/** A function card's colour, printed on its stripe (#156): violet, fuchsia, sky and rose. */
export type FunctionColor = "primary" | "secondary" | "helper" | "setting";

/**
 * What the help corner shows for a card (#156): one sentence of at most about 80 letters, then
 * one line per value, in the order the cards sit, of at most about 40 letters. No types.
 */
export interface Help {
  sentence: string;
  values: readonly { name: string; about: string }[];
}

/** A builtin: a function, with each way it can be called, or a value. Every builtin is helper. */
export type Builtin = { name: string; help: Help; color: FunctionColor } & (
  | { type: "function"; overloads: readonly Signature[] }
  | { type: Exclude<Type, "function"> }
);

/** A builtin as written below: each is coloured helper after. */
type Entry = Builtin extends infer B ? (B extends Builtin ? Omit<B, "color"> : never) : never;

const help = (sentence: string, ...values: [name: string, about: string][]): Help => ({
  sentence,
  values: values.map(([name, about]) => ({ name, about })),
});

const entries: readonly Entry[] = [
  {
    name: "print",
    type: "function",
    overloads: [sig([], "none", anything("values"))],
    help: help("Shows its values beside its line, with a space between them.", ["values", "the values to show"]),
  },
  {
    name: "range",
    type: "function",
    overloads: [sig([num("stop")], "list"), sig([num("start"), num("stop")], "list"), sig([num("start"), num("stop"), num("step")], "list")],
    help: help(
      "Gives a list of whole numbers from start up to, not including, stop.",
      ["start", "the first number (0 if left out)"],
      ["stop", "where it stops, never reached"],
      ["step", "how much each one grows (1 if left out)"],
    ),
  },
  {
    name: "len",
    type: "function",
    overloads: [sig([{ name: "value", takes: ["list", "str"] }], "num")],
    help: help("Counts the items in a list, or the letters in a str.", ["value", "the list or str to count"]),
  },
  {
    name: "list",
    type: "function",
    overloads: [sig([], "list", anything("items"))],
    help: help("Makes a list holding its values, in order.", ["items", "the items, first to last"]),
  },
  { name: "dict", type: "function", overloads: [sig([], "dict")], help: help("Makes an empty dict. Takes no values.") },
  {
    name: "abs",
    type: "function",
    overloads: [sig([num("x")], "num")],
    help: help("Gives a number without its minus sign.", ["x", "the number"]),
  },
  // Any number of values, or one list: none at all is a ValueError at run time.
  {
    name: "min",
    type: "function",
    overloads: [sig([], "any", anything("values"))],
    help: help("Gives the smallest of its values, or of the items in one list.", ["values", "the values, or one list"]),
  },
  {
    name: "max",
    type: "function",
    overloads: [sig([], "any", anything("values"))],
    help: help("Gives the largest of its values, or of the items in one list.", ["values", "the values, or one list"]),
  },
  {
    name: "round",
    type: "function",
    overloads: [sig([num("x")], "num")],
    help: help("Rounds a number to a whole number. A half rounds away from zero.", ["x", "the number to round"]),
  },
  {
    name: "sqrt",
    type: "function",
    overloads: [sig([num("x")], "num")],
    help: help("Gives the square root of a number.", ["x", "the number, not below 0"]),
  },
  {
    name: "sin",
    type: "function",
    overloads: [sig([num("angle")], "num")],
    help: help("Gives the sine of an angle.", ["angle", "the angle, in degrees"]),
  },
  {
    name: "cos",
    type: "function",
    overloads: [sig([num("angle")], "num")],
    help: help("Gives the cosine of an angle.", ["angle", "the angle, in degrees"]),
  },
  // Declared three times (#119): no values is 0 to 1, one is 0 to it.
  {
    name: "random",
    type: "function",
    overloads: [sig([], "num"), sig([num("end")], "num"), sig([num("start"), num("end")], "num")],
    help: help(
      "Gives a new random number each time, from start up to, not including, end.",
      ["start", "the lowest it can be (0 if left out)"],
      ["end", "where it stops, never reached"],
    ),
  },
  { name: "pi", type: "num", help: help("The number pi, 3.14159…, for working with circles.") },
];

/** The builtins (§9), in the order the reference lists them. Each is used without a namespace. */
export const builtins: readonly Builtin[] = entries.map((b): Builtin => ({ ...b, color: "helper" }));

/** The builtins' names, in the order the reference lists them. "Did you mean" ties go to the earlier one. */
export const builtinNames: readonly string[] = builtins.map((b) => b.name);

/** The methods of each type, called with `[call(…)]` after a value of it (§3.3, §6.2). A type not listed has none. */
export const methods: Readonly<Partial<Record<Type, Readonly<Record<string, readonly Signature[]>>>>> = {
  list: {
    getAt: [sig([num("position")], "any")],
    setAt: [sig([num("position"), anything("item")], "none")],
    append: [sig([anything("item")], "none")],
    pop: [sig([], "any")],
  },
};

/** The types that have attributes (§3.4): `[getProp{…}]` and `[setProp{…}to]` act only on these. */
export const typesWithAttributes: readonly Type[] = ["dict", "module"];

/** What `[repeat]` takes (§8.2): a whole number, which only the runtime can tell. */
export const repeatTakes: readonly Type[] = ["num"];

/** What `[for{…}in]` takes (§8.2): a list. Dicts are not iterable. */
export const forTakes: readonly Type[] = ["list"];

export { lineColumnAt, offsetAt, type LineColumn } from "./position.ts";
export {
  languageMarkers,
  tableMarkers,
  type LanguageMarker,
  type LanguageMarkers,
  type TableMarkers,
} from "./markers.ts";
