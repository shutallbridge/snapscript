import { parse, type Program, type Span, type StructureError } from "@snapscript/parser";
import { checkNames, skippedLinesOf } from "./names.ts";
import { checkTypes } from "./types.ts";

export type * from "@snapscript/parser";

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
}

export interface CheckResult {
  errors: CheckError[];
  program: CheckedProgram;
}

/** A line the table couldn't read: its number (1-based), alone or with its reason. */
export type SkippedLine = number | { line: number };

/**
 * Checks program text (#106). `skippedLines` are the lines the camera
 * couldn't read; they are read for structure only, and skipped.
 */
export function check(text: string, skippedLines: readonly SkippedLine[] = []): CheckResult {
  const lines = skippedLines.map((s) => (typeof s === "number" ? s : s.line));
  const parsed = parse(text, lines);
  const structureErrors: CheckError[] = parsed.errors.map((e) => ({ ...e, followsFrom: null, suggestion: null }));
  const absent = new Set([...lines, ...structureErrors.map((e) => e.line)]);
  // A line with an error counts as absent, which can change what other lines
  // find, so names and types are checked again until the lines found settle.
  let typeFailed = new Set<number>();
  let names = checkNames(parsed.program, absent);
  let types = checkTypes(parsed.program, new Set([...absent, ...names.failed]));
  for (let pass = 0; pass < 10 && !sameLines(types.failed, typeFailed); pass += 1) {
    typeFailed = types.failed;
    names = checkNames(parsed.program, new Set([...absent, ...typeFailed]));
    types = checkTypes(parsed.program, new Set([...absent, ...names.failed]), typeFailed);
  }
  const errors = [...structureErrors, ...names.errors, ...types.errors].sort(
    (a, b) => a.line - b.line || (a.spans[0]?.start ?? 0) - (b.spans[0]?.start ?? 0),
  );
  const failed = new Set([...absent, ...names.failed, ...types.failed]);
  const program = { ...parsed.program, skippedLines: skippedLinesOf(parsed.program, failed) };
  return { errors, program };
}

const sameLines = (a: ReadonlySet<number>, b: ReadonlySet<number>): boolean => a.size === b.size && [...a].every((l) => b.has(l));
