// The table's windows and corners (#114), worked out from the projector's size and the table's
// mm per projector height. The numbers are worked by hand for a 1920 x 1080 projector over a
// table 781 mm deep.
import { describe, expect, test } from "vitest";
import { tableGeometry } from "../src/layout.ts";

const screen = { width: 1920, height: 1080 };

describe("tableGeometry", () => {
  const g = tableGeometry(screen, 781);

  test("the work area is 1.5 times as wide as the table is deep, from the image's left", () => {
    expect(g.workArea.width).toBeCloseTo(1171.5);
    expect(g.workArea.height).toBe(781);
  });

  test("two windows side by side, 50/50: the coding space left, the canvas space right", () => {
    expect(g.layout.codingSpace).toEqual({ x: 0, y: 0, width: expect.closeTo(585.75), height: 781 });
    expect(g.layout.canvasSpace).toEqual({ x: expect.closeTo(585.75), y: 0, width: expect.closeTo(585.75), height: 781 });
  });

  test("four corners, 3.5U (105 mm) quarter circles about the work area's corners", () => {
    expect(g.layout.corners).toEqual([
      { name: "top-left", x: 0, y: 0, radius: 105 },
      { name: "top-right", x: expect.closeTo(1171.5), y: 0, radius: 105 },
      { name: "bottom-left", x: 0, y: 781, radius: 105 },
      { name: "bottom-right", x: expect.closeTo(1171.5), y: 781, radius: 105 },
    ]);
  });

  test("1U (30 mm) is 50 app px: an app px is 0.83 projector px here", () => {
    expect(g.pxPerMm).toBeCloseTo(1080 / 781);
    expect(g.zoom).toBeCloseTo(0.8297, 4);
  });

  test("the sketch view covers the canvas space, in projector px", () => {
    expect(g.canvasPx).toEqual({ x: 810, y: 0, width: 810, height: 1080 });
  });

  test("the split is a setting", () => {
    const wide = tableGeometry(screen, 781, { splitPercent: 60 });
    expect(wide.layout.codingSpace.width).toBeCloseTo(702.9);
    expect(wide.canvasPx).toEqual({ x: 972, y: 0, width: 648, height: 1080 });
  });

  test("full screen lays the sketch view over the whole work area, and keeps the windows for the cards", () => {
    const full = tableGeometry(screen, 781, { splitPercent: 60, fullScreen: true });
    expect(full.canvasPx).toEqual({ x: 0, y: 0, width: 1620, height: 1080 });
    expect(full.fullScreen).toBe(true);
    expect(full.layout).toEqual(tableGeometry(screen, 781, { splitPercent: 60 }).layout);
    expect(tableGeometry(screen, 781).fullScreen).toBe(false);
  });

  test("a projector narrower than 1.5:1 gives its whole width", () => {
    expect(tableGeometry({ width: 1200, height: 1000 }, 800).workArea.width).toBeCloseTo(960);
  });
});
