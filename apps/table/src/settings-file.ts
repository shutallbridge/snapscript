// The settings menu's file on the Pi (#181 "Settings menu"): read at start, written whole on each change.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { defaultTableSettings, sections, type TableSettings } from "./settings.ts";

/**
 * The settings in a file, over the defaults: a missing file, or one that isn't JSON, gives the
 * defaults, and a setting the file lacks or has a choice the menu doesn't offer keeps its default.
 */
export function loadSettings(path: string): TableSettings {
  let saved: unknown;
  try {
    saved = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return defaultTableSettings;
  }
  if (typeof saved !== "object" || saved === null) return defaultTableSettings;
  let s = defaultTableSettings;
  const file: TableSettings = { ...defaultTableSettings, ...saved, corners: { ...defaultTableSettings.corners, ...(saved as Partial<TableSettings>).corners } };
  for (const row of sections.flatMap((x) => x.rows)) {
    if (row.type === "setting" && row.choices.includes(row.get(file))) s = row.set(s, row.get(file));
  }
  return s;
}

/** Writes the settings to their file, whole: a new file is renamed over the old one. */
export function saveSettings(path: string, settings: TableSettings): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(`${path}.tmp`, JSON.stringify(settings, null, 2) + "\n");
  renameSync(`${path}.tmp`, path);
}
