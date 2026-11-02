// Settings kept in a file on the Pi, across restarts (#181 "Settings menu").
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, test } from "vitest";
import { createSession } from "../src/session.ts";
import { loadSettings, saveSettings } from "../src/settings-file.ts";
import { defaultTableSettings } from "../src/settings.ts";
import { layout, project } from "./session-helpers.ts";

const file = (): string => join(mkdtempSync(join(tmpdir(), "settings-")), "state", "settings.json");

describe("the settings file", () => {
  test("settings the menu changed survive a restart", () => {
    const path = file();
    const before = createSession({ project, layout, tableSettings: loadSettings(path) });
    for (const key of [",", "Enter", "ArrowLeft", "ArrowDown", "ArrowRight", "Escape", "ArrowUp", "ArrowUp", "Enter", "ArrowRight"]) {
      const out = before.handle({ type: "key", now: 0, key });
      if (out.settings) saveSettings(path, out.settings);
    }

    const after = createSession({ project, layout, tableSettings: loadSettings(path) });
    expect(after.scene.settings).toEqual({ ...defaultTableSettings, splitPercent: 45, fullScreen: true, readBack: true });
  });

  test("no file yet gives the defaults", () => {
    expect(loadSettings(file())).toEqual(defaultTableSettings);
  });

  test("a file that isn't JSON gives the defaults, and a setting it lacks or can't be keeps its default", () => {
    const path = join(mkdtempSync(join(tmpdir(), "settings-")), "settings.json");
    writeFileSync(path, "{ not json");
    expect(loadSettings(path)).toEqual(defaultTableSettings);
    writeFileSync(path, JSON.stringify({ splitPercent: 60, textPx: 13, corners: { "top-left": "help" } }));
    expect(loadSettings(path)).toEqual({
      ...defaultTableSettings,
      splitPercent: 60,
      corners: { ...defaultTableSettings.corners, "top-left": "help" },
    });
  });
});
