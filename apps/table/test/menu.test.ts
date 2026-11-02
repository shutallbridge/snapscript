// The settings menu (#181 "Settings menu", #114), driven by keys through the table session.
import { describe, expect, test } from "vitest";
import { createSession, type Session } from "../src/session.ts";
import { tableGeometry } from "../src/layout.ts";
import { layout, onLoad, project, table } from "./session-helpers.ts";

const press = (session: Session, ...keys: string[]) => keys.map((key) => session.handle({ type: "key", now: 0, key }));
const rows = (session: Session) => session.scene.menu?.rows.map((r) => (r.value === null ? r.label : `${r.label}: ${r.value}`));
const chosen = (session: Session) => session.scene.menu?.rows.find((r) => r.chosen)?.label;

describe("the settings menu", () => {
  test("is closed until , opens it at its sections, with Reset all settings last", () => {
    const session = createSession({ project, layout });
    expect(session.scene.menu).toBeNull();
    press(session, ",");
    expect(session.scene.menu?.title).toBe("Settings");
    expect(rows(session)).toEqual(["Windows", "Corners", "Textbook pages", "Appearance", "Rig", "Debug", "Reset all settings"]);
    expect(chosen(session)).toBe("Windows");
  });

  test("↑↓ choose a section, wrapping round; Enter opens it, with units on its values", () => {
    const session = createSession({ project, layout });
    press(session, ",", "ArrowUp");
    expect(chosen(session)).toBe("Reset all settings");
    press(session, "ArrowDown", "ArrowDown");
    expect(chosen(session)).toBe("Corners");
    press(session, "ArrowUp", "Enter");
    expect(session.scene.menu).toMatchObject({ crumb: "Settings", title: "Windows" });
    expect(rows(session)).toEqual(["Coding space width: 50%", "Full screen: Off", "Sketch: Centred"]);
  });

  test("←→ change the chosen setting, which goes out to be kept, and stop at the ends", () => {
    const session = createSession({ project, layout });
    press(session, ",", "Enter");
    const [out] = press(session, "ArrowRight");
    expect(out!.settings).toMatchObject({ splitPercent: 55 });
    expect(session.scene.settings.splitPercent).toBe(55);
    press(session, ...Array(10).fill("ArrowRight"));
    expect(rows(session)![0]).toBe("Coding space width: 70%");
    expect(press(session, "ArrowRight")[0]!.settings).toBeNull();
    press(session, "ArrowDown", "ArrowRight", "ArrowDown", "ArrowRight");
    expect(rows(session)).toEqual(["Coding space width: 70%", "Full screen: On", "Sketch: Top-left"]);
  });

  test("Esc goes back to the sections at the section it left, then closes", () => {
    const session = createSession({ project, layout });
    press(session, ",", "ArrowDown", "ArrowDown", "Enter");
    expect(session.scene.menu?.title).toBe("Textbook pages");
    expect(rows(session)).toEqual(["Dark band: 5 mm"]);
    press(session, "Escape");
    expect(session.scene.menu?.title).toBe("Settings");
    expect(chosen(session)).toBe("Textbook pages");
    press(session, "Escape");
    expect(session.scene.menu).toBeNull();
  });

  test("keys do nothing to settings while it's closed, and , closes it from either level", () => {
    const session = createSession({ project, layout });
    expect(press(session, "ArrowRight", "Enter").map((o) => o.settings)).toEqual([null, null]);
    expect(session.scene.menu).toBeNull();
    press(session, ",", "Enter", ",");
    expect(session.scene.menu).toBeNull();
    press(session, ",");
    expect(session.scene.menu?.title).toBe("Settings");
  });

  test("Read-back is the only Debug setting", () => {
    const session = createSession({ project, layout });
    press(session, ",", "ArrowUp", "ArrowUp", "Enter", "ArrowRight");
    expect(session.scene.menu?.title).toBe("Debug");
    expect(rows(session)).toEqual(["Read-back on every card: On"]);
    expect(session.scene.settings.readBack).toBe(true);
  });
});

describe("Reset all settings", () => {
  /** A session with the coding space at 60% and the menu at the reset row. */
  function changed() {
    const session = createSession({ project, layout });
    press(session, ",", "Enter", "ArrowRight", "ArrowRight", "Escape", "ArrowUp");
    expect(session.scene.settings.splitPercent).toBe(60);
    return session;
  }

  test("needs a second Enter", () => {
    const session = changed();
    expect(press(session, "Enter")[0]!.settings).toBeNull();
    expect(chosen(session)).toBe("Press Enter again to reset all settings");
    expect(session.scene.settings.splitPercent).toBe(60);
    const [out] = press(session, "Enter");
    expect(out!.settings).toMatchObject({ splitPercent: 50, fullScreen: false, readBack: false });
    expect(session.scene.settings.splitPercent).toBe(50);
    expect(chosen(session)).toBe("Reset all settings");
  });

  test("any other key between the two Enters calls it off", () => {
    const session = changed();
    press(session, "Enter", "ArrowDown", "ArrowUp", "Enter");
    expect(session.scene.settings.splitPercent).toBe(60);
  });
});

describe("settings from their file", () => {
  test("the session starts with the settings it's given", () => {
    const session = createSession({ project, layout, tableSettings: { ...createSession({ project, layout }).scene.settings, splitPercent: 65 } });
    press(session, ",", "Enter");
    expect(rows(session)![0]).toBe("Coding space width: 65%");
  });
});

describe("the Windows settings lay the table out again", () => {
  const screen = { width: 1920, height: 1080 };
  /** What the host does with the menu's settings: the windows from them, sent back as a layout. */
  function host() {
    let geometry = tableGeometry(screen, 781);
    const session = createSession({ project, layout: geometry.layout });
    const key = (key: string) => {
      const out = session.handle({ type: "key", now: 1, key });
      if (!out.settings) return out;
      geometry = tableGeometry(screen, 781, { splitPercent: out.settings.splitPercent, fullScreen: out.settings.fullScreen });
      const relaid = session.handle({ type: "layout", now: 1, layout: geometry.layout });
      return { ...out, sketch: [...out.sketch, ...relaid.sketch] };
    };
    return { session, key, geometry: () => geometry };
  }
  // A strip 600 mm in, its cards' markers 608.5 to 668.5 mm: right of a 50/50 split (586 mm), left of a 70/30 one (820 mm).
  const laid = table(0, ...onLoad(1, 600, 300, "1"));

  test("a wider coding space counts a strip that was in the canvas space", () => {
    const { session, key } = host();
    expect(session.handle({ type: "table", now: 0, state: laid }).sketch).toEqual([]);
    key(",");
    key("Enter");
    expect(session.scene.cards).toHaveLength(0);
    const sketch = ["ArrowRight", "ArrowRight", "ArrowRight", "ArrowRight"].flatMap((k) => key(k).sketch);
    expect(sketch.filter((c) => c.type === "start").length).toBeGreaterThan(0);
    expect(session.scene.cards).toHaveLength(3);
  });

  test("full screen covers the table with the canvas, and cards still count in the coding space's place", () => {
    const { session, key, geometry } = host();
    session.handle({ type: "table", now: 0, state: table(0, ...onLoad(1, 120, 300, "1")) });
    expect(session.scene.cards).toHaveLength(3);
    for (const k of [",", "Enter", "ArrowDown"]) key(k);
    const out = key("ArrowRight");
    expect(geometry().fullScreen).toBe(true);
    expect(geometry().canvasPx).toEqual({ x: 0, y: 0, width: 1620, height: 1080 });
    expect(out.sketch).toEqual([]);
    expect(session.scene.cards).toHaveLength(3);
  });
});
