// The help corner's box (#198), drawn in table mm: black with a grey border so it reads over the
// sketch, its corner nearest the help corner where the session put it, as wide as the session says
// and as tall as its text. It goes on a layer of its own with every card's marker zone cut out, like
// the feedback, so it never covers a marker.
import type { HelpBox } from "../../help.ts";
import { APP_PX_PER_U, U_MM } from "../../layout.ts";
import type { Quad } from "../../pose.ts";
import { within } from "./within.ts";

/** #114's look: 16 app px text (1U = 50 app px), 0.4U padding, 1.4 lines. */
const TEXT_MM = (16 / APP_PX_PER_U) * U_MM;
const LINE_MM = TEXT_MM * 1.4;
const PAD_MM = 0.4 * U_MM;
const FONT = `500 ${TEXT_MM}px "Geist Mono", ui-monospace, Menlo, monospace`;
const BORDER = "#52525b";
const TITLE = "#ffffff";
const BODY = "#d4d4d8";
const NAME = "#a1a1aa";

/** `text` broken at spaces into lines no wider than `width`. */
function wrap(g: CanvasRenderingContext2D, text: string, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(" ")) {
    const next = line ? `${line} ${word}` : word;
    if (line && g.measureText(next).width > width) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  return [...lines, line];
}

const layer = document.createElement("canvas");

/** The box's left and right x, and whether it is on the table's top edge, for the status bar along that edge to keep clear of. */
export function helpExtent(box: HelpBox): { top: boolean; left: number; right: number } {
  const left = box.anchor.endsWith("left") ? box.x : box.x - box.width;
  return { top: box.anchor.startsWith("top"), left, right: left + box.width };
}

/** Draws the box onto `target`, whose transform is table mm; `px` is one projector px in mm. Marker zones are left untouched. */
export function drawHelp(target: CanvasRenderingContext2D, box: HelpBox, px: number, keepClear: readonly Quad[]): void {
  layer.width = target.canvas.width;
  layer.height = target.canvas.height;
  const g = layer.getContext("2d")!;
  g.setTransform(target.getTransform());
  g.font = FONT;
  g.textBaseline = "middle";
  const inner = box.width - 2 * PAD_MM;
  const nameWidth = Math.max(0, ...box.values.map((v) => g.measureText(`${v.name}  `).width));
  type Text = { text: string; x: number; fill: string };
  // A row each: the label, the sentence's lines, then a value's name beside the first line of its words.
  const rows: Text[][] = [
    [{ text: box.label, x: 0, fill: TITLE }],
    ...wrap(g, box.sentence, inner).map((text) => [{ text, x: 0, fill: BODY }]),
    ...box.values.flatMap((v) =>
      wrap(g, v.about, inner - nameWidth).map((text, i) => [
        ...(i === 0 ? [{ text: v.name, x: 0, fill: NAME }] : []),
        { text, x: nameWidth, fill: BODY },
      ]),
    ),
  ];
  const height = rows.length * LINE_MM + 2 * PAD_MM;
  const { left } = helpExtent(box);
  const top = box.anchor.startsWith("top") ? box.y : box.y - height;
  g.fillStyle = "#000000";
  g.fillRect(left, top, box.width, height);
  g.strokeStyle = BORDER;
  g.lineWidth = 2 * px;
  g.strokeRect(left, top, box.width, height);
  rows.forEach((row, i) => {
    for (const line of row) {
      g.fillStyle = line.fill;
      g.fillText(line.text, left + PAD_MM + line.x, top + PAD_MM + (i + 0.5) * LINE_MM);
    }
  });
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  for (const q of keepClear) within(g, q, () => g.fillRect(0, 0, q.width, q.height));
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(layer, 0, 0);
  target.restore();
}
