import { parse, type Program, type StructureError } from "@snapscript/parser";

export type * from "@snapscript/parser";

/** An error `check` finds. It points at text positions only. */
export type CheckError = StructureError;

export interface CheckResult {
  errors: CheckError[];
  program: Program;
}

/** A line the table couldn't read: its number (1-based), alone or with its reason. */
export type SkippedLine = number | { line: number };

/**
 * Checks program text (#106). `skippedLines` are the lines the camera
 * couldn't read; they are read for structure only.
 */
export function check(text: string, skippedLines: readonly SkippedLine[] = []): CheckResult {
  const lines = skippedLines.map((s) => (typeof s === "number" ? s : s.line));
  const { program, errors } = parse(text, lines);
  return { errors, program };
}
