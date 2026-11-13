// The runtime library (#106): what the compiler's JS calls. It runs in the
// sketch process, which never loads the parser or the checker. The host (the
// sketch process, or a test's Node host) gives it the native modules and an
// output sink, and reads the text position it keeps.
import { describeCounts, operators, type Count, type ErrorKind, type Operator } from "@snapscript/core";
import { builtinValues, listMethods } from "./builtins.ts";
import { isSnapScriptError, LibraryError, RecursionError, SnapScriptError, type RunError } from "./errors.ts";
import { article, Color, Dict, equal, isList, Module, show, SnapFunction, truthy, typeName, type Span, type Value } from "./values.ts";

export { Color, Dict, Module, show, SnapFunction, type Span, type Value } from "./values.ts";
export {
  AttributeError,
  errorKinds,
  ImportError,
  IndentationError,
  IndexError,
  NameError,
  RecursionError,
  SnapScriptError,
  SyntaxError,
  TypeError,
  ValueError,
  ZeroDivisionError,
  type ErrorOfKind,
  type RunError,
} from "./errors.ts";

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

/** What a function value given the wrong number of values says, as the checker says it of a function it knows. */
const takesMessage = (fn: SnapFunction): string => `${fn.name} takes ${describeCounts(fn.counts)}`;

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
    if (!found) throw new SnapScriptError("NameError", `${text} is not defined`);
    return found.value;
  }

  define(m: Module, key: string, text: string, required: number, all: number, impl: (...args: Value[]) => Value): void {
    const counts = Array.from({ length: all - required + 1 }, (_, i): Count => ({ params: required + i, variadic: false }));
    const fn = new SnapFunction(text, counts, (...args) => {
      const full = [...args];
      while (full.length < all) full.push(MISSING as unknown as Value);
      return impl(...full);
    });
    this.setAttr(m, key, text, fn);
  }

  /** One `[extern(…)]` form: the name's function calls the native module's function of that name. */
  extern(m: Module, key: string, text: string, params: number): void {
    const found = m.attributes.get(key)?.value;
    const counts: Count[] = [...(found instanceof SnapFunction ? found.counts : []), { params, variadic: false }];
    this.setAttr(m, key, text, new SnapFunction(text, counts, (...args) => this.callNative(m, text, args)));
  }

  /**
   * Calls a native function. An error of a kind it throws is the program's;
   * anything else is the library's own code breaking.
   */
  private callNative(m: Module, text: string, args: Value[]): Value {
    try {
      return this.native(m, text)(this.context(m), ...args) ?? null;
    } catch (e) {
      if (isSnapScriptError(e) || e instanceof LibraryError) throw e;
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
    if (isSnapScriptError(e)) this.host.output.error({ type: "runtime", kind: e.kind, message, span });
    else this.host.output.error({ type: "library", kind: null, message, span });
  }

  missing(source: string): never {
    throw new SnapScriptError("ImportError", `${source} isn't loaded`);
  }

  color(name: string): Color {
    return new Color(name);
  }

  local(value: Value | typeof UNSET, text: string, title: string): Value {
    if (value === UNSET) throw new SnapScriptError("NameError", `${text} is a local of ${title}, not set yet`);
    return value;
  }

  builtin(key: string, text: string): Value {
    const found = this.builtins.get(key);
    if (found === undefined) throw new SnapScriptError("NameError", `${text} is not defined`);
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
    if (!(fn instanceof SnapFunction)) this.fail("TypeError", `${show(fn)} is not a function`, module, start, end);
    if (!fn.takes(args.length)) this.fail("TypeError", takesMessage(fn), module, start, end);
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
      const method = listMethods.get(key);
      if (method) return this.call(method(receiver), args, module, start, end);
    }
    this.fail("AttributeError", `${typeName(receiver)} has no method ${text}`, module, start, end);
  }

  getProp(object: Value, key: string, text: string, module: number, start: number, end: number): Value {
    if (object instanceof Module || object instanceof Dict) {
      const found = object.attributes.get(key);
      if (!found) this.fail("AttributeError", `${show(object)} has no attribute ${text}`, module, start, end);
      return found.value;
    }
    this.fail("AttributeError", `${typeName(object)} has no attributes`, module, start, end);
  }

  /** `[setProp{…}to]`: its error is at the card, in the module `own` it is in. */
  setProp(target: Value, key: string, text: string, value: Value, own: Module, start: number, end: number): void {
    if (target instanceof Dict || (target instanceof Module && target === own)) {
      const found = target.attributes.get(key);
      target.attributes.set(key, { text: found?.text ?? text, value });
      return;
    }
    this.fail("AttributeError", `${typeName(target)} attributes can't be set here`, own.index, start, end);
  }

  truthy(v: Value): boolean {
    return truthy(v);
  }

  /**
   * A two-value operator card (§6.3), with what core's table says it takes.
   * Its errors are at the operator card, or at the table's card that led into a library.
   */
  op(op: string, a: Value, b: Value, module: number, start: number, end: number): Value {
    if (op === "==") return equal(a, b);
    if (op === "!=") return !equal(a, b);
    const card = `[${op}]`;
    const rules = operators[op as Operator];
    const [left, right] = [typeName(a), typeName(b)];
    if (!rules.some((r) => (r.left === "any" || r.left === left) && (r.right === "any" || r.right === right))) {
      const takes = rules.map((r) => (r.left === r.right ? `two ${r.left}s` : `a ${r.left} and a ${r.right}`)).join(" or ");
      this.fail("TypeError", `${card} takes ${takes}, not ${article(left)} and ${article(right)}`, module, start, end);
    }
    const x = a as number;
    const y = b as number;
    switch (op) {
      case "+":
        return typeof a === "string" ? a + (b as string) : x + y;
      case "-":
        return x - y;
      case "*":
        return x * y;
      case "/":
        if (y === 0) this.fail("ZeroDivisionError", `${card} can't divide by 0`, module, start, end);
        return x / y;
      case "%":
        // Python's %: the result takes the sign of the right value.
        if (y === 0) this.fail("ZeroDivisionError", `${card} can't divide by 0`, module, start, end);
        return x - y * Math.floor(x / y);
      case "<":
        return x < y;
      case ">":
        return x > y;
      case "<=":
        return x <= y;
      case ">=":
        return x >= y;
    }
    throw new Error(`unknown operator ${op}`);
  }

  /** Throws a runtime error at a card: one on the table is where it happened, one in a library keeps the table's card that led there. */
  fail(kind: ErrorKind, message: string, module: number, start: number, end: number): never {
    const error = new SnapScriptError(kind, message);
    blamed.set(error, module === this.root?.index ? { start, end } : this.here());
    throw error;
  }

  /** `[repeat]`'s value (§8.2): a whole number. Its errors are at the value. */
  count(v: Value, module: number, start: number, end: number): number {
    if (typeof v !== "number") this.fail("TypeError", `[repeat] takes a num, not ${article(typeName(v))}`, module, start, end);
    if (!Number.isInteger(v)) this.fail("ValueError", `[repeat] takes a whole number, not ${show(v)}`, module, start, end);
    return v;
  }

  /** `[for{…}in]`'s value (§8.2): a list. Dicts are not iterable. */
  items(v: Value, module: number, start: number, end: number): Value[] {
    if (!isList(v)) this.fail("TypeError", `[for{…}in] takes a list, not ${article(typeName(v))}`, module, start, end);
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
