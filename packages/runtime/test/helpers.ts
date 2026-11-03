// The run-a-program seam: text → check → compile → run in a Node host →
// what the host saw. Tests never look at the generated JS.
import { once } from "node:events";
import { existsSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { Worker } from "node:worker_threads";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { check, type CheckError, type SkippedLine } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { compile, nativeModulesOf } from "@snapscript/runtime/compiler";
import { run, type Host, type NativeModule, type Run, type RunError } from "@snapscript/runtime";

/** Program text from lines. */
export const lines = (...text: string[]): string => `${text.join("\n")}\n`;

/** The fixture projects' folder: each holds `.snap` files and their native `.js` modules. */
export const fixtures: string = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** Where a card is in the program text: its line (1-based) and the card as written. */
export interface At {
  line: number;
  card: string;
}

export interface Seen {
  /** What `check` found. */
  checkErrors: Pick<CheckError, "kind" | "line" | "message">[];
  /** Each `print`, with the card it came from. */
  prints: { text: string; at: At | null }[];
  errors: (Omit<RunError, "span"> & { at: At | null })[];
  frames: number;
  /** The text position another thread read while the run was stuck, when it was given a time limit. */
  stuck: At | null;
}

/** The native module beside a fixture `.snap` file, as the Node host loads it. */
export async function nativeOf(path: string): Promise<NativeModule & { calls: unknown[][] }> {
  return import(pathToFileURL(join(fixtures, path)).href);
}

/** What the host does after the run's load. */
export interface After {
  /** Something calling back into the program later, as a library's frames do. */
  then?: () => unknown;
  /** Stops the run from outside, at the end. */
  stop?: boolean;
  /**
   * Stops a run whose load is still going after this many ms, as the table
   * does a frozen sketch. Halfway through, another thread reads the position.
   */
  limit?: number;
}

/** Another thread that reads the run's position from shared memory once, `ms` after it's told to. */
async function watcher(position: Int32Array, ms: number): Promise<{ start: () => void; read: Promise<number[]> }> {
  const code = `
    const { parentPort, workerData } = require("node:worker_threads");
    parentPort.once("message", () => setTimeout(() => parentPort.postMessage([...new Int32Array(workerData)]), ${ms}));`;
  const worker = new Worker(code, { eval: true, workerData: position.buffer });
  await once(worker, "online");
  const read = once(worker, "message").then(([seen]) => seen as number[]);
  void read.finally(() => worker.terminate());
  return { start: () => worker.postMessage("go"), read };
}

/** Runs program text as `main.snap` in the fixtures folder, in a Node host. */
export async function runProgram(text: string, skipped: SkippedLine[] = [], after: After = {}): Promise<Seen> {
  const id = join(fixtures, "main.snap");
  const result = check(text, skipped, { loader: diskLoader(fixtures), id });
  const js = compile(result.program);
  const natives = new Map<string, NativeModule>();
  for (const native of nativeModulesOf(result.program)) {
    if (!existsSync(native.path)) continue;
    const module = await import(pathToFileURL(native.path).href);
    module.calls?.splice(0);
    natives.set(native.id, module);
  }
  const at = (span: { start: number; end: number } | null): At | null =>
    span && { line: text.slice(0, span.start).split("\n").length, card: text.slice(span.start, span.end) };
  const seen: Seen = { checkErrors: result.errors.map(({ kind, line, message }) => ({ kind, line, message })), prints: [], errors: [], frames: 0, stuck: null };
  const position = new Int32Array(new SharedArrayBuffer(8));
  const watching = after.limit ? await watcher(position, after.limit / 2) : null;
  const host: Host = {
    natives: (moduleId) => natives.get(moduleId) ?? null,
    output: {
      print: ({ text, span }) => seen.prints.push({ text, at: at(span) }),
      error: ({ span, ...error }) => seen.errors.push({ ...error, at: at(span) }),
      frame: () => {
        seen.frames += 1;
      },
    },
    position,
  };
  let started: Run | null = null;
  if (watching) {
    watching.start();
    try {
      started = runInNewContext("go()", { go: () => run(js, host) }, { timeout: after.limit });
    } catch {
      // Stopped as frozen.
    }
    const [start, end] = await watching.read;
    seen.stuck = start! < 0 ? null : at({ start: start!, end: end! });
  } else started = run(js, host);
  await after.then?.();
  if (after.stop) started?.stop();
  return seen;
}

/** Just the printed text, one entry per `print`. */
export const printed = async (text: string, skipped: SkippedLine[] = []): Promise<string[]> =>
  (await runProgram(text, skipped)).prints.map((p) => p.text);
