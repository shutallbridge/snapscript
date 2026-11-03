// One card's sheet as SVG in mm, for its three uses: printed sheets, mini cards on pages, and the table's virtual cards.

import { colorsOf, type Colors, type FunctionColor } from "./colors.ts";
import { markerSvg, mm } from "./marker.ts";
import { SHEET, shortestLength, sideOf, type Side } from "./sheet.ts";

export interface Card {
  /** The card in card notation: [call(p5.circle)], [set{x}to], [num{…}], [color(gold)]. */
  text: string;
  /** A printed [call(…)] card's function colour; helper when left out, as for every builtin. */
  functionColor?: FunctionColor;
  /** Its length in U, never under its shortest; its shortest when left out. */
  length?: number;
  /** Its marker's ID, or none. */
  marker?: number | null;
}

/**
 * - `sheet`: a sheet to print, at true size: marker, stripe, paper tabs and the cut line.
 * - `mini`: a mini card in a page's running text, only as long as its text, with a grey dot for its marker.
 * - `stand-in`: a virtual card standing in for a real one: its real face, a dark marker zone (20% white) and a white bracket.
 * - `guide`: a virtual card showing which card goes here: its colour at 20%, a solid label, its value in Kalam, a grey dot.
 */
export type Use = "sheet" | "mini" | "stand-in" | "guide";

export interface FaceOptions {
  use: Use;
  /** What a handwritten card's whiteboard shows when it holds nothing, such as a value guide's name ("x"). */
  value?: string;
}

export interface Face {
  /** The SVG, its viewBox in mm with the face's top-left at (0, 0). */
  svg: string;
  /** The card's length in U. */
  length: number;
  /** The whole drawing's size in mm, tabs included. */
  widthMm: number;
  heightMm: number;
}

/** The table app draws virtual cards at 50 px per U. */
export const VIRTUAL_PX_PER_U = 50;

const MONO = `"Geist Mono", ui-monospace, Menlo, monospace`;
const HAND = `Kalam, cursive`;
const PT_MM = 25.4 / 72;
/** Geist Mono's letters are 0.6 em wide. Kalam's vary; 0.55 em is about its average. */
const MONO_EM = 0.6;
const HAND_EM = 0.55;

export function face(card: Card, options: FaceOptions): Face {
  const side = sideOf(card.text);
  const shortest = shortestLength(card.text);
  const length = card.length ?? shortest;
  if (length < shortest) throw new RangeError(`${card.text} is at least ${shortest}U, not ${length}U`);
  const colors = colorsOf(side, card.functionColor);
  const written = (side.kind === "handwritten" && side.written) || options.value || "";
  if (options.use === "mini") return mini(card, side, colors, written, length);

  const w = length * SHEET.unitMm;
  const H = SHEET.heightMm;
  const body = options.use === "sheet" ? sheet(card, side, colors, w) : virtual(options.use, side, colors, written, w);
  if (options.use === "sheet") {
    const [E, V] = [SHEET.tabEndMm, SHEET.tabSideMm];
    return svg(card, length, body, [-E, -V, w + 2 * E, H + 2 * V], "mm");
  }
  return svg(card, length, body, [0, 0, w, H], "px");
}

function svg(card: Card, length: number, body: string, [x, y, w, h]: number[], unit: "mm" | "px"): Face {
  const scale = unit === "mm" ? 1 : VIRTUAL_PX_PER_U / SHEET.unitMm;
  const size = `width="${mm(w! * scale)}${unit}" height="${mm(h! * scale)}${unit}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" ${size} viewBox="${[x, y, w, h].map((n) => mm(n!)).join(" ")}" ` +
    `data-card="${escape(card.text)}" data-length="${length}">${body}</svg>`;
  return { svg, length, widthMm: w!, heightMm: h! };
}

const MZ = SHEET.markerZoneMm;
const H = SHEET.heightMm;
const FONT = SHEET.fontPt * PT_MM;
const LABEL_X = MZ + SHEET.stripeMm + SHEET.paddingMm;
/** The whiteboard's inset from the top and bottom, and the handwriting on it. */
const WHITEBOARD_INSET = 3;
const HAND_MM = 17;
/** [dedent]'s icon (lucide corner-down-left), its size and stroke. */
const ICON_MM = 12;
const ICON_STROKE = 1.5;

const rect = (x: number, y: number, w: number, h: number, fill: string, part?: string, extra = ""): string =>
  `<rect${part ? ` data-part="${part}"` : ""} x="${mm(x)}" y="${mm(y)}" width="${mm(w)}" height="${mm(h)}" fill="${fill}"${extra}/>`;

function text(x: number, y: number, str: string, o: { size: number; fill: string; part: string; hand?: boolean; anchor?: string }): string {
  const font = o.hand ? `font-family="${HAND}" font-weight="400"` : `font-family='${MONO}' font-weight="500"`;
  return (
    `<text data-part="${o.part}" x="${mm(x)}" y="${mm(y)}" dominant-baseline="central" font-size="${mm(o.size)}" ${font} ` +
    `fill="${o.fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ""}>${escape(str)}</text>`
  );
}

const monoWidth = (str: string, size = FONT): number => str.length * size * MONO_EM;

/** A rectangle on a face, in mm from its top-left. */
export interface FaceRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

function whiteboardRect(side: Extract<Side, { kind: "handwritten" }>, w: number): FaceRect {
  const x = LABEL_X + monoWidth(side.keyword) + SHEET.gapMm;
  const end = side.after ? w - SHEET.paddingMm - monoWidth(side.after) - SHEET.gapMm : w - SHEET.paddingMm;
  return { x, y: WHITEBOARD_INSET, width: end - x, height: H - 2 * WHITEBOARD_INSET };
}

/** A handwritten card's whiteboard on its printed face at `length` U, or null for a card with none. */
export function whiteboardOf(card: string, length: number = shortestLength(card)): FaceRect | null {
  const side = sideOf(card);
  return side.kind === "handwritten" ? whiteboardRect(side, length * SHEET.unitMm) : null;
}

/** The face's main area, right of the stripe: its label, or its words and whiteboard, or its icon. */
function mainArea(side: Side, w: number, labelFill: string, whiteboard: string | null, written: string, writtenFill: string): string {
  const mid = (MZ + SHEET.stripeMm + w) / 2;
  switch (side.kind) {
    case "printed":
    case "color":
      return text(LABEL_X, H / 2, side.label, { size: FONT, fill: labelFill, part: "label" });
    case "operator":
      return text(mid, H / 2, side.label, { size: FONT, fill: labelFill, part: "label", anchor: "middle" });
    case "dedent": {
      const k = ICON_MM / 24;
      return (
        `<g data-part="label" transform="translate(${mm(mid - ICON_MM / 2)} ${mm(H / 2 - ICON_MM / 2)}) scale(${mm(k)})" fill="none" ` +
        `stroke="${labelFill}" stroke-width="${mm(ICON_STROKE / k)}" stroke-linecap="round" stroke-linejoin="round">` +
        `<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/></g>`
      );
    }
    case "handwritten": {
      let out = text(LABEL_X, H / 2, side.keyword, { size: FONT, fill: labelFill, part: "label" });
      const wb = whiteboardRect(side, w);
      if (whiteboard) out += rect(wb.x, wb.y, wb.width, wb.height, whiteboard, "whiteboard");
      if (written) out += text(wb.x + 2.5, H / 2, written, { size: HAND_MM, fill: writtenFill, part: "value", hand: true });
      if (side.after) out += text(w - SHEET.paddingMm - monoWidth(side.after), H / 2, side.after, { size: FONT, fill: labelFill, part: "label" });
      return out;
    }
  }
}

/** The face as printed: marker zone, tint, stripe, marker and label. */
function printedFace(card: Card, side: Side, c: Colors, w: number): string {
  const marker = card.marker ?? null;
  return (
    rect(0, 0, MZ, H, "#ffffff", "marker-zone") +
    rect(MZ, 0, w - MZ, H, c.tint, "tint") +
    rect(MZ, 0, SHEET.stripeMm, H, c.stripe, "stripe") +
    (marker === null ? "" : markerSvg(marker, (MZ - SHEET.markerMm) / 2, (H - SHEET.markerMm) / 2, SHEET.markerMm)) +
    mainArea(side, w, c.label, "#ffffff", "", "#000000")
  );
}

/**
 * A sheet to print: the face, and a tab on every edge with its corners cut away so the tabs fold past each other.
 * Each tab is bleed in the colour it folds from. Only the cut line is drawn: a fold line would show if the fold is off.
 */
function sheet(card: Card, side: Side, c: Colors, w: number): string {
  const [E, V] = [SHEET.tabEndMm, SHEET.tabSideMm];
  const cut = `M0 ${-V} H${mm(w)} V0 H${mm(w + E)} V${H} H${mm(w)} V${H + V} H0 V${H} H${-E} V0 H0 Z`;
  return (
    rect(-E, 0, E + 0.1, H, "#ffffff") +
    rect(w - 0.1, 0, E + 0.1, H, c.tint) +
    rect(0, -V, MZ, H + 2 * V, "#ffffff") +
    rect(MZ, -V, w - MZ, H + 2 * V, c.tint) +
    rect(MZ, -V, SHEET.stripeMm, H + 2 * V, c.stripe) +
    printedFace(card, side, c, w) +
    `<path data-part="cut" d="${cut}" fill="none" stroke="#333333" stroke-width="0.2"/>`
  );
}

/** The marker zone's white bracket: top, left and bottom, open to the card. */
function bracket(edge: number, opacity: number): string {
  const t = edge / 2;
  return (
    `<path data-part="bracket" d="M${MZ} ${mm(t)} H${mm(t)} V${mm(H - t)} H${MZ}" fill="none" stroke="#ffffff" ` +
    `stroke-width="${mm(edge)}" stroke-opacity="${opacity}"/>`
  );
}

/** Where a guide's marker would go: a grey dot, never a marker the camera could read. */
const dot = (cx: number, cy: number, r: number, fill: string): string =>
  `<circle data-part="dot" cx="${mm(cx)}" cy="${mm(cy)}" r="${mm(r)}" fill="${fill}"/>`;

/** The card feedback looks (#129). A stand-in's marker zone is dark, so a real card's marker laid on it still reads. */
const STAND_IN = { markerZone: "#333333", bracketMm: 1.5 };
const GUIDE = { tintOpacity: 0.2, bracketMm: 1, bracketOpacity: 0.2, colorBarMm: 3, light: "#e4e4e7", dot: "#71717a", dotR: 2.5 };

function virtual(use: "stand-in" | "guide", side: Side, c: Colors, written: string, w: number): string {
  if (use === "stand-in") {
    return (
      rect(0, 0, MZ, H, STAND_IN.markerZone, "marker-zone") +
      rect(MZ, 0, w - MZ, H, c.tint, "tint") +
      rect(MZ, 0, SHEET.stripeMm, H, c.stripe, "stripe") +
      mainArea(side, w, c.label, "#ffffff", written, "#000000") +
      bracket(STAND_IN.bracketMm, 1)
    );
  }
  // A color card's name is drawn light on the dark table, its colour a solid bar.
  const isColor = side.kind === "color";
  return (
    rect(MZ, 0, w - MZ, H, c.tint, "tint", ` fill-opacity="${GUIDE.tintOpacity}"`) +
    (isColor && side.label ? rect(MZ, 0, GUIDE.colorBarMm, H, c.tint, "stripe") : "") +
    mainArea(side, w, isColor ? GUIDE.light : c.stripe, null, written, GUIDE.light) +
    bracket(GUIDE.bracketMm, GUIDE.bracketOpacity) +
    dot(MZ / 2, H / 2, GUIDE.dotR, GUIDE.dot)
  );
}

/** A mini card's own sizes, in mm: tall enough to read in a page's text, and only as long as its text. */
const MINI = {
  height: 6,
  markerZone: 4.6,
  dotR: 0.9,
  stripe: 0.5,
  padding: 1.3,
  gap: 1.1,
  label: 3.1,
  whiteboardInset: 0.8,
  emptyWhiteboard: 7,
  hand: 3.9,
  dot: "#a1a1aa",
  edge: "#a1a1aa",
};

function mini(card: Card, side: Side, c: Colors, written: string, length: number): Face {
  const M = MINI;
  const mid = M.height / 2;
  const x0 = M.markerZone + M.stripe + M.padding;
  const label = (x: number, str: string, anchor?: string) => text(x, mid, str, { size: M.label, fill: c.label, part: "label", anchor });
  let body: string;
  let w: number;
  switch (side.kind) {
    case "dedent": {
      const s = M.label * 1.3;
      const k = s / 24;
      w = x0 + s + M.padding;
      body =
        `<g data-part="label" transform="translate(${mm(x0)} ${mm(mid - s / 2)}) scale(${mm(k)})" fill="none" stroke="${c.label}" ` +
        `stroke-width="${mm(0.45 / k)}" stroke-linecap="round" stroke-linejoin="round"><path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/></g>`;
      break;
    }
    case "handwritten": {
      let x = x0;
      body = label(x, side.keyword);
      x += monoWidth(side.keyword, M.label) + M.gap;
      const wb = written ? written.length * M.hand * HAND_EM + 2 * M.gap : M.emptyWhiteboard;
      body += rect(x, M.whiteboardInset, wb, M.height - 2 * M.whiteboardInset, "#ffffff", "whiteboard");
      if (written) body += text(x + wb / 2, mid, written, { size: M.hand, fill: "#000000", part: "value", hand: true, anchor: "middle" });
      x += wb;
      if (side.after) {
        x += M.gap;
        body += label(x, side.after);
        x += monoWidth(side.after, M.label);
      }
      w = x + M.padding;
      break;
    }
    default:
      w = x0 + monoWidth(side.label, M.label) + M.padding;
      body = label(x0, side.label);
  }
  const g =
    rect(0, 0, M.markerZone, M.height, "#ffffff", "marker-zone") +
    rect(M.markerZone, 0, w - M.markerZone, M.height, c.tint, "tint") +
    rect(M.markerZone, 0, M.stripe, M.height, c.stripe, "stripe") +
    dot(M.markerZone / 2, mid, M.dotR, M.dot) +
    body +
    `<rect x="0" y="0" width="${mm(w)}" height="${M.height}" fill="none" stroke="${M.edge}" stroke-width="0.2"/>`;
  return svg(card, length, g, [-0.1, -0.1, w + 0.2, M.height + 0.2], "mm");
}

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
