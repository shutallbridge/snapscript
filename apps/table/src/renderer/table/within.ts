// Drawing in a rectangle's own frame on the table, for the table view's layers.
import type { Quad } from "../../pose.ts";

/** Draws in a quad's own frame: its top-left at (0, 0), along x. */
export function within(g: CanvasRenderingContext2D, q: Quad, draw: () => void): void {
  g.save();
  g.translate(q.x, q.y);
  g.rotate((q.angle * Math.PI) / 180);
  draw();
  g.restore();
}
