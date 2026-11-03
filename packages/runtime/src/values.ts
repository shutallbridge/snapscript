// The runtime's values (REFERENCE.md §3): what a program can hold, how `print` shows each, and how
// `[==]` compares them.
import type { Count, Type } from "@snapscript/core";

/** A stretch of the entry program's text, as offsets. */
export interface Span {
  start: number;
  end: number;
}

/** A `[color(…)]` value: a CSS color name. */
export class Color {
  constructor(readonly name: string) {}
  toString(): string {
    return this.name;
  }
}

/** An attribute: the name as first written, and its value. */
interface Attribute {
  text: string;
  value: Value;
}

/** A `[call(dict)]` value: attributes, by name key. */
export class Dict {
  readonly attributes: Map<string, Attribute> = new Map();
}

/** A module object: its top-level declarations, by name key. */
export class Module {
  readonly attributes: Map<string, Attribute> = new Map();
  readonly handlers: Map<string, () => Value> = new Map();
  constructor(
    /** The loader's id for the module, `null` for the entry program. */
    readonly id: string | null,
    readonly name: string,
    /** How a library error names it, `null` for the entry program. */
    readonly library: string | null,
    /** Its place in load order: positions in it are its index and a span. */
    readonly index: number,
  ) {}
}

/** A function value: a `[define{…}]`, an `[extern(…)]` or a builtin. */
export class SnapFunction {
  constructor(
    readonly name: string,
    /** How many values each way to call it takes. */
    readonly counts: readonly Count[],
    readonly impl: (...args: Value[]) => Value,
  ) {}

  /** Whether it takes `n` values. */
  takes(n: number): boolean {
    return this.counts.some((c) => (c.variadic ? n >= c.params : n === c.params));
  }
}

/** Every value a program can hold. A list is a JS array, `none` is `null`. */
export type Value = number | string | boolean | null | Color | Value[] | Dict | SnapFunction | Module;

export const isList = (v: unknown): v is Value[] => Array.isArray(v);

/** A value as `print` shows it (REFERENCE.md §9). */
export function show(value: Value, nested = false, seen: Set<object> = new Set()): string {
  if (value === null) return "none";
  if (typeof value === "string") return nested ? JSON.stringify(value) : value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Color) return value.name;
  if (value instanceof SnapFunction) return `<function ${value.name}>`;
  if (value instanceof Module) return `<module ${value.name}>`;
  if (seen.has(value)) return isList(value) ? "[...]" : "{...}";
  seen.add(value);
  const text = isList(value)
    ? `[${value.map((v) => show(v, true, seen)).join(", ")}]`
    : `{${[...value.attributes.values()].map((a) => `${a.text}: ${show(a.value, true, seen)}`).join(", ")}}`;
  seen.delete(value);
  return text;
}

export const truthy = (v: Value): boolean => !(v === null || v === false || v === 0 || v === "" || (isList(v) && v.length === 0));

export function typeName(v: Value): Type {
  if (v === null) return "none";
  if (isList(v)) return "list";
  if (v instanceof Color) return "color";
  if (v instanceof Dict) return "dict";
  if (v instanceof Module) return "module";
  if (v instanceof SnapFunction) return "function";
  return typeof v === "number" ? "num" : typeof v === "string" ? "str" : "bool";
}

/** `a num`, `none`: a type as messages name it. */
export const article = (type: Type): string => (type === "none" ? "none" : `a ${type}`);

/**
 * `[==]` (§6.3): numbers, strings, bools and colors by value, lists by their
 * items, dicts by their attributes, functions and modules by identity. Values
 * of different types are not equal.
 */
export function equal(a: Value, b: Value, seen: Map<object, object> = new Map()): boolean {
  if (a === b) return true;
  if (typeName(a) !== typeName(b)) return false;
  if (a instanceof Color) return a.name.toLowerCase() === (b as Color).name.toLowerCase();
  if (!isList(a) && !(a instanceof Dict)) return false;
  // A list that holds itself is equal where the comparison comes back round.
  if (seen.get(a) === b) return true;
  seen.set(a, b as object);
  if (isList(a)) {
    const other = b as Value[];
    return a.length === other.length && a.every((item, i) => equal(item, other[i]!, seen));
  }
  const other = (b as Dict).attributes;
  if (a.attributes.size !== other.size) return false;
  return [...a.attributes].every(([key, { value }]) => other.has(key) && equal(value, other.get(key)!.value, seen));
}
