// The native module beside shapes.snap: it records each call with its values.
export const calls = [];

export function circle(context, x, y, d) {
  calls.push(["circle", x, y, d]);
}

export function fill(context, color) {
  calls.push(["fill", String(color)]);
}
