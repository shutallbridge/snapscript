// Handwriting's look (#196, #181 "The look"), in table mm: read-back in cyan at each whiteboard's
// bottom-left, as big as the handwriting. Its no-internet message is in the scene's top status bar.
import type { HandwritingView } from "../../handwriting.ts";

const CYAN = "#22d3ee";
/** The status bar's text: white, as status rather than an error. */
export const STATUS = "#ffffff";
/** Handwriting on a 24 mm whiteboard: about 17 mm, as faces draws it (Kalam). */
const HAND_MM = 17;
/** Read-back's inset from the whiteboard's left and bottom edges. */
const INSET_MM = 1.5;

export function drawHandwriting(g: CanvasRenderingContext2D, view: HandwritingView): void {
  for (const { text, at } of view.readBack) {
    g.save();
    g.translate(at.x, at.y);
    g.rotate((at.angle * Math.PI) / 180);
    g.beginPath();
    g.rect(0, 0, at.width, at.height);
    g.clip();
    g.fillStyle = CYAN;
    g.font = `400 ${Math.min(HAND_MM, at.height)}px Kalam, cursive`;
    g.textBaseline = "alphabetic";
    g.fillText(text, INSET_MM, at.height - INSET_MM);
    g.restore();
  }
}
