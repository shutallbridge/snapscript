// Calibration's look (#132): black over the whole picture, the sketch included, then the step. The
// markers come in projector heights and everything else in table mm; the table view draws in mm,
// so a projector height is the work area's height.
import { markerPattern } from "@snapscript/faces";
import type { CalibrationView, Point } from "../../calibration.ts";
import type { TableGeometry } from "../../layout.ts";

/** An app px, in mm. */
const PX = 30 / 50;
const TEXT_PX = 18;
const OUTLINE = "#22d3ee";
const PAGE = "#e879f9";
const BOX = "#a1a1aa";
const TEXT = "#e5e7eb";
const ERROR = "#fca5a5";

function poly(g: CanvasRenderingContext2D, points: Point[], colour: string, width: number, dash: number[] = []): void {
  g.beginPath();
  points.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
  g.closePath();
  g.setLineDash(dash);
  g.strokeStyle = colour;
  g.lineWidth = width;
  g.stroke();
  g.setLineDash([]);
}

export function drawCalibration(g: CanvasRenderingContext2D, geometry: TableGeometry, view: CalibrationView): void {
  const mmPerPh = geometry.workArea.height;
  g.save();
  g.fillStyle = "#000";
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);

  if (view.step === "markers") {
    for (const m of view.markers) {
      const size = m.size * mmPerPh;
      const white = size * view.white;
      const cx = m.x * mmPerPh;
      const cy = m.y * mmPerPh;
      g.fillStyle = "#fff";
      g.fillRect(cx - white / 2, cy - white / 2, white, white);
      g.fillStyle = "#000";
      const pattern = markerPattern(m.marker);
      const cell = size / pattern.length;
      pattern.forEach((row, i) =>
        row.forEach((black, j) => {
          // A hair over a cell, so neighbouring cells draw without a seam.
          if (black) g.fillRect(cx - size / 2 + j * cell, cy - size / 2 + i * cell, cell + 0.1, cell + 0.1);
        }),
      );
    }
  }
  if (view.step === "ruler") poly(g, view.box, BOX, 1, [3, 2]);
  if (view.step === "check") {
    for (const o of view.outlines) poly(g, o, OUTLINE, 0.8);
    if (view.page) poly(g, view.page, PAGE, 0.8);
  }

  // The step's words, across the top, clear of the ruler page's box in the middle.
  g.font = `500 ${TEXT_PX * PX}px sans-serif`;
  g.textAlign = "center";
  g.textBaseline = "top";
  view.lines.forEach((line, i) => {
    g.fillStyle = line.startsWith("That didn't work") ? ERROR : TEXT;
    g.fillText(line, geometry.workArea.width / 2, 120 + i * TEXT_PX * 1.5 * PX);
  });
  g.restore();
}
