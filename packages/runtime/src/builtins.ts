// The builtins (REFERENCE.md §9) and a list's methods (§3.3): each checks its values against core's
// table, as the checker does for the values whose types it knows, then runs.
import { builtins, countOf, methods, type Signature, type Takes } from "@snapscript/core";
import { SnapScriptError } from "./errors.ts";
import { article, Dict, isList, show, SnapFunction, typeName, type Value } from "./values.ts";

/** What a function's values must be, said as the checker says it: `a num`, `a list or a str`, `nums`. */
function describeTakes(overloads: readonly Signature[], takes: Takes): string {
  const text = (t: Takes): string => (t === "any" ? "any value" : t.map(article).join(" or "));
  const params = overloads.flatMap((s) => [...s.params, ...(s.variadic ? [s.variadic] : [])]);
  const many = overloads.some((s) => s.params.length > 1 || s.variadic !== null);
  const same = params.every((p) => text(p.takes) === text(takes));
  return many && same && takes !== "any" && takes.length === 1 && takes[0] !== "none" ? `${takes[0]}s` : text(takes);
}

/**
 * A builtin or a method: checks its values against core's table, as the
 * checker does for the values whose types it knows, then runs it.
 */
function checked(name: string, overloads: readonly Signature[], impl: (...args: Value[]) => Value): SnapFunction {
  return new SnapFunction(name, overloads.map(countOf), (...args) => {
    const signature = overloads.find((s) => s.params.length === args.length || (s.variadic !== null && args.length >= s.params.length))!;
    args.forEach((arg, i) => {
      const takes = (signature.params[i] ?? signature.variadic)!.takes;
      if (takes !== "any" && !takes.includes(typeName(arg))) {
        throw new SnapScriptError("TypeError", `${name} takes ${describeTakes(overloads, takes)}, not ${article(typeName(arg))}`);
      }
    });
    return impl(...args);
  });
}

/** A list position (§3.3): a whole number, a negative one counting from the end. */
function position(list: Value[], name: string, i: Value): number {
  const at = i as number;
  if (!Number.isInteger(at)) throw new SnapScriptError("ValueError", `${name} takes a whole number, not ${show(at)}`);
  const index = at < 0 ? list.length + at : at;
  if (index < 0 || index >= list.length) {
    throw new SnapScriptError("IndexError", `${name} position ${show(at)} is outside a list of ${list.length} item${list.length === 1 ? "" : "s"}`);
  }
  return index;
}

const listImpls: Readonly<Record<string, (list: Value[], ...args: Value[]) => Value>> = {
  getAt: (list, i) => list[position(list, "getAt", i!)]!,
  setAt: (list, i, item) => {
    list[position(list, "setAt", i!)] = item!;
    return null;
  },
  append: (list, item) => {
    list.push(item!);
    return null;
  },
  pop: (list) => {
    if (list.length === 0) throw new SnapScriptError("IndexError", "pop from an empty list");
    return list.pop()!;
  },
};

/** A list's methods (§3.3), by name key: each makes the method of one list. */
export const listMethods: ReadonlyMap<string, (list: Value[]) => SnapFunction> = new Map(
  Object.entries(methods.list!).map(([name, overloads]) => [
    name.toLowerCase(),
    (list: Value[]): SnapFunction => checked(name, overloads, (...args) => listImpls[name]!(list, ...args)),
  ]),
);

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** The sines that are whole or a half, exact, by the angle in degrees from 0 up to 360. */
const exactSines: ReadonlyMap<number, number> = new Map([
  [0, 0],
  [30, 0.5],
  [90, 1],
  [150, 0.5],
  [180, 0],
  [210, -0.5],
  [270, -1],
  [330, -0.5],
]);

/** The sine of an angle in degrees (ADR 0007): `[call(sin)][num{30}]` is 0.5, not 0.49999999999999994. */
function sine(degrees: number): number {
  const angle = ((degrees % 360) + 360) % 360;
  return exactSines.get(angle) ?? Math.sin(radians(angle));
}

/** The smallest or the largest of a builtin's values, or of one list's items. */
function extreme(name: string, values: Value[], larger: boolean): Value {
  const all = values.length === 1 && isList(values[0]) ? values[0] : values;
  if (all.length === 0) {
    throw new SnapScriptError("ValueError", values.length === 0 ? `${name} takes at least one value` : `${name} of an empty list`);
  }
  const first = typeName(all[0]!);
  for (const v of all) {
    const type = typeName(v);
    if (type !== first || (type !== "num" && type !== "str")) {
      throw new SnapScriptError("TypeError", `${name} can't compare ${article(first)} and ${article(type)}`);
    }
  }
  let best = all[0] as number | string;
  for (const v of all as (number | string)[]) if (larger ? v > best : v < best) best = v;
  return best;
}

const whole = (name: string, values: Value[]): void => {
  for (const v of values) if (!Number.isInteger(v)) throw new SnapScriptError("ValueError", `${name} takes whole numbers, not ${show(v)}`);
};

/** The builtins' values (REFERENCE.md §9), by name key. Each takes what core's table says. */
export function builtinValues(print: (line: string) => void): Map<string, Value> {
  const impls: Record<string, (...args: Value[]) => Value> = {
    print: (...values) => {
      print(values.map((v) => show(v)).join(" "));
      return null;
    },
    range: (...a) => {
      whole("range", a);
      const [start, stop, step] = (a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1]) as number[];
      if (step === 0) throw new SnapScriptError("ValueError", "range's step can't be 0");
      const out: number[] = [];
      for (let i = start!; step! > 0 ? i < stop! : i > stop!; i += step!) out.push(i);
      return out;
    },
    len: (v) => (v as string | Value[]).length,
    list: (...items) => items,
    dict: () => new Dict(),
    abs: (x) => Math.abs(x as number),
    min: (...a) => extreme("min", a, false),
    max: (...a) => extreme("max", a, true),
    // A half rounds away from zero (ADR 0007), where Python rounds it to even.
    round: (x) => Math.sign(x as number) * Math.round(Math.abs(x as number)) || 0,
    sqrt: (x) => {
      if ((x as number) < 0) throw new SnapScriptError("ValueError", `sqrt takes a num not below 0, not ${show(x)}`);
      return Math.sqrt(x as number);
    },
    sin: (x) => sine(x as number),
    cos: (x) => sine((x as number) + 90),
    // No values is 0 to 1, one is 0 to it: the first end can come out, the second never does.
    random: (...a) => {
      const [start, end] = (a.length === 0 ? [0, 1] : a.length === 1 ? [0, a[0]] : a) as number[];
      return start! + Math.random() * (end! - start!);
    },
  };
  const values = new Map<string, Value>();
  for (const b of builtins) {
    if (b.type !== "function") {
      if (b.name === "pi") values.set("pi", Math.PI);
      continue;
    }
    values.set(b.name.toLowerCase(), checked(b.name, b.overloads, impls[b.name]!));
  }
  return values;
}
