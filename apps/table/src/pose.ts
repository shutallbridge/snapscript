// Where things lie on the table, in table mm: the vision service gives each card and page by its
// marker's centre and angle (ADR 0007: degrees), and everything drawn on or beside one is placed
// from that. A card's sizes come from `SHEET`.
import { SHEET } from "@snapscript/faces";

export type Vec = [x: number, y: number];

/** A marker on the table: its centre in table mm, turned `angle` degrees. */
export interface Pose {
  x: number;
  y: number;
  angle: number;
}

/** A rectangle on the table: its top-left corner at (x, y) in table mm, turned `angle` degrees about it, `width` along and `height` across. */
export interface Quad {
  x: number;
  y: number;
  angle: number;
  width: number;
  height: number;
}

/** Where a card's marker sits on its sheet: the centre of its marker zone, from the sheet's top-left. */
export const SHEET_MARKER: Vec = [SHEET.markerZoneMm / 2, SHEET.heightMm / 2];

/** The unit vectors along something turned `angle` degrees (`u`, its length) and across it (`v`, downward when upright). */
export function axes(angle: number): [u: Vec, v: Vec] {
  const a = (angle * Math.PI) / 180;
  const u: Vec = [Math.cos(a), Math.sin(a)];
  return [u, [-u[1], u[0]]];
}

/** The point `along` mm along and `down` mm across from the top-left of something whose marker, `marker` mm from that corner, lies at `p`. */
export function pointOn(p: Pose, marker: Vec, along: number, down: number): Vec {
  const [u, v] = axes(p.angle);
  const [a, d] = [along - marker[0], down - marker[1]];
  return [p.x + a * u[0] + d * v[0], p.y + a * u[1] + d * v[1]];
}

/** A rectangle on a card's sheet: from `along` mm along its left end and `down` mm from its top, `width` x `height`. */
export function onSheet(card: Pose, along: number, width: number, down = 0, height: number = SHEET.heightMm): Quad {
  const [x, y] = pointOn(card, SHEET_MARKER, along, down);
  return { x, y, angle: card.angle, width, height };
}

/** A whole card `length` U long, by its marker. */
export const cardQuad = (card: Pose, length: number): Quad => onSheet(card, 0, length * SHEET.unitMm);

/** A rectangle `width` x `height` about its centre, turned `angle` degrees. */
export function centred(cx: number, cy: number, width: number, height: number, angle = 0): Quad {
  const [x, y] = pointOn({ x: cx, y: cy, angle }, [width / 2, height / 2], 0, 0);
  return { x, y, angle, width, height };
}

/** A rectangle's four corners, clockwise from its top-left. */
export function corners(q: Quad): Vec[] {
  const [u, v] = axes(q.angle);
  return [
    [0, 0],
    [q.width, 0],
    [q.width, q.height],
    [0, q.height],
  ].map(([a, d]): Vec => [q.x + a! * u[0] + d! * v[0], q.y + a! * u[1] + d! * v[1]]);
}
