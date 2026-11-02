// The settings menu's look (#114): centred on the work area, above everything else; square corners,
// sentence case. Drawn in table mm, with its sizes in app px (1U = 30 mm = 50 app px).
import { APP_PX_PER_U, U_MM, type TableGeometry } from "../../layout.ts";
import type { MenuView } from "../../menu.ts";

/** An app px, in mm. */
const PX = U_MM / APP_PX_PER_U;
const FONT = "500 {size}px sans-serif";
const TEXT_PX = 18;
const TITLE_PX = 22;
const KEYS_PX = 14;
const ROW_PX = 30;
const PAD_PX = 18;
const WIDTH_PX = 460;

const BACK = "#18181b";
const BORDER = "#52525b";
const TEXT = "#d4d4d8";
const DIM = "#71717a";
const CHOSEN = "#3f3f46";
const WHITE = "#ffffff";

const font = (px: number): string => FONT.replace("{size}", String(px * PX));

export function drawMenu(g: CanvasRenderingContext2D, geometry: TableGeometry, menu: MenuView): void {
  const width = WIDTH_PX * PX;
  const height = (2 * PAD_PX + TITLE_PX * 1.6 + menu.rows.length * ROW_PX + KEYS_PX * 2.5) * PX;
  const x = (geometry.workArea.width - width) / 2;
  const y = (geometry.workArea.height - height) / 2;
  g.save();
  g.fillStyle = BACK;
  g.fillRect(x, y, width, height);
  g.strokeStyle = BORDER;
  g.lineWidth = 2 * PX;
  g.strokeRect(x, y, width, height);

  g.textBaseline = "middle";
  let at = y + (PAD_PX + TITLE_PX * 0.8) * PX;
  const left = x + PAD_PX * PX;
  const right = x + width - PAD_PX * PX;
  g.font = font(TITLE_PX);
  g.textAlign = "left";
  if (menu.crumb) {
    const crumb = `${menu.crumb} › `;
    g.fillStyle = DIM;
    g.fillText(crumb, left, at);
    g.fillStyle = WHITE;
    g.fillText(menu.title, left + g.measureText(crumb).width, at);
  } else {
    g.fillStyle = WHITE;
    g.fillText(menu.title, left, at);
  }
  at += TITLE_PX * 0.8 * PX;

  g.font = font(TEXT_PX);
  for (const row of menu.rows) {
    if (row.chosen) {
      g.fillStyle = CHOSEN;
      g.fillRect(left - 8 * PX, at, right - left + 16 * PX, ROW_PX * PX);
    }
    const mid = at + (ROW_PX / 2) * PX;
    g.fillStyle = row.chosen ? WHITE : TEXT;
    g.textAlign = "left";
    g.fillText(row.label, left, mid);
    g.textAlign = "right";
    if (row.value !== null) {
      g.fillText(`‹ ${row.value} ›`, right, mid);
    } else {
      g.fillStyle = DIM;
      g.fillText("›", right, mid);
    }
    at += ROW_PX * PX;
  }

  g.font = font(KEYS_PX);
  g.fillStyle = DIM;
  g.textAlign = "left";
  g.fillText(menu.keys, left, at + KEYS_PX * 1.4 * PX);
  g.restore();
}
