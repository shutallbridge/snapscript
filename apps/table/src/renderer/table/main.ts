// The table view's renderer: it draws in table mm, scaled by the mm per projector height that comes
// with every table state. Stacking, bottom to top (#114): the windows (the coding space here; the
// canvas space is the sketch view below, left clear) < the corners, with the scene's card look
// (#195-#197) < the help box < pages < the settings menu, drawn last.
import { U_MM, type TableGeometry } from "../../layout.ts";
import type { TableBridge } from "../../preload/table.ts";
import type { Scene } from "../../session.ts";
import { defaultTableSettings } from "../../settings.ts";
import { drawCalibration } from "./calibration.ts";
import { drawMenu } from "./menu.ts";
import "@fontsource/geist-mono/500.css";
import "@fontsource/kalam/400.css";
import { bar, drawFeedback } from "./feedback.ts";
import { drawHandwriting, STATUS } from "./handwriting.ts";
import { drawHelp, helpExtent } from "./help.ts";
import { drawPages } from "./pages.ts";
import { drawVirtual } from "./virtual.ts";

declare const table: TableBridge;

/** #114's colours: the boundary between the windows, a corner's dots. The coding space's grey is a setting. */
const BOUNDARY = "#3f3f46";
const CORNER = "#52525b";
/** Line widths and dots, in projector px. */
const LINE_PX = 2;
const DOT_PX = 3;
const GAP_PX = 6;

const canvas = document.getElementById("table") as HTMLCanvasElement;
const g = canvas.getContext("2d")!;
let geometry: TableGeometry | null = null;
/** The newest scene. */
let scene: Scene | null = null;

function draw(): void {
  canvas.width = innerWidth * devicePixelRatio;
  canvas.height = innerHeight * devicePixelRatio;
  canvas.style.width = `${innerWidth}px`;
  canvas.style.height = `${innerHeight}px`;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.clearRect(0, 0, canvas.width, canvas.height);
  if (!geometry) return;
  const k = geometry.pxPerMm * devicePixelRatio;
  const px = 1 / geometry.pxPerMm;
  g.setTransform(k, 0, 0, k, 0, 0);
  const { codingSpace, corners } = geometry.layout;

  // Calibration covers everything, the sketch too.
  if (scene?.calibration) return drawCalibration(g, geometry, scene.calibration);

  // The windows: the coding space filled, and the boundary a card counts by. In full screen the
  // canvas covers the table, and cards still count where the coding space would be.
  if (!geometry.fullScreen) {
    const grey = (scene?.settings ?? defaultTableSettings).codingSpaceGrey;
    g.fillStyle = `rgb(${grey}, ${grey}, ${grey})`;
    g.fillRect(codingSpace.x, codingSpace.y, codingSpace.width, codingSpace.height);
    g.strokeStyle = BOUNDARY;
    g.lineWidth = LINE_PX * px;
    g.beginPath();
    g.moveTo(codingSpace.x + codingSpace.width, 0.5 * U_MM);
    g.lineTo(codingSpace.x + codingSpace.width, codingSpace.height - 0.5 * U_MM);
    g.stroke();
  }

  // The corners: dotted quarter circles, clipped to the work area.
  g.save();
  g.beginPath();
  g.rect(0, 0, geometry.workArea.width, geometry.workArea.height);
  g.clip();
  g.strokeStyle = CORNER;
  g.lineCap = "round";
  g.setLineDash([DOT_PX * px, GAP_PX * px]);
  for (const c of corners) {
    g.beginPath();
    g.arc(c.x, c.y, c.radius, 0, 2 * Math.PI);
    g.stroke();
  }
  g.restore();

  // The virtual cards (#197), under the card feedback (#195) and handwriting's read-back (#196), then
  // the one top status bar (#196's no internet, #197's). A waiting line's spinner turns, so draw again next frame.
  // Each status bar keeps clear of the help box on its edge.
  if (scene) {
    const help = scene.help && helpExtent(scene.help);
    drawVirtual(g, scene.virtual, scene.feedback.keepClear, draw);
    drawFeedback(g, scene.feedback, geometry, help && !help.top ? help : null);
    drawHandwriting(g, scene.handwriting);
    bar(g, scene.status.map((text) => ({ text })), true, geometry, STATUS, help?.top ? help : null);
    if (scene.feedback.gutters.some((gt) => gt.dot === "waiting")) requestRedraw();
  }

  // The help box, beside its help corner, never on a marker.
  if (scene?.help) drawHelp(g, scene.help, px, scene.feedback.keepClear);

  // Every page cut out, above the windows, corners and help box (#197).
  if (scene) drawPages(g, scene.pages, scene.settings.pageBandMm);

  // The settings menu, above windows, corners and pages: draw it last.
  if (scene?.menu) drawMenu(g, geometry, scene.menu);
}

let redraw = 0;
function requestRedraw(): void {
  if (!redraw) redraw = requestAnimationFrame(() => {
    redraw = 0;
    draw();
  });
}

table.onGeometry((g) => {
  geometry = g;
  draw();
});
table.onScene((s) => {
  scene = s;
  draw();
});
addEventListener("resize", draw);
// Canvas text waits for its fonts to load.
void document.fonts.ready.then(draw);
