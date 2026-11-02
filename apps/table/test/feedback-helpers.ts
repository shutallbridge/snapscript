// The card feedback tests' table (#195): projects/confetti, so library cards light too, and strips
// laid with each card's length from the language markers or the lockfile.
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import type { Span } from "@snapscript/checker";
import { run, type Host, type RunError } from "@snapscript/runtime";
import type { TableCard } from "@snapscript/table-reader";
import { loadProject } from "../src/project.ts";
import type { Quad } from "../src/feedback.ts";
import type { SessionProject } from "../src/session.ts";
import { card, U, type Laid } from "./session-helpers.ts";

export const confetti: SessionProject = loadProject(fileURLToPath(new URL("../../../projects/confetti/", import.meta.url)));

/** A library card's marker in confetti's lockfile, by its name (`circle`). */
export function libraryMarker(name: string): number {
  for (const [id, entry] of confetti.lockfile) if (entry.kind === "library" && entry.name === name) return id;
  throw new Error(`no ${name} in confetti's lockfile`);
}

/** A card's length in U, by its marker. */
export function lengthOf(marker: number): number {
  const entry = confetti.lockfile.get(marker);
  return confetti.languageMarkers.get(marker)?.length ?? (entry?.kind === "library" ? entry.length : 2);
}

/** As `strip` in the session helpers, with library cards too: the head at (x, y), each line under it. */
export function lay(track: number, x: number, y: number, head: Laid, ...lines: Laid[][]): TableCard[] {
  const cards = [card(track, head[0], x, y, head[1])];
  lines.forEach((line, i) => {
    let along = x;
    for (const [m, text] of line) {
      cards.push(card(track + cards.length, m, along, y + (i + 1) * U, text));
      along += lengthOf(m) * U;
    }
  });
  return cards;
}

/** A card's marker zone on the table: the 17 mm at its left end, all the way across. */
export function markerZone(c: TableCard): Quad {
  const a = (c.angle * Math.PI) / 180;
  const [ux, uy] = [Math.cos(a), Math.sin(a)];
  return { x: c.x - 8.5 * ux + 15 * uy, y: c.y - 8.5 * uy - 15 * ux, angle: c.angle, width: 17, height: U };
}

type Vec = [number, number];
const corners = (q: Quad): Vec[] => {
  const a = (q.angle * Math.PI) / 180;
  const u: Vec = [Math.cos(a), Math.sin(a)];
  const v: Vec = [-u[1], u[0]];
  return [
    [0, 0],
    [q.width, 0],
    [q.width, q.height],
    [0, q.height],
  ].map(([s, t]) => [q.x + s! * u[0] + t! * v[0], q.y + s! * u[1] + t! * v[1]]);
};

/** Whether two rectangles on the table share any area (separating axes). */
export function overlap(p: Quad, q: Quad): boolean {
  const [P, Q] = [corners(p), corners(q)];
  for (const poly of [P, Q])
    for (let i = 0; i < 4; i++) {
      const a = poly[i]!;
      const b = poly[(i + 1) % 4]!;
      const n: Vec = [b[1] - a[1], a[0] - b[0]];
      const along = (vs: Vec[]) => vs.map((w) => w[0] * n[0] + w[1] * n[1]);
      const [pp, qq] = [along(P), along(Q)];
      if (Math.max(...pp) <= Math.min(...qq) + 1e-9 || Math.max(...qq) <= Math.min(...pp) + 1e-9) return false;
    }
  return true;
}

/** Runs a start command's JS with native functions that do nothing but `name`, which throws `message`, and gives the errors it reports. */
export function libraryErrors(js: string, name: string, message: string): RunError[] {
  const errors: RunError[] = [];
  const fail = () => {
    throw new Error(message);
  };
  const broken = new Proxy({}, { get: (_, key) => (key === "then" ? undefined : key === name ? fail : () => null) });
  run(js, { natives: () => broken, output: { print() {}, error: (e) => errors.push(e), frame() {} } });
  return errors;
}

/** Runs a start command's JS until it has been stuck for 100 ms, and gives the text position it is stuck at. */
export function stuckAt(js: string): Span {
  const position = new Int32Array(new SharedArrayBuffer(8));
  const host: Host = { natives: () => null, output: { print() {}, error() {}, frame() {} }, position };
  try {
    runInNewContext("go()", { go: () => run(js, host) }, { timeout: 100 });
  } catch {
    // Stopped as frozen.
  }
  return { start: Atomics.load(position, 0), end: Atomics.load(position, 1) };
}

/** Runs a start command's JS with no native modules, and gives what it printed, as the sketch view sends it. */
export function printsOf(js: string): { text: string; span: Span | null }[] {
  const prints: { text: string; span: Span | null }[] = [];
  run(js, { natives: () => null, output: { print: (p) => prints.push(p), error() {}, frame() {} } });
  return prints;
}
