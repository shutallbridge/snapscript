// Draws the virtual cards (#197): stand-ins, a page's guides and value guides, each with
// `@snapscript/faces` (at 50 px per U, scaled to its place in table mm). They go on a layer of
// their own with every card's marker zone cut out, like the feedback, so a guide a card is being
// laid on never covers its marker.
import { face } from "@snapscript/faces";
import geistMono from "@fontsource/geist-mono/files/geist-mono-latin-500-normal.woff2?inline";
import kalam from "@fontsource/kalam/files/kalam-latin-400-normal.woff2?inline";
import type { Quad } from "../../feedback.ts";
import type { VirtualFace } from "../../guides.ts";

/**
 * An SVG drawn as an image can't use the page's fonts, so each face carries the two it names
 * (Geist Mono for labels, Kalam for a value's name).
 */
const FONTS =
  `<style>@font-face { font-family: "Geist Mono"; font-weight: 500; src: url(${geistMono}) format("woff2"); }` +
  `@font-face { font-family: Kalam; font-weight: 400; src: url(${kalam}) format("woff2"); }</style>`;

const layer = document.createElement("canvas");
/** Each face's image by its SVG, made once: `null` until it has loaded. */
const images = new Map<string, HTMLImageElement | null>();

function within(g: CanvasRenderingContext2D, q: Quad, draw: () => void): void {
  g.save();
  g.translate(q.x, q.y);
  g.rotate((q.angle * Math.PI) / 180);
  draw();
  g.restore();
}

/** A face's image, or `null` while it loads (`redraw` is called once it has). */
function imageOf(v: VirtualFace, redraw: () => void): HTMLImageElement | null {
  const use = v.kind === "stand-in" ? "stand-in" : "guide";
  const { svg } = face({ text: v.text, length: v.length, ...(v.functionColor ? { functionColor: v.functionColor } : {}) }, { use, ...(v.value ? { value: v.value } : {}) });
  const withFonts = svg.replace(/^(<svg[^>]*>)/, `$1${FONTS}`);
  if (images.has(withFonts)) return images.get(withFonts)!;
  images.set(withFonts, null);
  const image = new Image();
  image.onload = () => {
    images.set(withFonts, image);
    redraw();
  };
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(withFonts)}`;
  return null;
}

/** Draws the virtual cards onto `target`, whose transform is table mm; marker zones are left untouched. */
export function drawVirtual(target: CanvasRenderingContext2D, cards: readonly VirtualFace[], keepClear: readonly Quad[], redraw: () => void): void {
  if (cards.length === 0) return;
  layer.width = target.canvas.width;
  layer.height = target.canvas.height;
  const g = layer.getContext("2d")!;
  g.setTransform(target.getTransform());
  for (const v of cards) {
    const image = imageOf(v, redraw);
    if (image) within(g, v.at, () => g.drawImage(image, 0, 0, v.at.width, v.at.height));
  }
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "#000";
  for (const q of keepClear) within(g, q, () => g.fillRect(0, 0, q.width, q.height));
  target.save();
  target.setTransform(1, 0, 0, 1, 0, 0);
  target.drawImage(layer, 0, 0);
  target.restore();
}
