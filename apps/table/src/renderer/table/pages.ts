// Draws every page's cut-out (#197, #114): nothing is projected on the paper, nor on a dark band
// around it with square corners, whose outer 2 mm is only dimmed (#114: 3 mm of margin for a
// skewed or lifted page, plus 2 mm dim). Drawn over everything but the settings menu.
import type { PageCut } from "../../guides.ts";

/** The band's outer part, dimmed rather than dark, and how dark it is. */
const DIM_MM = 2;
const DIM_ALPHA = 0.6;

function grown(g: CanvasRenderingContext2D, { outline: q }: PageCut, by: number): void {
  g.save();
  g.translate(q.x, q.y);
  g.rotate((q.angle * Math.PI) / 180);
  g.fillRect(-by, -by, q.width + 2 * by, q.height + 2 * by);
  g.restore();
}

export function drawPages(g: CanvasRenderingContext2D, pages: readonly PageCut[], bandMm: number): void {
  const dark = Math.max(0, bandMm - DIM_MM);
  g.fillStyle = `rgba(0, 0, 0, ${DIM_ALPHA})`;
  for (const p of pages) grown(g, p, bandMm);
  g.fillStyle = "#000";
  for (const p of pages) grown(g, p, dark);
}
