// The table's layout (#114): two windows, the coding space left and the canvas space right, and
// four fixed corners, in table mm. The vision service gives positions in table mm from the
// projected image's top-left, and every table state says how many mm the image's height covers.
import type { Layout, Rect } from "@snapscript/table-reader";

/** 1U on the table, in mm. */
export const U_MM = 30;
/** 1U in the app's own px, whatever the projector's resolution: a sketch's 500 px canvas is 10U. */
export const APP_PX_PER_U = 50;

/** The layout's settings: the decided starting values (#114), for the settings menu. */
export interface LayoutSettings {
  /** The coding space's share of the work area's width, in %. */
  splitPercent: number;
  /** The work area's width over its depth: the left part of the image the table takes up. */
  workAreaAspect: number;
  /** A corner's quarter circle radius, in U. */
  cornerU: number;
  /** The canvas over the whole work area, like a browser's full screen; cards still count by the windows. */
  fullScreen: boolean;
}

export const defaultLayoutSettings: LayoutSettings = {
  splitPercent: 50,
  workAreaAspect: 1.5,
  cornerU: 3.5,
  fullScreen: false,
};

/** Where things are, in table mm for the reader and the table view, and in projector px for the sketch view. */
export interface TableGeometry {
  layout: Layout;
  /** The work area from the image's top-left, in mm. */
  workArea: { width: number; height: number };
  /** Projector px per table mm. */
  pxPerMm: number;
  /** Projector px per app px: the sketch view's zoom. */
  zoom: number;
  /** The canvas space (the whole work area in full screen), in whole projector px: the sketch view's bounds. */
  canvasPx: Rect;
  /** Full screen: the table view leaves the whole work area clear, but for the corners and what's above them. */
  fullScreen: boolean;
}

export function tableGeometry(
  screen: { width: number; height: number },
  mmPerProjectorHeight: number,
  settings: Partial<LayoutSettings> = {},
): TableGeometry {
  const s = { ...defaultLayoutSettings, ...settings };
  const pxPerMm = screen.height / mmPerProjectorHeight;
  const height = mmPerProjectorHeight;
  const width = Math.min(screen.width, s.workAreaAspect * screen.height) / pxPerMm;
  const split = (width * s.splitPercent) / 100;
  const radius = s.cornerU * U_MM;
  const left = Math.round(split * pxPerMm);
  const right = Math.round(width * pxPerMm);
  return {
    layout: {
      codingSpace: { x: 0, y: 0, width: split, height },
      canvasSpace: { x: split, y: 0, width: width - split, height },
      corners: [
        { name: "top-left", x: 0, y: 0, radius },
        { name: "top-right", x: width, y: 0, radius },
        { name: "bottom-left", x: 0, y: height, radius },
        { name: "bottom-right", x: width, y: height, radius },
      ],
    },
    workArea: { width, height },
    pxPerMm,
    zoom: (U_MM * pxPerMm) / APP_PX_PER_U,
    canvasPx: { x: s.fullScreen ? 0 : left, y: 0, width: s.fullScreen ? right : right - left, height: screen.height },
    fullScreen: s.fullScreen,
  };
}
