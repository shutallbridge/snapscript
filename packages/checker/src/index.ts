import { parse, type Program, type Span, type StructureError } from "@snapscript/parser";
import { Modules, type ImportedModules, type LoadedModule, type Member, type ModuleInfo, type ModuleLoader } from "./modules.ts";
import { checkNames, skippedLinesOf } from "./names.ts";
import { checkTypes, signaturesOf, type CallExpects } from "./types.ts";

export type * from "@snapscript/parser";
export type { LoadedModule, ModuleLoader } from "./modules.ts";

/** An error `check` finds. It points at text positions only. */
export interface CheckError extends StructureError {
  /** The skipped line this error comes from, when it is a follow-on error; `null` otherwise. */
  followsFrom: number | null;
  /** The name a `NameError` suggests, as declared, and the spans of every declaration of it. */
  suggestion: { name: string; spans: Span[] } | null;
}

/** The checked tree, with the lines it skips. */
export interface CheckedProgram extends Program {
  /**
   * Every line (1-based) of the program that is skipped: a line with an error,
   * a line the table couldn't read, and the lines their skips take with them.
   */
  skippedLines: number[];
  /**
   * The module each import line that counts loads, in text order. Only
   * filled when the check has a loader. The runtime's compiler takes these.
   */
  modules: CheckedModule[];
}

/** A module an import line loads: its id from the loader, and its checked program. */
export interface CheckedModule {
  /** The import line (1-based). */
  line: number;
  id: string;
  program: CheckedProgram;
}

/** One way to call a function: the names of its values in order, and of a slot that takes any number. */
export interface ExpectedOverload {
  values: string[];
  variadic: string | null;
}

/** The values a call card's function expects after it: the table app's value guides. */
export interface ExpectedValues {
  /** The call card, as a stretch of the text. */
  span: Span;
  /** The call card's line (1-based), and its columns in that line (from 0, end exclusive). */
  at: { line: number; start: number; end: number };
  /** The function, as declared. */
  name: string;
  /** Each way it can be called, in the order declared. */
  overloads: ExpectedOverload[];
}

export interface CheckResult {
  errors: CheckError[];
  program: CheckedProgram;
  /** Every call card whose function is known, skipped lines' included, in text order. */
  expectedValues: ExpectedValues[];
}

/** A line the table couldn't read: its number (1-based), alone or with its reason. */
export type SkippedLine = number | { line: number };

export interface CheckOptions {
  /** Loads what the program imports. Without one, imports aren't loaded, and a module's attributes can be anything. */
  loader?: ModuleLoader;
  /** The id the loader knows the checked text by, so that importing it back is found. */
  id?: string;
}

/**
 * Checks program text (#106). `skippedLines` are the lines the camera
 * couldn't read; they are read for structure only, and skipped.
 */
export function check(text: string, skippedLines: readonly SkippedLine[] = [], options: CheckOptions = {}): CheckResult {
  const { loader } = options;
  const modules: Modules | null = loader
    ? new Modules(loader, (module: LoadedModule) => moduleInfo(module.id, checkText(module.text, [], modules, module.id)))
    : null;
  return checkText(text, skippedLines, modules, options.id ?? null).result;
}

interface Checked {
  result: CheckResult;
  imports: ImportedModules;
}

function checkText(text: string, skippedLines: readonly SkippedLine[], modules: Modules | null, id: string | null): Checked {
  const lines = skippedLines.map((s) => (typeof s === "number" ? s : s.line));
  const parsed = parse(text, lines);
  const structureErrors: CheckError[] = parsed.errors.map((e) => ({ ...e, followsFrom: null, suggestion: null }));
  const before = new Set([...lines, ...structureErrors.map((e) => e.line)]);
  const loaded = modules ? modules.imports(parsed.program, before, id) : { errors: [], modules: new Map() };
  const absent = new Set([...before, ...loaded.errors.map((e) => e.line)]);
  // A line with an error counts as absent, which can change what other lines
  // find, so names and types are checked again until the lines found settle.
  let typeFailed = new Set<number>();
  let names = checkNames(parsed.program, absent);
  let types = checkTypes(parsed.program, new Set([...absent, ...names.failed]), typeFailed, loaded.modules);
  for (let pass = 0; pass < 10 && !sameLines(types.failed, typeFailed); pass += 1) {
    typeFailed = types.failed;
    names = checkNames(parsed.program, new Set([...absent, ...typeFailed]));
    types = checkTypes(parsed.program, new Set([...absent, ...names.failed]), typeFailed, loaded.modules);
  }
  const errors = [...structureErrors, ...loaded.errors, ...names.errors, ...types.errors].sort(
    (a, b) => a.line - b.line || (a.spans[0]?.start ?? 0) - (b.spans[0]?.start ?? 0),
  );
  const failed = new Set([...absent, ...names.failed, ...types.failed]);
  const skipped = skippedLinesOf(parsed.program, failed);
  const imported: CheckedModule[] = [];
  for (const [d, info] of loaded.modules) {
    if (info && !skipped.includes(d.line)) imported.push({ line: d.line, id: info.id, program: info.program });
  }
  imported.sort((a, b) => a.line - b.line);
  const program = { ...parsed.program, skippedLines: skipped, modules: imported };
  const expectedValues = types.expects.sort((a, b) => a.card.start - b.card.start).map((e) => expected(text, e));
  return { result: { errors, program, expectedValues }, imports: loaded.modules };
}

/** A module's attributes: its top-level declarations on lines that aren't skipped. */
function moduleInfo(id: string, { result, imports }: Checked): ModuleInfo {
  const skipped = new Set(result.program.skippedLines);
  const attributes = new Map<string, Member>();
  for (const d of result.program.declarations) {
    if (skipped.has(d.line)) continue;
    switch (d.type) {
      case "define":
      case "extern": {
        if (!d.name) break;
        const found = attributes.get(d.name.key);
        const overloads = [...(found?.type === "function" ? found.overloads : []), ...signaturesOf(d.params)];
        attributes.set(d.name.key, { type: "function", text: found?.type === "function" ? found.text : d.name.text, overloads });
        break;
      }
      case "global":
        if (d.name) attributes.set(d.name.key, { type: "value" });
        break;
      case "import":
        if (d.binding) attributes.set(d.binding.key, { type: "module", text: d.binding.text, module: imports.get(d) ?? null });
        break;
    }
  }
  return { id, attributes, program: result.program };
}

function expected(text: string, { card, name, overloads }: CallExpects): ExpectedValues {
  const lineStart = text.lastIndexOf("\n", card.start - 1) + 1;
  const line = text.slice(0, lineStart).split("\n").length;
  return {
    span: card,
    at: { line, start: card.start - lineStart, end: card.end - lineStart },
    name,
    overloads: overloads.map((s) => ({ values: s.params.map((p) => p.name), variadic: s.variadic?.name ?? null })),
  };
}

const sameLines = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => a.size === b.size && [...a].every((l) => b.has(l));
