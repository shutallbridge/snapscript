// The runtime library (#106): what the compiler's JS calls. It runs in the
// sketch process, which never loads the parser or the checker. The host (the
// sketch process, or a test's Node host) gives it the native modules and an
// output sink, and reads the text position it keeps.
import { builtins, type ErrorKind } from "@snapscript/core";

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
    /** Whether it takes `n` values. */
    readonly takes: (n: number) => boolean,
    readonly impl: (...args: Value[]) => Value,
  ) {}
}

/** Every value a program can hold. A list is a JS array, `none` is `null`. */
export type Value = number | string | boolean | null | Color | Value[] | Dict | SnapFunction | Module;

/** An error the program meets while running: one of the reference's kinds. */
export class SnapscriptError extends Error {
  constructor(
    readonly kind: ErrorKind,
    message: string,
  ) {
    super(message);
    this.name = kind;
  }
}

/** One kind's class: `new ValueError(message)`. */
export type ErrorOfKind = new (message: string) => SnapscriptError;

/** A class for one kind, for native modules to throw: `throw new ValueError("…")`. */
const errorOfKind = (kind: ErrorKind): ErrorOfKind =>
  class extends SnapscriptError {
    constructor(message: string) {
      super(kind, message);
    }
  };

export const SyntaxError: ErrorOfKind = errorOfKind("SyntaxError");
export const IndentationError: ErrorOfKind = errorOfKind("IndentationError");
export const NameError: ErrorOfKind = errorOfKind("NameError");
export const TypeError: ErrorOfKind = errorOfKind("TypeError");
export const AttributeError: ErrorOfKind = errorOfKind("AttributeError");
export const ImportError: ErrorOfKind = errorOfKind("ImportError");
export const IndexError: ErrorOfKind = errorOfKind("IndexError");
export const ValueError: ErrorOfKind = errorOfKind("ValueError");
export const ZeroDivisionError: ErrorOfKind = errorOfKind("ZeroDivisionError");
export const RecursionError: ErrorOfKind = errorOfKind("RecursionError");

/** Each kind in core's table, and its class. */
export const errorKinds: Readonly<Record<ErrorKind, ErrorOfKind>> = {
  SyntaxError,
  IndentationError,
  NameError,
  TypeError,
  AttributeError,
  ImportError,
  IndexError,
  ValueError,
  ZeroDivisionError,
  RecursionError,
};

/** Marks a runtime error, so one thrown by another copy of this library still counts. */
const errorBrand = Symbol.for("@snapscript/runtime.error");
Object.defineProperty(SnapscriptError.prototype, errorBrand, { value: true });

const isSnapscriptError = (e: unknown): e is SnapscriptError =>
  e instanceof SnapscriptError || (typeof e === "object" && e !== null && (e as Record<symbol, unknown>)[errorBrand] === true);

/** A library's own code broke: its message names the library and the function. */
class LibraryError extends Error {}

/** What reaches the host when a run stops on an error. */
export interface RunError {
  /** A runtime error has a kind; anything else a native module throws is a library error. */
  type: "runtime" | "library";
  kind: ErrorKind | null;
  message: string;
  /** The card on the table that led there. */
  span: Span | null;
}

/** What a native module's functions get, to reach back into the program. */
export interface NativeContext {
  /** Calls a function value of the program. */
  call(fn: Value, ...args: Value[]): Value;
  /** A module's function by name, or `null` when it has none: `run` finding `setup` and `draw`. */
  function(module: Value, name: string): SnapFunction | null;
  /** Reads a global of the native module's own `.snap` module. */
  global(name: string): Value;
  /** Sets a global of the native module's own `.snap` module. */
  setGlobal(name: string, value: Value): void;
  /** Tells the host a frame was drawn. */
  frame(): void;
}

/** A native function: its context, then the values it was called with. */
export type NativeFunction = (context: NativeContext, ...args: Value[]) => Value | void;

/** The `.js` beside a `.snap` file: one function per `[extern(…)]` name. */
export type NativeModule = Readonly<Record<string, unknown>>;

/** Where a run's output goes. */
export interface Output {
  /** A `print`: its values shown as their cards show them, and its `[call(print)]` card. */
  print(line: { text: string; span: Span | null }): void;
  error(error: RunError): void;
  /** A frame was drawn: the host's heartbeat. */
  frame(): void;
}

/** What the sketch process gives a run. */
export interface Host {
  /** The native module of a `.snap` module, by the loader's id. */
  natives(id: string): NativeModule | null;
  output: Output;
  /**
   * Where the run keeps the entry program's text position it is at: start
   * and end. The host reads it while the run is stuck.
   */
  position?: Int32Array;
}

/** A local not set yet, and an optional parameter not supplied. */
const UNSET: unique symbol = Symbol("unset");
const MISSING: unique symbol = Symbol("missing");

const isList = (v: unknown): v is Value[] => Array.isArray(v);

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

const truthy = (v: Value): boolean => !(v === null || v === false || v === 0 || v === "" || (isList(v) && v.length === 0));

const takesCounts = (counts: readonly { params: number; variadic: boolean }[]) => (n: number) =>
  counts.some((c) => (c.variadic ? n >= c.params : n === c.params));

const takesMessage = (fn: SnapFunction): string => `${fn.name} can't take those values`;

class Runtime {
  readonly UNSET: typeof UNSET = UNSET;
  readonly MISSING: typeof MISSING = MISSING;
  readonly modules: Module[] = [];
  /** The entry program's module: `[root]`. */
  root: Module | null = null;
  private readonly builtins = new Map<string, Value>();
  /** Each call and handler in progress, innermost last. */
  private readonly stack: Frame[] = [];
  /** How many calls deep the run is. */
  private depth = 0;
  private state: "running" | "stopping" | "stopped" = "running";
  /** Whether code that entered the program is running: an error in it stops the run there. */
  private inside = false;

  constructor(private readonly host: Host) {
    this.builtins = builtinValues((line) => this.host.output.print({ text: line, span: this.here() }));
  }

  /** The entry program's card the run is at. */
  here(): Span | null {
    return this.stack[this.stack.length - 1]?.card ?? null;
  }

  module(id: string | null, name: string, library: string | null): Module {
    const m = new Module(id, name, library, this.modules.length);
    this.modules.push(m);
    if (id === null) this.root = m;
    return m;
  }

  setAttr(m: Module, key: string, text: string, value: Value): void {
    const found = m.attributes.get(key);
    m.attributes.set(key, { text: found?.text ?? text, value });
  }

  getAttr(m: Module, key: string, text: string): Value {
    const found = m.attributes.get(key);
    if (!found) throw new SnapscriptError("NameError", `${text} is not defined`);
    return found.value;
  }

  define(m: Module, key: string, text: string, required: number, all: number, impl: (...args: Value[]) => Value): void {
    const fn = new SnapFunction(text, (n) => n >= required && n <= all, (...args) => {
      const full = [...args];
      while (full.length < all) full.push(MISSING as unknown as Value);
      return impl(...full);
    });
    this.setAttr(m, key, text, fn);
  }

  /** One `[extern(…)]` form: the name's function calls the native module's function of that name. */
  extern(m: Module, key: string, text: string, params: number): void {
    const found = m.attributes.get(key)?.value;
    const counts = found instanceof SnapFunction ? [...((found as ExternFunction).counts ?? []), params] : [params];
    const fn: ExternFunction = Object.assign(
      new SnapFunction(text, (n) => counts.includes(n), (...args) => this.callNative(m, text, args)),
      { counts },
    );
    this.setAttr(m, key, text, fn);
  }

  /**
   * Calls a native function. An error of a kind it throws is the program's;
   * anything else is the library's own code breaking.
   */
  private callNative(m: Module, text: string, args: Value[]): Value {
    try {
      return this.native(m, text)(this.context(m), ...args) ?? null;
    } catch (e) {
      if (isSnapscriptError(e) || e instanceof LibraryError) throw e;
      throw new LibraryError(`${m.library ?? m.name} broke inside ${text}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private native(m: Module, text: string): NativeFunction {
    const natives = m.id === null ? null : this.host.natives(m.id);
    const fn = natives?.[text] ?? Object.entries(natives ?? {}).find(([k]) => k.toLowerCase() === text.toLowerCase())?.[1];
    if (typeof fn !== "function") throw new Error(`no native function ${text}`);
    return fn as NativeFunction;
  }

  private context(m: Module): NativeContext {
    return {
      call: (fn, ...args) => this.entry(() => this.call(fn, args, m.index, 0, 0)),
      function: (module, name) => {
        const found = module instanceof Module ? module.attributes.get(name.toLowerCase())?.value : null;
        return found instanceof SnapFunction ? found : null;
      },
      global: (name) => this.getAttr(m, name.toLowerCase(), name),
      setGlobal: (name, value) => this.setAttr(m, name.toLowerCase(), name, value),
      frame: () => this.host.output.frame(),
    };
  }

  on(m: Module, event: string, handler: () => Value): void {
    m.handlers.set(event, handler);
  }

  /** Runs one event's handlers, an imported module's before the module importing it. */
  event(name: string): void {
    for (const m of this.modules) this.handle(m, name);
  }

  /** Runs a module's handler for an event, if it has one, with no card on the table that led there. */
  private handle(m: Module, event: string): void {
    const handler = m.handlers.get(event);
    if (!handler) return;
    this.stack.push({ card: null, loop: null });
    try {
      handler();
    } finally {
      this.stack.pop();
      this.mark();
    }
  }

  /**
   * Runs code that enters the program from outside it: the load, or a native
   * module calling back later (a frame). An error there stops the run. Once
   * stopped, the program runs no more.
   */
  entry(body: () => Value): Value {
    if (this.state === "stopped") return null;
    if (this.inside) return body();
    this.inside = true;
    try {
      return body();
    } catch (e) {
      this.report(e);
      this.stop();
      return null;
    } finally {
      this.inside = false;
    }
  }

  /** Stops the run, once: every `[on(stop)]` runs, an imported module's first, even after another one's error. */
  stop(): void {
    if (this.state !== "running") return;
    this.state = "stopping";
    const inside = this.inside;
    this.inside = true;
    for (const m of this.modules) {
      try {
        this.handle(m, "stop");
      } catch (e) {
        this.report(e);
      }
    }
    this.inside = inside;
    this.state = "stopped";
  }

  /** Gives the host an error, at the card the run was at when it broke. */
  private report(e: unknown): void {
    const span = (typeof e === "object" && e !== null && blamed.get(e)) || this.here();
    const message = e instanceof Error ? e.message : String(e);
    if (isSnapscriptError(e)) this.host.output.error({ type: "runtime", kind: e.kind, message, span });
    else this.host.output.error({ type: "library", kind: null, message, span });
  }

  missing(source: string): never {
    throw new SnapscriptError("ImportError", `${source} isn't loaded`);
  }

  color(name: string): Color {
    return new Color(name);
  }

  local(value: Value | typeof UNSET, text: string, title: string): Value {
    if (value === UNSET) throw new SnapscriptError("NameError", `${text} is a local of ${title}, not set yet`);
    return value;
  }

  builtin(key: string, text: string): Value {
    const found = this.builtins.get(key);
    if (found === undefined) throw new SnapscriptError("NameError", `${text} is not defined`);
    return found;
  }

  /** Enters a call at a card: one on the table is where the run is, one in a library keeps the table's card that led there. */
  private enter(module: number, start: number, end: number): void {
    const card = module === this.root?.index ? { start, end } : this.here();
    this.stack.push({ card, loop: null });
    this.depth += 1;
    this.mark();
  }

  private leave(): void {
    this.stack.pop();
    this.depth -= 1;
    this.mark();
  }

  /** A loop of the entry program goes round again: the compiled code marks its head card, where a stuck run is stuck. */
  loop(start: number, end: number): void {
    const frame = this.stack[this.stack.length - 1];
    if (!frame) return;
    frame.loop = { start, end };
    this.mark();
  }

  /** Writes where the run is for the host, which reads it from another thread while the run is stuck. */
  private mark(): void {
    const { position } = this.host;
    if (!position) return;
    const frame = this.stack[this.stack.length - 1];
    const span = frame?.loop ?? frame?.card ?? null;
    Atomics.store(position, 0, span?.start ?? -1);
    Atomics.store(position, 1, span?.end ?? -1);
  }

  call(fn: Value, args: Value[], module: number, start: number, end: number): Value {
    if (!(fn instanceof SnapFunction)) throw new SnapscriptError("TypeError", `${show(fn)} is not a function`);
    if (!fn.takes(args.length)) throw new SnapscriptError("TypeError", takesMessage(fn));
    this.enter(module, start, end);
    try {
      if (this.depth >= RECURSION_LIMIT) throw new RecursionError("maximum recursion depth exceeded");
      return fn.impl(...args);
    } catch (e) {
      // The card the run was at when it broke, kept before the calls unwind.
      if (!blamed.has(e as object)) blamed.set(e as object, this.here());
      throw e;
    } finally {
      this.leave();
    }
  }

  callMethod(receiver: Value, key: string, text: string, args: Value[], module: number, start: number, end: number): Value {
    if (receiver instanceof Module) return this.call(this.getAttr(receiver, key, text), args, module, start, end);
    if (isList(receiver)) {
      const method = listMethods[key];
      if (method) return this.call(new SnapFunction(text, (n) => n === method.length - 1, (...a) => method(receiver, ...a)), args, module, start, end);
    }
    throw new SnapscriptError("AttributeError", `${typeName(receiver)} has no method ${text}`);
  }

  getProp(object: Value, key: string, text: string, _module: number, _start: number, _end: number): Value {
    if (object instanceof Module || object instanceof Dict) {
      const found = object.attributes.get(key);
      if (!found) throw new SnapscriptError("AttributeError", `${show(object)} has no attribute ${text}`);
      return found.value;
    }
    throw new SnapscriptError("AttributeError", `${typeName(object)} has no attributes`);
  }

  setProp(target: Value, key: string, text: string, value: Value, own: Module): void {
    if (target instanceof Dict || (target instanceof Module && target === own)) {
      const found = target.attributes.get(key);
      target.attributes.set(key, { text: found?.text ?? text, value });
      return;
    }
    throw new SnapscriptError("AttributeError", `${typeName(target)} attributes can't be set here`);
  }

  truthy(v: Value): boolean {
    return truthy(v);
  }

  op(op: string, a: Value, b: Value, _module: number, _start: number, _end: number): Value {
    const x = a as number;
    const y = b as number;
    switch (op) {
      case "+":
        return (x as unknown as string) + (y as unknown as string);
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        return x / y;
      case "%":
        return x % y;
      case "<":
        return x < y;
      case ">":
        return x > y;
      case "<=":
        return x <= y;
      case ">=":
        return x >= y;
      case "==":
        return a === b;
      case "!=":
        return a !== b;
    }
    throw new Error(`unknown operator ${op}`);
  }

  count(v: Value): number {
    return v as number;
  }

  items(v: Value): Value[] {
    if (!isList(v)) throw new SnapscriptError("TypeError", `${typeName(v)} can't be looped over`);
    return v;
  }
}

/**
 * A call or handler in progress: the card on the table that led there, and
 * the entry program's loop it is in.
 */
interface Frame {
  card: Span | null;
  loop: Span | null;
}

/** How many calls deep a run can go, as in Python: the call that would make it this deep is a `RecursionError`. */
const RECURSION_LIMIT = 1000;

/** Each error a run meets, and the card it was at. */
const blamed = new WeakMap<object, Span | null>();

type ExternFunction = SnapFunction & { counts?: number[] };

function typeName(v: Value): string {
  if (v === null) return "none";
  if (isList(v)) return "list";
  if (v instanceof Color) return "color";
  if (v instanceof Dict) return "dict";
  if (v instanceof Module) return "module";
  if (v instanceof SnapFunction) return "function";
  return typeof v === "number" ? "num" : typeof v === "string" ? "str" : "bool";
}

const listMethods: Readonly<Record<string, (list: Value[], ...args: Value[]) => Value>> = {
  getat: (list, i) => list[(i as number) < 0 ? list.length + (i as number) : (i as number)] ?? null,
  setat: (list, i, item) => {
    list[(i as number) < 0 ? list.length + (i as number) : (i as number)] = item;
    return null;
  },
  append: (list, item) => {
    list.push(item);
    return null;
  },
  pop: (list) => list.pop() ?? null,
};

const radians = (degrees: number): number => (degrees * Math.PI) / 180;

/** The builtins' values (REFERENCE.md §9), by name key. Each takes what core's table says. */
function builtinValues(print: (line: string) => void): Map<string, Value> {
  const impls: Record<string, (...args: Value[]) => Value> = {
    print: (...values) => {
      print(values.map((v) => show(v)).join(" "));
      return null;
    },
    range: (...a) => {
      const [start, stop, step] = (a.length === 1 ? [0, a[0], 1] : [a[0], a[1], a[2] ?? 1]) as number[];
      const out: number[] = [];
      for (let i = start!; step! > 0 ? i < stop! : i > stop!; i += step!) out.push(i);
      return out;
    },
    len: (v) => (v as string | Value[]).length,
    list: (...items) => items,
    dict: () => new Dict(),
    abs: (x) => Math.abs(x as number),
    min: (...a) => Math.min(...((a.length === 1 && isList(a[0]) ? a[0] : a) as number[])),
    max: (...a) => Math.max(...((a.length === 1 && isList(a[0]) ? a[0] : a) as number[])),
    round: (x) => Math.sign(x as number) * Math.round(Math.abs(x as number)),
    sqrt: (x) => Math.sqrt(x as number),
    sin: (x) => Math.sin(radians(x as number)),
    cos: (x) => Math.cos(radians(x as number)),
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
    const counts = b.overloads.map((s) => ({ params: s.params.length, variadic: s.variadic !== null }));
    values.set(b.name.toLowerCase(), new SnapFunction(b.name, takesCounts(counts), impls[b.name]!));
  }
  return values;
}

/** A run the host started. */
export interface Run {
  /** Stops it: every `[on(stop)]` runs, unless it has stopped already. */
  stop(): void;
}

/**
 * Runs compiled JS: loads every module, then runs the `[on(load)]` handlers,
 * an imported module's first. A run stops at the first error, which goes to
 * the host's output, and then every `[on(stop)]` runs. A native module's
 * calls back into the program after the load (its frames) run until then.
 */
export function run(js: string, host: Host): Run {
  const rt = new Runtime(host);
  if (host.position) host.position.fill(-1);
  rt.entry(() => {
    new Function("rt", js)(rt);
    rt.event("load");
    return null;
  });
  return { stop: () => rt.stop() };
}
