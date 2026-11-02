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

const sig = (params: Param[], gives: Type | "any", variadic: Param | null = null): Signature => ({ params, variadic, gives });
const num = (name: string): Param => ({ name, takes: ["num"] });
const anything = (name: string): Param => ({ name, takes: "any" });

/** A builtin: a function, with each way it can be called, or a value. */
export type Builtin =
  | { name: string; type: "function"; overloads: readonly Signature[] }
  | { name: string; type: Exclude<Type, "function"> };

/** The builtins (§9), in the order the reference lists them. Each is used without a namespace. */
export const builtins: readonly Builtin[] = [
  { name: "print", type: "function", overloads: [sig([], "none", anything("values"))] },
  {
    name: "range",
    type: "function",
    overloads: [sig([num("stop")], "list"), sig([num("start"), num("stop")], "list"), sig([num("start"), num("stop"), num("step")], "list")],
  },
  { name: "len", type: "function", overloads: [sig([{ name: "value", takes: ["list", "str"] }], "num")] },
  { name: "list", type: "function", overloads: [sig([], "list", anything("items"))] },
  { name: "dict", type: "function", overloads: [sig([], "dict")] },
  { name: "abs", type: "function", overloads: [sig([num("x")], "num")] },
  // Any number of values, or one list: none at all is a ValueError at run time.
  { name: "min", type: "function", overloads: [sig([], "any", anything("values"))] },
  { name: "max", type: "function", overloads: [sig([], "any", anything("values"))] },
  { name: "round", type: "function", overloads: [sig([num("x")], "num")] },
  { name: "sqrt", type: "function", overloads: [sig([num("x")], "num")] },
  { name: "sin", type: "function", overloads: [sig([num("angle")], "num")] },
  { name: "cos", type: "function", overloads: [sig([num("angle")], "num")] },
  // Declared three times (#119): no values is 0 to 1, one is 0 to it.
  { name: "random", type: "function", overloads: [sig([], "num"), sig([num("end")], "num"), sig([num("start"), num("end")], "num")] },
  { name: "pi", type: "num" },
];

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
