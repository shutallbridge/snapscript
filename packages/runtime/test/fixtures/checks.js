// The native module beside checks.snap: positive blames the program with a
// ValueError, broken breaks as a library's own code can, and later keeps a
// function for the host to call after the run's load (as p5's frames do).
import { ValueError } from "@snapscript/runtime";

export const calls = [];

export function positive(context, n) {
  calls.push(["positive", n]);
  if (n <= 0) throw new ValueError(`${n} is not positive`);
  return n;
}

export function broken(context) {
  calls.push(["broken"]);
  return undefined.size;
}

let kept = null;

export function later(context, fn) {
  kept = () => context.call(fn);
}

/** The host calling back into the program after the run's load. */
export function fire() {
  kept?.();
}
