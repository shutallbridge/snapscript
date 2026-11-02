// The table's settings (#181 "Settings menu", #114): what the facilitator changes from the settings
// menu, kept in a file on the Pi across restarts (settings-file.ts). The session's timings aren't
// here: they are the rig's to tune in code, as the reader's thresholds are. No Node here: the table
// view reads the defaults too.

export type CornerName = "top-left" | "top-right" | "bottom-left" | "bottom-right";
export type CornerAction = "none" | "help";

export interface TableSettings {
  /** Windows: the coding space's share of the work area's width, in %. */
  splitPercent: number;
  /** Windows: the canvas shown over the whole table; cards still count where the coding space would be. */
  fullScreen: boolean;
  /** Windows: where the sketch's canvas sits in its window. */
  sketchAt: "centre" | "top-left";
  /** Corners: what each corner does when a card is laid in it. */
  corners: Record<CornerName, CornerAction>;
  /** Textbook pages: the dark band cut out round a page, in mm. */
  pageBandMm: number;
  /** Appearance: the table's text size, in app px. */
  textPx: number;
  /** Appearance: the coding space's grey, 0 (black) to 255. */
  codingSpaceGrey: number;
  /** Debug: read-back shown on every card, not only after a read or on an error's cards. */
  readBack: boolean;
}

export const defaultTableSettings: TableSettings = {
  splitPercent: 50,
  fullScreen: false,
  sketchAt: "centre",
  corners: { "top-left": "none", "top-right": "none", "bottom-left": "help", "bottom-right": "none" },
  pageBandMm: 5,
  textPx: 16,
  codingSpaceGrey: 12,
  readBack: false,
};

/** A setting the menu changes: its row's label, its choices in order, and how a choice reads. */
export interface SettingRow {
  type: "setting";
  label: string;
  choices: readonly unknown[];
  get(s: TableSettings): unknown;
  set(s: TableSettings, value: unknown): TableSettings;
  text(value: unknown): string;
}

/** A row that does something on `Enter`. */
export interface ActionRow {
  type: "action";
  label: string;
  action: "calibrate";
}

export interface Section {
  name: string;
  rows: (SettingRow | ActionRow)[];
}

const onOff = (v: unknown): string => (v ? "On" : "Off");
const unit = (u: string) => (v: unknown) => `${v}${u}`;

function setting<K extends keyof TableSettings>(
  key: K,
  label: string,
  choices: readonly TableSettings[K][],
  text: (value: TableSettings[K]) => string,
): SettingRow {
  return {
    type: "setting",
    label,
    choices,
    get: (s) => s[key],
    set: (s, value) => ({ ...s, [key]: value }),
    text: text as (value: unknown) => string,
  };
}

function corner(name: CornerName, label: string): SettingRow {
  return {
    type: "setting",
    label,
    choices: ["none", "help"] satisfies CornerAction[],
    get: (s) => s.corners[name],
    set: (s, value) => ({ ...s, corners: { ...s.corners, [name]: value as CornerAction } }),
    text: (v) => (v === "help" ? "Help" : "None"),
  };
}

/** The menu's sections, in order. "Reset all settings" follows them. */
export const sections: Section[] = [
  {
    name: "Windows",
    rows: [
      setting("splitPercent", "Coding space width", [30, 35, 40, 45, 50, 55, 60, 65, 70], unit("%")),
      setting("fullScreen", "Full screen", [false, true], onOff),
      setting("sketchAt", "Sketch", ["centre", "top-left"], (v) => (v === "centre" ? "Centred" : "Top-left")),
    ],
  },
  {
    name: "Corners",
    rows: [corner("top-left", "Top-left"), corner("top-right", "Top-right"), corner("bottom-left", "Bottom-left"), corner("bottom-right", "Bottom-right")],
  },
  { name: "Textbook pages", rows: [setting("pageBandMm", "Dark band", [2, 3, 5, 10], unit(" mm"))] },
  {
    name: "Appearance",
    rows: [
      setting("textPx", "Text size", [12, 14, 16, 18, 20, 24, 28, 32], unit(" px")),
      setting("codingSpaceGrey", "Coding space brightness", [0, 6, 12, 20, 32, 48], String),
    ],
  },
  { name: "Rig", rows: [{ type: "action", label: "Calibrate", action: "calibrate" }] },
  // Read-back is the only Debug setting (#181).
  { name: "Debug", rows: [setting("readBack", "Read-back on every card", [false, true], onOff)] },
];
