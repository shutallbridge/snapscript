// The check stage's names (REFERENCE.md §4.2, ADR 0008) and skipping
// (§4.3, ADR 0004). A skipped line counts as absent: its names are not set,
// a block head takes its body with it, an [if] or [elif] the rest of its
// chain, and a declaration its strip.
import { builtinNames, firstStage } from "@snapscript/core";
import type { Branch, Declaration, Expr, Name, Program, Span, Statement } from "@snapscript/parser";
import type { CheckError } from "./index.ts";
import { closest } from "./suggest.ts";

/** A name the program declares or sets, as first written, and the spans that declare it. */
interface Binding {
  text: string;
  line: number;
  spans: Span[];
}

type Bindings = Map<string, Binding>;

function bind(bindings: Bindings, name: Name, line: number): void {
  const found = bindings.get(name.key);
  if (found) found.spans.push(name.span);
  else bindings.set(name.key, { text: name.text, line, spans: [name.span] });
}

/** The name a statement sets, if any: `[set{x}to]` and `[for{x}in]`. */
function setName(statement: Statement): Name | null {
  return statement.type === "set" || statement.type === "for" ? statement.name : null;
}

/**
 * Calls `visit` on every statement, with whether it is absent: its own line
 * is in `absent`, or it lies in a block, a later block of a chain, or a strip
 * that is.
 */
function walk(
  statements: readonly Statement[],
  absent: ReadonlySet<number>,
  visit: (statement: Statement, absent: boolean) => void,
  inAbsent = false,
): void {
  for (const statement of statements) {
    const gone = inAbsent || absent.has(statement.line);
    visit(statement, gone);
    switch (statement.type) {
      case "repeat":
      case "for":
      case "invalid":
        walk(statement.body, absent, visit, gone);
        break;
      case "if": {
        let chainGone = gone;
        for (const branch of statement.branches) {
          chainGone = chainGone || absent.has(branch.line);
          walk(branch.body, absent, visit, chainGone);
        }
        break;
      }
    }
  }
}

/** Every line a statement takes, its body's and its `[dedent]` included. */
function linesOf(statement: Statement, into: Set<number>): void {
  into.add(statement.line);
  switch (statement.type) {
    case "repeat":
    case "for":
      for (const s of statement.body) linesOf(s, into);
      if (statement.dedent !== null) into.add(statement.dedent);
      break;
    case "if":
      for (const branch of statement.branches) {
        into.add(branch.line);
        for (const s of branch.body) linesOf(s, into);
      }
      if (statement.dedent !== null) into.add(statement.dedent);
      break;
    case "invalid":
      for (const line of statement.lines) into.add(line);
      for (const s of statement.body) linesOf(s, into);
      break;
  }
}

/** Adds the lines of the statements that are skipped: those in `absent`, with what each takes with it. */
function markSkipped(statements: readonly Statement[], absent: ReadonlySet<number>, into: Set<number>): void {
  for (const statement of statements) {
    if (absent.has(statement.line)) {
      linesOf(statement, into);
      continue;
    }
    switch (statement.type) {
      case "repeat":
      case "for":
      case "invalid":
        markSkipped(statement.body, absent, into);
        break;
      case "if": {
        const from = statement.branches.findIndex((b) => absent.has(b.line));
        statement.branches.forEach((branch, i) => {
          if (from !== -1 && i >= from) {
            into.add(branch.line);
            for (const s of branch.body) linesOf(s, into);
          } else {
            markSkipped(branch.body, absent, into);
          }
        });
        break;
      }
    }
  }
}

const bodyOf = (declaration: Declaration): Statement[] =>
  declaration.type === "define" || declaration.type === "on" ? declaration.body : [];

const declaredName = (declaration: Declaration): Name | null => {
  switch (declaration.type) {
    case "on":
      return null;
    case "import":
      return declaration.binding;
    default:
      return declaration.name;
  }
};

/** The lines the program skips: those `absent`, and those their skips take with them. */
export function skippedLinesOf(program: Program, absent: ReadonlySet<number>): number[] {
  const all = new Set<number>();
  const skipped = new Set<number>();
  for (const declaration of program.declarations) {
    const own = new Set<number>([declaration.line]);
    for (const s of bodyOf(declaration)) linesOf(s, own);
    for (const line of own) all.add(line);
    if (absent.has(declaration.line)) {
      for (const line of own) skipped.add(line);
      continue;
    }
    markSkipped(bodyOf(declaration), absent, skipped);
  }
  for (const line of absent) if (all.has(line)) skipped.add(line);
  return [...skipped].sort((a, b) => a - b);
}

/** One `[define]`'s or `[on(…)]`'s names. */
interface Scope {
  /** How messages name the function: `draw`, or `[on(load)]`. */
  title: string;
  params: Bindings;
  /** Names it sets anywhere, on lines that count: each is a local throughout. */
  locals: Bindings;
  /** Lines setting a name that don't count, by name. */
  skippedSets: Map<string, number[]>;
}

class NameChecker {
  readonly errors: CheckError[] = [];
  /** The lines found with an error in this pass: each counts as absent from then on. */
  readonly failed = new Set<number>();
  private readonly topLevel: Bindings = new Map();
  /** Top-level declarations that don't count, by name: the first line of each. */
  private readonly skippedTopLevel = new Map<string, number>();
  /** Skipped `[global{…}]`s, by name: without one, setting the name makes a local. */
  private readonly skippedGlobals = new Map<string, number>();
  /** Names declared `[global{…}]`: setting one sets the global. */
  private readonly globals = new Set<string>();

  constructor(
    private readonly program: Program,
    /** Lines skipped before this stage: structure errors and lines the table couldn't read. */
    private readonly absent: ReadonlySet<number>,
    /** Lines found with an error by the last pass: their names don't make locals. */
    private readonly lastFailed: ReadonlySet<number>,
  ) {
    for (const declaration of program.declarations) {
      const name = declaredName(declaration);
      if (!name) continue;
      if (absent.has(declaration.line)) {
        if (!this.skippedTopLevel.has(name.key)) this.skippedTopLevel.set(name.key, declaration.line);
        if (declaration.type === "global" && !this.skippedGlobals.has(name.key)) this.skippedGlobals.set(name.key, declaration.line);
        continue;
      }
      bind(this.topLevel, name, declaration.line);
      if (declaration.type === "global") this.globals.add(name.key);
    }
  }

  private gone(line: number): boolean {
    return this.absent.has(line) || this.failed.has(line);
  }

  check(): void {
    for (const declaration of this.program.declarations) {
      if (declaration.type !== "define" && declaration.type !== "on") continue;
      if (this.absent.has(declaration.line)) continue;
      const scope = this.scope(declaration);
      const set = new Set(scope.params.keys());
      this.statements(declaration.body, scope, set);
    }
  }

  private scope(declaration: Declaration & { type: "define" | "on" }): Scope {
    const params: Bindings = new Map();
    if (declaration.type === "define") {
      for (const param of declaration.params) if (param.name) bind(params, param.name, declaration.line);
    }
    const locals: Bindings = new Map();
    const skippedSets = new Map<string, number[]>();
    const counted = new Set([...this.absent, ...this.lastFailed]);
    walk(declaration.body, counted, (statement, gone) => {
      const name = setName(statement);
      if (!name || params.has(name.key) || this.globals.has(name.key)) return;
      if (gone) {
        const list = skippedSets.get(name.key) ?? [];
        list.push(statement.line);
        skippedSets.set(name.key, list);
      } else {
        bind(locals, name, statement.line);
      }
    });
    const title = declaration.type === "define" ? (declaration.name?.text ?? "") : declaration.card.text;
    return { title, params, locals, skippedSets };
  }

  /** Checks a body's statements in order. `set` holds the locals that may be set by now, and grows. */
  private statements(statements: readonly Statement[], scope: Scope, set: Set<string>): void {
    for (const statement of statements) this.statement(statement, scope, set);
  }

  private statement(statement: Statement, scope: Scope, set: Set<string>): void {
    if (this.gone(statement.line)) return;
    const line = statement.line;
    switch (statement.type) {
      case "set":
        if (!this.values([statement.value], line, scope, set, statement.name)) return;
        if (statement.name) set.add(statement.name.key);
        return;
      case "setProp":
        this.values([statement.target, statement.value], line, scope, set);
        return;
      case "expression":
      case "return":
        this.values([statement.value], line, scope, set);
        return;
      case "repeat":
      case "for": {
        const value = statement.type === "repeat" ? statement.count : statement.iterable;
        if (!this.values([value], line, scope, set, statement.type === "for" ? statement.name : null)) return;
        if (statement.type === "for" && statement.name) set.add(statement.name.key);
        // A later pass round the loop sees what the body sets.
        walk(statement.body, this.absent, (s, gone) => {
          const name = setName(s);
          if (name && !gone) set.add(name.key);
        });
        this.statements(statement.body, scope, set);
        return;
      }
      case "if": {
        const entry = new Set(set);
        for (const branch of statement.branches) {
          if (this.gone(branch.line)) return;
          if (!this.values([branch.condition], branch.line, scope, entry)) return;
          const inBranch = new Set(entry);
          this.statements(branch.body, scope, inBranch);
          for (const key of inBranch) set.add(key);
        }
        return;
      }
      case "invalid":
        return;
    }
  }

  /**
   * Checks the names in a line's values. Returns whether they all resolve;
   * the line fails if not. `sets` is the name the line itself sets, which is
   * a local at that line even when the line fails.
   */
  private values(
    values: readonly (Expr | null)[],
    line: number,
    scope: Scope,
    set: ReadonlySet<string>,
    sets: Name | null = null,
  ): boolean {
    const names: Name[] = [];
    for (const value of values) if (value) namesIn(value, names);
    let ok = true;
    for (const name of names) {
      const error = this.resolve(name, line, scope, set, sets);
      if (error) {
        this.errors.push(error);
        ok = false;
      }
    }
    if (!ok) this.failed.add(line);
    return ok;
  }

  /** The error a bare name gives at `line`, or `null` when it resolves. */
  private resolve(name: Name, line: number, scope: Scope, set: ReadonlySet<string>, sets: Name | null): CheckError | null {
    const key = name.key;
    if (scope.params.has(key)) return null;
    const local = scope.locals.get(key) ?? (sets?.key === key && !this.globals.has(key) ? sets : undefined);
    if (local && !this.globals.has(key)) {
      if (set.has(key)) return null;
      const followsFrom = this.skippedSetBefore(scope, key, line) ?? this.skippedGlobals.get(key) ?? null;
      return nameError(line, name, `${local.text} is a local of ${scope.title}, not set yet`, followsFrom, null);
    }
    if (this.topLevel.has(key) || builtinNames.includes(key)) return null;
    const followsFrom = this.skippedSetBefore(scope, key, line) ?? this.skippedTopLevel.get(key) ?? null;
    const suggestion = this.suggest(name, scope, set);
    const message = suggestion ? `${name.text} is not defined. Did you mean ${suggestion.name}?` : `${name.text} is not defined`;
    return nameError(line, name, message, followsFrom, suggestion);
  }

  /** The nearest line above `line` that would have set `key`, but is skipped. */
  private skippedSetBefore(scope: Scope, key: string, line: number): number | null {
    const before = (scope.skippedSets.get(key) ?? []).filter((l) => l < line);
    return before.length > 0 ? Math.max(...before) : null;
  }

  /** The visible name closest to `name`: parameters, locals set by now, then the file's declarations, then builtins. */
  private suggest(name: Name, scope: Scope, set: ReadonlySet<string>): CheckError["suggestion"] {
    const candidates = new Map<string, Binding | null>();
    for (const [key, binding] of scope.params) candidates.set(key, binding);
    const locals = [...scope.locals].filter(([key]) => set.has(key)).sort((a, b) => a[1].line - b[1].line);
    for (const [key, binding] of locals) if (!candidates.has(key)) candidates.set(key, binding);
    for (const [key, binding] of this.topLevel) if (!candidates.has(key)) candidates.set(key, binding);
    for (const key of builtinNames) if (!candidates.has(key)) candidates.set(key, null);
    const best = closest(name.key, [...candidates.keys()]);
    if (best === null) return null;
    const binding = candidates.get(best)!;
    return binding ? { name: binding.text, spans: binding.spans } : { name: best, spans: [] };
  }
}

function nameError(
  line: number,
  name: Name,
  message: string,
  followsFrom: number | null,
  suggestion: CheckError["suggestion"],
): CheckError {
  return { kind: "NameError", message, stage: firstStage("NameError"), line, spans: [name.span], followsFrom, suggestion };
}

/** The bare names a value reads: the first name of each `[get]` and of each `[call]` with no receiver. */
function namesIn(expr: Expr, into: Name[]): void {
  switch (expr.type) {
    case "get":
      into.push(expr.path[0]);
      return;
    case "call":
      if (expr.receiver) namesIn(expr.receiver, into);
      else into.push(expr.path[0]);
      for (const arg of expr.args) namesIn(arg, into);
      return;
    case "getProp":
      namesIn(expr.object, into);
      return;
    case "binary":
      namesIn(expr.left, into);
      namesIn(expr.right, into);
      return;
    case "not":
      namesIn(expr.operand, into);
      return;
    case "group":
      namesIn(expr.value, into);
      return;
    default:
      return;
  }
}

/**
 * Checks the program's names. `absent` holds the lines skipped before this
 * stage. Lines found with an error count as absent too, and since that can
 * change which names are locals, it checks again until nothing changes.
 */
export function checkNames(program: Program, absent: ReadonlySet<number>): { errors: CheckError[]; failed: Set<number> } {
  let lastFailed = new Set<number>();
  for (let pass = 0; ; pass += 1) {
    const checker = new NameChecker(program, absent, lastFailed);
    checker.check();
    const same = checker.failed.size === lastFailed.size && [...checker.failed].every((l) => lastFailed.has(l));
    if (same || pass >= 10) return { errors: checker.errors, failed: checker.failed };
    lastFailed = checker.failed;
  }
}
