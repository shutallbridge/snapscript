// The help corner's box (#198), drawn in table mm: black with a grey border so it reads over the
// sketch, its bottom-left where the session put it, 9U wide and as tall as its text.
import type { HelpBox } from "../../help.ts";
import { U_MM } from "../../layout.ts";

/** The box's width, as in the #114 prototype. */
const HELP_BOX_WIDTH_MM = 9 * U_MM;
/** #114's look: 16 app px text (1U = 50 app px), 0.4U padding, 1.4 lines. */
const TEXT_MM = (16 / 50) * U_MM;
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

/** Draws the box; `px` is one projector px in mm. */
export function drawHelp(g: CanvasRenderingContext2D, box: HelpBox, px: number): void {
  g.save();
  g.font = FONT;
  g.textBaseline = "middle";
  const inner = HELP_BOX_WIDTH_MM - 2 * PAD_MM;
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
  const top = box.y - height;
  g.fillStyle = "#000000";
  g.fillRect(box.x, top, HELP_BOX_WIDTH_MM, height);
  g.strokeStyle = BORDER;
  g.lineWidth = 2 * px;
  g.strokeRect(box.x, top, HELP_BOX_WIDTH_MM, height);
  rows.forEach((row, i) => {
    for (const line of row) {
      g.fillStyle = line.fill;
      g.fillText(line.text, box.x + PAD_MM + line.x, top + PAD_MM + (i + 0.5) * LINE_MM);
    }
  });
  g.restore();
}
