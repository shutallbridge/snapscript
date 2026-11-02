// Draws the card feedback (#195, the card feedback prototype's look, #129), in table mm: lit card
// faces, each line's gutter, print output right of its line, and the bottom status bar's errors.
// It all goes on a layer of its own, with every card's marker zone cut out of it, so nothing it
// draws covers a marker, a neighbour's included.
import type { Feedback, Quad } from "../../feedback.ts";
import type { TableGeometry } from "../../layout.ts";

/** 1U, in mm. */
const U = 30;
const RED = "#ff0000";
/** #129's badge and message reds, the ok dot's green, the skipped dot's grey, print output's green. */
const BADGE = "#ef4444";
const MESSAGE = "#f87171";
const OK = "#22c55e";
const SKIPPED = "#a1a1aa";
const PRINT = "#86efac";
/** Sizes in mm: a lit face's fill and edge, the gutter's gap, dots and badges, the text. */
const LIT_ALPHA = 0.5;
const LIT_EDGE = 3;
const GUTTER_GAP = 6;
const DOT = 12;
const DOT_GAP = 2;
/** 16 app px (#114's text size), 1U being 50 app px. */
const TEXT = (16 * U) / 50;
/** The status bars: at most 24U wide, 4U in from each side (clear of the corners), wrapping into rows. */
const BAR_MAX = 24 * U;
const BAR_SIDE = 4 * U;
const FONT = (mm: number, weight = 500) => `${weight} ${mm}px "Geist Mono", monospace`;

const layer = document.createElement("canvas");

/** Draws in a quad's own frame: its top-left at (0, 0), along x. */
function within(g: CanvasRenderingContext2D, q: Quad, draw: () => void): void {
  g.save();
  g.translate(q.x, q.y);
  g.rotate((q.angle * Math.PI) / 180);
  draw();
  g.restore();
}

function badge(g: CanvasRenderingContext2D, label: string, x: number, cy: number, size: number): void {
  g.fillStyle = BADGE;
  g.beginPath();
  g.arc(x + size / 2, cy, size / 2, 0, 2 * Math.PI);
  g.fill();
  g.fillStyle = "#fff";
  g.font = FONT(size * 0.48, 700);
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(label, x + size / 2, cy + size * 0.03);
  g.textAlign = "left";
}

function lit(g: CanvasRenderingContext2D, face: Quad): void {
  within(g, face, () => {
    g.globalAlpha = LIT_ALPHA;
    g.fillStyle = RED;
    g.fillRect(0, 0, face.width, face.height);
    g.globalAlpha = 1;
    g.strokeStyle = RED;
    g.lineWidth = LIT_EDGE;
    g.strokeRect(LIT_EDGE / 2, LIT_EDGE / 2, face.width - LIT_EDGE, face.height - LIT_EDGE);
  });
}

function gutter(g: CanvasRenderingContext2D, { at, dot, badges }: Feedback["gutters"][number]): void {
  within(g, at, () => {
    const cy = at.height / 2;
    let x = -GUTTER_GAP;
    if (dot) {
      const cx = x - DOT / 2;
      const r = DOT / 2;
      if (dot === "ok") {
        g.fillStyle = OK;
        g.beginPath();
        g.arc(cx, cy, r, 0, 2 * Math.PI);
        g.fill();
      } else {
        g.strokeStyle = SKIPPED;
        g.lineWidth = 1.5;
        g.beginPath();
        g.arc(cx, cy, r - 0.75, 0, 2 * Math.PI);
        g.stroke();
        const q = (r - 0.75) * Math.SQRT1_2;
        g.beginPath();
        g.moveTo(cx - q, cy + q);
        g.lineTo(cx + q, cy - q);
        g.stroke();
      }
      x -= DOT + DOT_GAP;
    }
    for (const b of badges) {
      badge(g, b, x - DOT, cy, DOT);
      x -= DOT + DOT_GAP;
    }
  });
}

function print(g: CanvasRenderingContext2D, { text, at }: Feedback["prints"][number]): void {
  within(g, at, () => {
    g.beginPath();
    g.rect(0, 0, at.width, at.height);
    g.clip();
    g.fillStyle = PRINT;
    g.font = FONT(TEXT);
    g.textBaseline = "middle";
    g.fillText(text, 0, at.height / 2);
  });
}

/** A status bar's items, wrapped into centred rows on a black band, at the top or bottom of the work area. */
export function bar(g: CanvasRenderingContext2D, items: { badge?: string; text: string }[], top: boolean, geometry: TableGeometry): void {
  if (items.length === 0) return;
  const { width, height } = geometry.workArea;
  const maxW = Math.min(width - 2 * BAR_SIDE, BAR_MAX);
  const size = TEXT * 1.5;
  const gap = TEXT * 0.4;
  const gapX = TEXT * 1.5;
  const gapY = TEXT * 0.5;
  g.font = FONT(TEXT);
  const sized = items.map((it) => ({ ...it, w: (it.badge ? size + gap : 0) + g.measureText(it.text).width }));
  const rows: (typeof sized)[] = [[]];
  let rw = 0;
  for (const it of sized) {
    const row = rows.at(-1)!;
    const add = (row.length ? gapX : 0) + it.w;
    if (row.length && rw + add > maxW) {
      rows.push([it]);
      rw = it.w;
    } else {
      row.push(it);
      rw += add;
    }
  }
  const rowW = (r: typeof sized) => r.reduce((a, it, i) => a + it.w + (i ? gapX : 0), 0);
  const h = rows.length * size + (rows.length - 1) * gapY;
  const edge = 0.15 * U;
  const pad = 0.2 * U;
  const y0 = top ? edge : height - edge - h;
  const w = Math.min(maxW, Math.max(...rows.map(rowW)));
  g.fillStyle = "#000";
  g.fillRect(width / 2 - w / 2 - pad, y0 - pad, w + 2 * pad, h + 2 * pad);
  rows.forEach((r, ri) => {
    const y = y0 + ri * (size + gapY) + size / 2;
    let x = width / 2 - rowW(r) / 2;
    for (const it of r) {
      let tx = x;
      if (it.badge) {
        badge(g, it.badge, x, y, size);
        tx += size + gap;
      }
      g.font = FONT(TEXT);
      g.fillStyle = MESSAGE;
      g.textBaseline = "middle";
      g.fillText(it.text, tx, y);
      x += it.w + gapX;
    }
  });
}

/** Draws the feedback onto `target`, whose transform is table mm; marker zones are left untouched. */
export function drawFeedback(target: CanvasRenderingContext2D, feedback: Feedback, geometry: TableGeometry): void {
  layer.width = target.canvas.width;
  layer.height = target.canvas.height;
  const g = layer.getContext("2d")!;
  g.setTransform(target.getTransform());
  for (const l of feedback.lit) lit(g, l.face);
  for (const gt of feedback.gutters) gutter(g, gt);
  for (const p of feedback.prints) print(g, p);
  bar(g, feedback.errorBar, false, geometry);
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  for (const q of feedback.keepClear) within(g, q, () => g.fillRect(0, 0, q.width, q.height));
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(layer, 0, 0);
  target.restore();
}
