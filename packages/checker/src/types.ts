// The check stage's types (REFERENCE.md §3, §4.3, §6, §8, §9), from the
// rules table in @snapscript/core. The checker looks at names and types,
// never at values, and reports only what would certainly fail: a value can
// be any of a set of types, and an error is reported only when every one of
// them fails. A value it knows nothing about can be any type.
import {
  builtins,
  forTakes,
  leafTypes,
  methods,
  notGives,
  operators,
  repeatTakes,
  types,
  typesWithAttributes,
  type ErrorKind,
  type Operator,
  type Signature,
  type Takes,
  type Type,
} from "@snapscript/core";
import type { Declaration, Expr, Name, Param, Program, Span, Statement } from "@snapscript/parser";
import type { CheckError } from "./index.ts";

type Types = ReadonlySet<Type>;

const ANY: Types = new Set(types);
const NOTHING: Types = new Set();
const only = (...of: Type[]): Types => new Set(of);
const takesOf = (takes: Takes | Type | "any"): Types => (takes === "any" ? ANY : typeof takes === "string" ? only(takes) : new Set(takes));
const meets = (a: Types, b: Types): boolean => [...a].some((t) => b.has(t));

/** `a num`, `none`, `a num or a str`. */
function describe(of: Types): string {
  return [...of]
    .map((t) => (t === "none" ? "none" : `a ${t}`))
    .join(" or ");
}

/** `nums`, `a num`, `a list or a str`: what a function's values must be. */
function describeTakes(of: Types, many: boolean): string {
  const list = [...of];
  if (many && list.length === 1 && list[0] !== "none") return `${list[0]}s`;
  return describe(of);
}

/** `no values`, `1 value`, `3 values`, `1 to 3 values`, `1 or 3 values`, `at least 2 values`. */
function describeCounts(overloads: readonly Signature[]): string {
  const variadic = overloads.filter((s) => s.variadic !== null).map((s) => s.params.length);
  if (variadic.length > 0) {
    const least = Math.min(...variadic);
    return least === 0 ? "any number of values" : `at least ${least} value${least === 1 ? "" : "s"}`;
  }
  const counts = [...new Set(overloads.map((s) => s.params.length))].sort((a, b) => a - b);
  const plural = (n: number) => (n === 1 ? "value" : "values");
  if (counts.length === 1) return counts[0] === 0 ? "no values" : `${counts[0]} ${plural(counts[0])}`;
  const last = counts[counts.length - 1];
  if (last - counts[0] === counts.length - 1) return `${counts[0]} to ${last} values`;
  return `${counts.slice(0, -1).join(", ")} or ${last} values`;
}

/** The ways a `[define{…}]` or an `[extern(…)]` can be called: with every count from its required values to all of them. */
function signaturesOf(params: readonly Param[]): Signature[] {
  const required = params.filter((p) => p.type === "required").length;
  const all = params.map((p) => ({ name: p.name?.text ?? "", takes: "any" as const }));
  const signatures: Signature[] = [];
  for (let n = required; n <= all.length; n += 1) signatures.push({ params: all.slice(0, n), variadic: null, gives: "any" });
  return signatures;
}

/** What a bare name names. */
type Named =
  | { type: "value"; types: Types }
  | { type: "function"; text: string; overloads: readonly Signature[] };

/** One `[define]`'s or `[on(…)]`'s names. */
interface Scope {
  params: Set<string>;
  /** Names it sets on lines that count, and the types they can hold. */
  locals: Map<string, Set<Type>>;
}

/** A value with its types, and where it is. */
interface Value {
  types: Types;
  span: Span;
}

const bodyOf = (declaration: Declaration): Statement[] =>
  declaration.type === "define" || declaration.type === "on" ? declaration.body : [];

/**
 * Calls `visit` on every statement that counts: not on a line that is `gone`,
 * nor in a block, a later block of a chain, or a strip that is. A line can
 * go while it is visited, and then takes its block with it.
 */
function walk(statements: readonly Statement[], gone: (line: number) => boolean, visit: (statement: Statement) => void): void {
  for (const statement of statements) {
    if (gone(statement.line)) continue;
    visit(statement);
    if (gone(statement.line)) continue;
    switch (statement.type) {
      case "repeat":
      case "for":
        walk(statement.body, gone, visit);
        break;
      case "if":
        for (const branch of statement.branches) {
          if (gone(branch.line)) break;
          walk(branch.body, gone, visit);
        }
        break;
    }
  }
}

class TypeChecker {
  readonly errors: CheckError[] = [];
  readonly failed = new Set<number>();
  private readonly topLevel = new Map<string, Named | { type: "global" }>();
  private readonly globals = new Map<string, Set<Type>>();
  private readonly scopes = new Map<Declaration, Scope>();
  /** Errors are kept only while checking, not while working out what names hold. */
  private reporting = false;
  private line = 0;

  constructor(
    private readonly program: Program,
    /** Lines that don't count: skipped, or with an error found by another check. */
    private readonly absent: ReadonlySet<number>,
    /** Lines found with a type error by the last check: what they set doesn't count. */
    private readonly lastFailed: ReadonlySet<number>,
  ) {
    const externs = new Map<string, { text: string; overloads: Signature[] }>();
    for (const declaration of program.declarations) {
      if (absent.has(declaration.line)) continue;
      switch (declaration.type) {
        case "define":
          if (declaration.name) {
            this.topLevel.set(declaration.name.key, {
              type: "function",
              text: declaration.name.text,
              overloads: signaturesOf(declaration.params),
            });
          }
          break;
        case "extern":
          if (declaration.name) {
            const found = externs.get(declaration.name.key) ?? { text: declaration.name.text, overloads: [] };
            found.overloads.push(...signaturesOf(declaration.params));
            externs.set(declaration.name.key, found);
            this.topLevel.set(declaration.name.key, { type: "function", ...found });
          }
          break;
        case "import":
          if (declaration.binding) this.topLevel.set(declaration.binding.key, { type: "value", types: only("module") });
          break;
        case "global":
          if (declaration.name) {
            this.topLevel.set(declaration.name.key, { type: "global" });
            this.globals.set(declaration.name.key, new Set());
          }
          break;
      }
    }
    for (const declaration of program.declarations) {
      if (absent.has(declaration.line) || (declaration.type !== "define" && declaration.type !== "on")) continue;
      const params = new Set(declaration.type === "define" ? declaration.params.flatMap((p) => (p.name ? [p.name.key] : [])) : []);
      const locals = new Map<string, Set<Type>>();
      walk(declaration.body, (line) => absent.has(line), (statement) => {
        const name = statement.type === "set" || statement.type === "for" ? statement.name : null;
        if (name && !params.has(name.key) && !this.globals.has(name.key) && !locals.has(name.key)) locals.set(name.key, new Set());
      });
      this.scopes.set(declaration, { params, locals });
    }
  }

  check(): void {
    this.settle();
    this.reporting = true;
    this.pass();
  }

  /** Works out the types each local and global can hold, until nothing changes. */
  private settle(): void {
    for (let changed = true; changed; ) {
      changed = false;
      const grow = (into: Set<Type> | undefined, of: Types) => {
        if (!into) return;
        for (const t of of) {
          if (!into.has(t)) {
            into.add(t);
            changed = true;
          }
        }
      };
      this.pass((scope, name, of) => grow(scope?.locals.get(name.key) ?? this.globals.get(name.key), of));
    }
  }

  /**
   * Goes over every line that counts, telling `assign` what each `[set]` and
   * `[for]` gives its name. While working out what names hold, the lines the
   * last check found with an error don't count; while checking, a line found
   * with an error takes its block with it.
   */
  private pass(assign: (scope: Scope | null, name: Name, of: Types) => void = () => {}): void {
    const gone = this.reporting
      ? (line: number) => this.absent.has(line) || this.failed.has(line)
      : (line: number) => this.absent.has(line) || this.lastFailed.has(line);
    const global = (key: string): Set<Type> | undefined => this.globals.get(key);
    for (const declaration of this.program.declarations) {
      if (this.absent.has(declaration.line)) continue;
      if (declaration.type === "global") {
        this.line = declaration.line;
        if (declaration.name && declaration.value) assign(null, declaration.name, this.typeOf(declaration.value, null));
        continue;
      }
      const scope = this.scopes.get(declaration);
      if (!scope) continue;
      walk(bodyOf(declaration), gone, (statement) => {
        this.line = statement.line;
        const setsGlobal = (name: Name) => !scope.params.has(name.key) && !scope.locals.has(name.key) && global(name.key);
        switch (statement.type) {
          case "set":
            if (statement.value) {
              const of = this.typeOf(statement.value, scope);
              if (statement.name && (scope.locals.has(statement.name.key) || setsGlobal(statement.name))) assign(scope, statement.name, of);
            }
            break;
          case "setProp": {
            const target = this.typeOf(statement.target, scope);
            this.attributes(target, statement.span);
            if (statement.value) this.typeOf(statement.value, scope);
            // A module's attributes are its top-level declarations: setting one may change a global.
            if (statement.name && meets(target, only("module"))) assign(null, statement.name, ANY);
            break;
          }
          case "expression":
          case "return":
            if (statement.value) this.typeOf(statement.value, scope);
            break;
          case "repeat":
            if (statement.count) this.takes(this.typeOf(statement.count, scope), repeatTakes, "[repeat]", statement.count.span);
            break;
          case "for":
            if (statement.iterable) this.takes(this.typeOf(statement.iterable, scope), forTakes, "[for{…}in]", statement.iterable.span);
            // A list's items can be any type.
            if (statement.name && (scope.locals.has(statement.name.key) || setsGlobal(statement.name))) assign(scope, statement.name, ANY);
            break;
          case "if":
            for (const branch of statement.branches) {
              if (gone(branch.line)) break;
              this.line = branch.line;
              if (branch.condition) this.typeOf(branch.condition, scope);
              if (gone(branch.line)) break;
            }
            break;
        }
      });
    }
  }

  private report(kind: ErrorKind, message: string, span: Span): void {
    if (!this.reporting) return;
    this.errors.push({ kind, message, stage: "check", line: this.line, spans: [span], followsFrom: null, suggestion: null });
    this.failed.add(this.line);
  }

  /** What a bare name names where `scope` reads it: a local, a parameter, a top-level declaration, then a builtin. */
  private named(name: Name, scope: Scope | null): Named {
    const key = name.key;
    if (scope?.params.has(key)) return { type: "value", types: ANY };
    const local = scope?.locals.get(key);
    if (local) return { type: "value", types: local };
    const top = this.topLevel.get(key);
    if (top) return top.type === "global" ? { type: "value", types: this.globals.get(key)! } : top;
    const builtin = builtins.find((b) => b.name === key);
    if (builtin) {
      return builtin.type === "function"
        ? { type: "function", text: builtin.name, overloads: builtin.overloads }
        : { type: "value", types: only(builtin.type) };
    }
    // Set nowhere: a NameError, which the names check reports.
    return { type: "value", types: ANY };
  }

  private typesOfName(name: Name, scope: Scope | null): Types {
    const named = this.named(name, scope);
    if (named.type === "function") return only("function");
    // A name with nothing it can hold yet is worked out later, or set nowhere.
    return named.types.size === 0 ? NOTHING : named.types;
  }

  /** The types a value can have. A value with an error has none, so it gives no more errors. */
  private typeOf(expr: Expr, scope: Scope | null): Types {
    switch (expr.type) {
      case "num":
      case "str":
      case "bool":
      case "color":
      case "none":
      case "root":
        return only(leafTypes[expr.type]);
      case "get": {
        let of = this.typesOfName(expr.path[0], scope);
        for (const name of expr.path.slice(1)) of = this.attributes(of, name.span);
        return of;
      }
      case "getProp":
        return this.attributes(this.typeOf(expr.object, scope), expr.card.span);
      case "group":
        return this.typeOf(expr.value, scope);
      case "not":
        return this.typeOf(expr.operand, scope).size === 0 ? NOTHING : only(notGives);
      case "binary":
        return this.binary(expr, scope);
      case "call":
        return this.call(expr, scope);
    }
  }

  /** What reading an attribute of a value gives: any type, when the value has attributes. */
  private attributes(of: Types, span: Span): Types {
    if (of.size === 0) return NOTHING;
    if (!meets(of, only(...typesWithAttributes))) {
      this.report("AttributeError", `${describe(of).replace(/^an? /, "")} has no attributes`, span);
      return NOTHING;
    }
    return ANY;
  }

  private binary(expr: Expr & { type: "binary" }, scope: Scope | null): Types {
    const left = this.typeOf(expr.left, scope);
    const right = this.typeOf(expr.right, scope);
    if (left.size === 0 || right.size === 0) return NOTHING;
    const rules = operators[expr.op as Operator];
    const gives = new Set<Type>();
    for (const l of left) {
      for (const r of right) {
        for (const rule of rules) {
          if ((rule.left !== "any" && rule.left !== l) || (rule.right !== "any" && rule.right !== r)) continue;
          if (rule.gives === "either") gives.add(l).add(r);
          else gives.add(rule.gives);
        }
      }
    }
    if (gives.size === 0) {
      const takes = rules.map((rule) => (rule.left === rule.right ? `two ${rule.left}s` : `a ${rule.left} and a ${rule.right}`)).join(" or ");
      this.report("TypeError", `${expr.card.text} takes ${takes}, not ${describe(left)} and ${describe(right)}`, expr.span);
    }
    return gives;
  }

  private call(expr: Expr & { type: "call" }, scope: Scope | null): Types {
    const args: Value[] = expr.args.map((arg) => ({ types: this.typeOf(arg, scope), span: arg.span }));
    const last = expr.path[expr.path.length - 1];
    if (expr.receiver === null && expr.path.length === 1) {
      const named = this.named(last, scope);
      if (named.type === "function") return this.overloads(named.text, named.overloads, args, expr.card.span);
      if (named.types.size > 0 && !named.types.has("function")) {
        this.report("TypeError", `${last.text} is ${describe(named.types)}, not a function`, expr.card.span);
        return NOTHING;
      }
      return ANY;
    }
    let of = expr.receiver ? this.typeOf(expr.receiver, scope) : this.typesOfName(expr.path[0], scope);
    for (const name of expr.path.slice(expr.receiver ? 0 : 1, -1)) of = this.attributes(of, name.span);
    return this.method(of, last, args, expr.card.span);
  }

  /** Calls a function in a module, or a method of a value's type (§6.2). */
  private method(of: Types, name: Name, args: Value[], span: Span): Types {
    if (of.size === 0) return NOTHING;
    // A module's functions are its own: what they take comes with the module.
    if (of.has("module")) return ANY;
    const found = [...of].map((t) => Object.entries(methods[t] ?? {}).find(([key]) => key.toLowerCase() === name.key));
    if (found.every((f) => f === undefined)) {
      this.report("AttributeError", `${describe(of).replace(/^an? /, "")} has no method ${name.text}`, span);
      return NOTHING;
    }
    if (of.size === 1) {
      const [text, overloads] = found[0]!;
      return this.overloads(text, overloads, args, span);
    }
    return ANY;
  }

  /** Checks a call's values against the ways the function can be called, and gives what it gives. */
  private overloads(text: string, overloads: readonly Signature[], args: Value[], span: Span): Types {
    const signature = overloads.find(
      (s) => s.params.length === args.length || (s.variadic !== null && args.length >= s.params.length),
    );
    if (!signature) {
      this.report("TypeError", `${text} takes ${describeCounts(overloads)}`, span);
      return NOTHING;
    }
    const all = signature.params.map((p) => takesOf(p.takes));
    if (signature.variadic) all.push(takesOf(signature.variadic.takes));
    let ok = true;
    args.forEach((arg, i) => {
      const takes = all[Math.min(i, all.length - 1)];
      if (arg.types.size === 0) {
        ok = false;
        return;
      }
      if (!meets(arg.types, takes)) {
        this.report("TypeError", `${text} takes ${this.describeParams(overloads, takes)}, not ${describe(arg.types)}`, arg.span);
        ok = false;
      }
    });
    return ok ? takesOf(signature.gives) : NOTHING;
  }

  /** `a num` for a function of one value, `nums` when all its values take the same. */
  private describeParams(overloads: readonly Signature[], takes: Types): string {
    const params = overloads.flatMap((s) => [...s.params, ...(s.variadic ? [s.variadic] : [])]);
    const many = overloads.some((s) => s.params.length > 1 || s.variadic !== null);
    return describeTakes(takes, many && params.every((p) => takesOf(p.takes).size === takes.size && meets(takesOf(p.takes), takes)));
  }

  /** Reports a statement's value that is certainly not one of the types it takes. */
  private takes(of: Types, takes: readonly Type[], what: string, span: Span): void {
    if (of.size > 0 && !meets(of, only(...takes))) {
      this.report("TypeError", `${what} takes ${describe(only(...takes))}, not ${describe(of)}`, span);
    }
  }
}

/**
 * Checks the program's types. `absent` holds the lines that don't count, and
 * `lastFailed` the lines the last check found with a type error.
 */
export function checkTypes(
  program: Program,
  absent: ReadonlySet<number>,
  lastFailed: ReadonlySet<number> = new Set(),
): { errors: CheckError[]; failed: Set<number> } {
  const checker = new TypeChecker(program, absent, lastFailed);
  checker.check();
  return { errors: checker.errors, failed: checker.failed };
}
