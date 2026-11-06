// The native module beside p5.snap: one function per [extern(…)] name. It runs
// p5 in instance mode, in the sketch's container.
import type { NativeContext, Value } from "@snapscript/runtime";

/** The part of a p5 instance the library uses. */
interface P5Instance {
  setup?: () => void;
  draw?: () => void;
  /** How many frames p5 has drawn, counting the one it is drawing. */
  readonly frameCount: number;
  createCanvas(width: number, height: number): unknown;
  background(color: string): unknown;
  noStroke(): unknown;
  fill(color: string): unknown;
  rect(x: number, y: number, width: number, height: number): unknown;
  circle(x: number, y: number, d: number): unknown;
  noise(x: number, y: number): number;
  noLoop(): unknown;
}

/** p5's constructor, in instance mode: `new p5(sketch, container)`. */
export type P5Constructor = new (sketch: (p: P5Instance) => void, container?: unknown) => unknown;

let P5: P5Constructor | null = null;
let container: unknown;
/** The instance the program draws on, once `run` has made it. */
let p: P5Instance | null = null;

/**
 * The sketch process gives the library p5 and the element to draw in, before
 * it runs the program. Without it, `run` uses the global `p5` that p5's own
 * script sets, and p5 draws in the page's body.
 */
export function mount(constructor: P5Constructor, element?: unknown): void {
  P5 = constructor;
  container = element;
}

const instance = (): P5Instance => {
  if (!p) throw new Error("the canvas isn't made yet");
  return p;
};

/** A colour value reaches p5 as its CSS name. */
const css = (color: Value): string => String(color);

export function run(context: NativeContext, program: Value): void {
  const constructor = P5 ?? (globalThis as { p5?: P5Constructor }).p5;
  if (!constructor) throw new Error("p5 isn't loaded");
  const setup = context.function(program, "setup");
  const draw = context.function(program, "draw");
  new constructor((sketch) => {
    p = sketch;
    sketch.setup = () => {
      if (setup) context.call(setup);
    };
    // p5.frameCount, the library's global, follows p5's own count.
    sketch.draw = () => {
      context.setGlobal("frameCount", sketch.frameCount);
      if (draw) context.call(draw);
      context.frame();
    };
  }, container);
}

export function createCanvas(_context: NativeContext, width: Value, height: Value): void {
  instance().createCanvas(width as number, height as number);
}

export function background(_context: NativeContext, color: Value): void {
  instance().background(css(color));
}

export function noStroke(_context: NativeContext): void {
  instance().noStroke();
}

export function fill(_context: NativeContext, color: Value): void {
  instance().fill(css(color));
}

export function rect(_context: NativeContext, x: Value, y: Value, width: Value, height: Value): void {
  instance().rect(x as number, y as number, width as number, height as number);
}

export function circle(_context: NativeContext, x: Value, y: Value, d: Value): void {
  instance().circle(x as number, y as number, d as number);
}

export function noise(_context: NativeContext, x: Value, y: Value): number {
  return instance().noise(x as number, y as number);
}

/** The run stopped (its `[on(stop)]`): p5 draws no more frames. The canvas keeps what it drew. */
export function noLoop(_context: NativeContext): void {
  p?.noLoop();
}
