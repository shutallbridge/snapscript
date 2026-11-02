// The compiler (#106): the checker's program in, JS out. It runs where the
// checker does (the table app's main process) and never parses again. The JS
// it gives calls the runtime library through `rt`, and leaves out every line
// the checker skips. Each call keeps its card's text position.
import type { CheckedProgram, Declaration, Expr, Name, Param, Span, Statement } from "@snapscript/checker";

/** A module whose `[extern(…)]`s need a native module: its id, and the `.js` file beside it. */
export interface NativeModuleFile {
  id: string;
  path: string;
}

/** One module to compile: the entry program has no id. */
interface Unit {
  id: string | null;
  program: CheckedProgram;
  /** How a library error names it: a package by its name, a file by its own, `null` for the entry program. */
  library: string | null;
}

const fileName = (id: string): string => (id.split(/[\\/]/).pop() ?? id).replace(/\.snap$/, "");

/** The library an import loads: the package it names, or the file's name for a path. */
function libraryOf(program: CheckedProgram, line: number, id: string): string {
  const d = program.declarations.find((x) => x.type === "import" && x.line === line);
  return d?.type === "import" && !/^\.\.?\//.test(d.source) ? d.source : fileName(id);
}

/** Every module the program loads, an imported module before the module importing it, the entry last. */
function unitsOf(program: CheckedProgram): Unit[] {
  const units: Unit[] = [];
  const seen = new Set<string>();
  const visit = (unit: Unit): void => {
    for (const m of unit.program.modules) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      visit({ id: m.id, program: m.program, library: libraryOf(unit.program, m.line, m.id) });
    }
    units.push(unit);
  };
  visit({ id: null, program, library: null });
  return units;
}

/** The modules the program loads that declare `[extern(…)]`s, with the native module beside each. */
export function nativeModulesOf(program: CheckedProgram): NativeModuleFile[] {
  return unitsOf(program)
    .filter((u): u is Unit & { id: string } => u.id !== null)
    .filter((u) => u.program.declarations.some((d) => d.type === "extern" && !u.program.skippedLines.includes(d.line)))
    .map((u) => ({ id: u.id, path: u.id.replace(/\.snap$/, "") + ".js" }));
}

/**
 * Compiles a checked program, with every module it imports, to JS for the
 * runtime library's `run`.
 */
export function compile(program: CheckedProgram): string {
  const units = unitsOf(program);
  const index = new Map(units.map((u, i) => [u.id, i]));
  const out: string[] = ['"use strict";'];
  units.forEach((unit, i) => out.push(new ModuleCompiler(unit, i, index).compile()));
  return out.join("\n");
}

const str = (s: string): string => JSON.stringify(s);
const local = (key: string): string => `v_${key}`;

/** The names a function's body can see as its own. */
interface Scope {
  /** How messages name the function: `draw`, or `[on(load)]`. */
  title: string;
  params: ReadonlySet<string>;
  locals: ReadonlySet<string>;
}

class ModuleCompiler {
  private readonly skipped: ReadonlySet<number>;
  /** The module's top-level declarations that count, by name key. */
  private readonly topLevel = new Set<string>();
  private readonly globals = new Set<string>();
  private readonly module: string;
  private temps = 0;

  constructor(
    private readonly unit: Unit,
    private readonly at: number,
    private readonly index: ReadonlyMap<string | null, number>,
  ) {
    this.skipped = new Set(unit.program.skippedLines);
    this.module = `M${at}`;
    for (const d of this.declarations()) {
      const name = d.type === "import" ? d.binding : d.type === "on" ? null : d.name;
      if (name) this.topLevel.add(name.key);
      if (d.type === "global" && d.name) this.globals.add(d.name.key);
    }
  }

  private declarations(): Declaration[] {
    return this.unit.program.declarations.filter((d) => !this.skipped.has(d.line));
  }

  compile(): string {
    const { id, library } = this.unit;
    const name = id === null ? "main" : fileName(id);
    const out = [`const ${this.module} = rt.module(${id === null ? "null" : str(id)}, ${str(name)}, ${library === null ? "null" : str(library)});`];
    for (const d of this.declarations()) out.push(this.declaration(d));
    return out.filter((s) => s !== "").join("\n");
  }

  private declaration(d: Declaration): string {
    const m = this.module;
    switch (d.type) {
      case "import": {
        const loaded = this.unit.program.modules.find((x) => x.line === d.line);
        if (!d.binding) return "";
        const value = loaded ? `M${this.index.get(loaded.id)}` : `rt.missing(${str(d.source)})`;
        return `rt.setAttr(${m}, ${str(d.binding.key)}, ${str(d.binding.text)}, ${value});`;
      }
      case "global":
        if (!d.name) return "";
        return `rt.setAttr(${m}, ${str(d.name.key)}, ${str(d.name.text)}, ${d.value ? this.expr(d.value, null) : "null"});`;
      case "extern":
        if (!d.name) return "";
        return `rt.extern(${m}, ${str(d.name.key)}, ${str(d.name.text)}, ${d.params.length});`;
      case "define": {
        if (!d.name) return "";
        const scope = this.scope(d.name.text, d.params, d.body);
        const params = d.params.filter((p): p is Param & { name: Name } => p.name !== null);
        const required = params.filter((p) => p.type === "required").length;
        const defaults = params
          .filter((p) => p.type === "optional")
          .map((p) => `if (${local(p.name.key)} === rt.MISSING) ${local(p.name.key)} = ${p.default ? this.expr(p.default, scope) : "null"};`);
        const fn = `(${params.map((p) => local(p.name.key)).join(", ")}) => {\n${[...this.locals(scope), ...defaults, this.body(d.body, scope), "return null;"].join("\n")}\n}`;
        return `rt.define(${m}, ${str(d.name.key)}, ${str(d.name.text)}, ${required}, ${params.length}, ${fn});`;
      }
      case "on": {
        if (!d.event) return "";
        const scope = this.scope(`[on(${d.event.text})]`, [], d.body);
        return `rt.on(${m}, ${str(d.event.key)}, () => {\n${[...this.locals(scope), this.body(d.body, scope)].join("\n")}\n});`;
      }
    }
  }

  /** A function's scope: its parameters, and every name it sets on a line that counts and the file doesn't declare global. */
  private scope(title: string, params: readonly Param[], body: readonly Statement[]): Scope {
    const own = new Set(params.flatMap((p) => (p.name ? [p.name.key] : [])));
    const locals = new Set<string>();
    const visit = (statements: readonly Statement[]): void => {
      for (const s of statements) {
        if (this.skipped.has(s.line)) continue;
        if ((s.type === "set" || s.type === "for") && s.name && !own.has(s.name.key) && !this.globals.has(s.name.key)) locals.add(s.name.key);
        if (s.type === "repeat" || s.type === "for") visit(s.body);
        if (s.type === "if") for (const b of s.branches) visit(b.body);
      }
    };
    visit(body);
    return { title, params: own, locals };
  }

  private locals(scope: Scope): string[] {
    return [...scope.locals].map((key) => `let ${local(key)} = rt.UNSET;`);
  }

  private body(statements: readonly Statement[], scope: Scope): string {
    return statements
      .filter((s) => !this.skipped.has(s.line))
      .map((s) => this.statement(s, scope))
      .filter((s) => s !== "")
      .join("\n");
  }

  private statement(s: Statement, scope: Scope): string {
    const value = (e: Expr | null): string => (e ? this.expr(e, scope) : "null");
    switch (s.type) {
      case "set":
        return s.name ? this.assign(s.name, value(s.value), scope) : "";
      case "setProp":
        return s.name ? `rt.setProp(${this.expr(s.target, scope)}, ${str(s.name.key)}, ${str(s.name.text)}, ${value(s.value)}, ${this.module});` : "";
      case "expression":
        return s.value ? `${this.expr(s.value, scope)};` : "";
      case "return":
        return `return ${value(s.value)};`;
      case "repeat": {
        const n = `t${this.temps++}`;
        const i = `t${this.temps++}`;
        return `for (let ${n} = rt.count(${value(s.count)}, ${this.atValue(s.count)}), ${i} = 0; ${i} < ${n}; ${i}++) {\n${this.loop(s, s.count)}${this.body(s.body, scope)}\n}`;
      }
      case "for": {
        const item = `t${this.temps++}`;
        const assign = s.name ? this.assign(s.name, item, scope) : "";
        return `for (const ${item} of rt.items(${value(s.iterable)}, ${this.atValue(s.iterable)})) {\n${this.loop(s, s.iterable)}${assign}\n${this.body(s.body, scope)}\n}`;
      }
      case "if": {
        const parts: string[] = [];
        for (const b of s.branches) {
          // Skipping a branch skips it and every later branch of its chain.
          if (this.skipped.has(b.line)) break;
          const body = `{\n${this.body(b.body, scope)}\n}`;
          parts.push(b.type === "else" ? `else ${body}` : `${b.type === "if" ? "if" : "else if"} (rt.truthy(${value(b.condition)})) ${body}`);
        }
        return parts.join(" ");
      }
      case "invalid":
        return "";
    }
  }

  /** Each time round, an entry program's loop marks its head card (the cards before its value), for a frozen sketch. */
  private loop(s: Statement, value: Expr | null): string {
    if (this.unit.id !== null) return "";
    return `rt.loop(${s.span.start}, ${value?.span.start ?? s.span.end});\n`;
  }

  private assign(name: Name, value: string, scope: Scope): string {
    if (scope.params.has(name.key) || scope.locals.has(name.key)) return `${local(name.key)} = ${value};`;
    return `rt.setAttr(${this.module}, ${str(name.key)}, ${str(name.text)}, ${value});`;
  }

  /** A position the runtime keeps: the module and the card's span in its text. */
  private at_(span: Span): string {
    return `${this.at}, ${span.start}, ${span.end}`;
  }

  /** A value's position, where a statement that takes it blames its errors. */
  private atValue(e: Expr | null): string {
    return e ? this.at_(e.span) : `${this.at}, 0, 0`;
  }

  /** A bare name, where the cards are written: the function's own names, the file's top level, then the builtins. */
  private name(name: Name, scope: Scope | null): string {
    if (scope?.params.has(name.key)) return local(name.key);
    if (scope?.locals.has(name.key)) return `rt.local(${local(name.key)}, ${str(name.text)}, ${str(scope.title)})`;
    if (this.topLevel.has(name.key)) return `rt.getAttr(${this.module}, ${str(name.key)}, ${str(name.text)})`;
    return `rt.builtin(${str(name.key)}, ${str(name.text)})`;
  }

  private path(path: readonly Name[], scope: Scope | null): string {
    let value = this.name(path[0]!, scope);
    for (const n of path.slice(1)) value = `rt.getProp(${value}, ${str(n.key)}, ${str(n.text)}, ${this.at_(n.span)})`;
    return value;
  }

  private expr(e: Expr, scope: Scope | null): string {
    const sub = (x: Expr): string => this.expr(x, scope);
    switch (e.type) {
      case "num":
      case "bool":
        return String(e.value);
      case "str":
        return str(e.value);
      case "color":
        return `rt.color(${str(e.value)})`;
      case "none":
        return "null";
      case "root":
        return "rt.root";
      case "get":
        return this.path(e.path, scope);
      case "call": {
        const args = `[${e.args.map(sub).join(", ")}]`;
        const name = e.path[e.path.length - 1]!;
        const receiver = e.receiver ? sub(e.receiver) : e.path.length > 1 ? this.path(e.path.slice(0, -1), scope) : null;
        if (receiver === null) return `rt.call(${this.name(name, scope)}, ${args}, ${this.at_(e.card.span)})`;
        return `rt.callMethod(${receiver}, ${str(name.key)}, ${str(name.text)}, ${args}, ${this.at_(e.card.span)})`;
      }
      case "getProp":
        return `rt.getProp(${sub(e.object)}, ${str(e.name.key)}, ${str(e.name.text)}, ${this.at_(e.card.span)})`;
      case "binary":
        if (e.op === "and" || e.op === "or") {
          const t = `t${this.temps++}`;
          return e.op === "and" ? `((${t}) => rt.truthy(${t}) ? ${sub(e.right)} : ${t})(${sub(e.left)})` : `((${t}) => rt.truthy(${t}) ? ${t} : ${sub(e.right)})(${sub(e.left)})`;
        }
        return `rt.op(${str(e.op)}, ${sub(e.left)}, ${sub(e.right)}, ${this.at_(e.card.span)})`;
      case "not":
        return `!rt.truthy(${sub(e.operand)})`;
      case "group":
        return `(${sub(e.value)})`;
    }
  }
}
