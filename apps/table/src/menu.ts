// The settings menu (#181 "Settings menu", #114): opened on `,`, two levels (sections, then a
// section's settings). `↑↓` choose, `Enter` opens, `←→` change, `Esc` goes back and then closes.
// "Reset all settings" is the last row of the sections and needs a second `Enter`.
import { defaultTableSettings, sections, type TableSettings } from "./settings.ts";

/** A row as the table view draws it: a setting's value, or `null` for a section or an action. */
export interface MenuRowView {
  label: string;
  value: string | null;
  chosen: boolean;
}

/** What the table view draws of the menu: centred, above everything else. */
export interface MenuView {
  /** "Settings", or the open section's name. */
  title: string;
  /** "Settings" above an open section, else `null`. */
  crumb: string | null;
  rows: MenuRowView[];
  /** The keys this level takes, for its last line. */
  keys: string;
}

/** What a key did: the settings it changed, or the action it chose. */
export interface MenuKeyResult {
  settings?: TableSettings;
  action?: "calibrate";
}

const RESET = "Reset all settings";
const RESET_CONFIRM = "Press Enter again to reset all settings";

type State =
  | { level: "closed" }
  | { level: "sections"; row: number; confirm: boolean }
  | { level: "settings"; section: number; row: number };

export interface Menu {
  /** Takes a key, or leaves it (`null`) when the menu is closed and the key doesn't open it. */
  key(key: string, settings: TableSettings): MenuKeyResult | null;
  close(): void;
  view(settings: TableSettings): MenuView | null;
}

export function createMenu(): Menu {
  let state: State = { level: "closed" };
  const wrap = (row: number, n: number): number => (row + n) % n;

  return {
    key(key, settings) {
      if (key === ",") {
        state = state.level === "closed" ? { level: "sections", row: 0, confirm: false } : { level: "closed" };
        return {};
      }
      if (state.level === "closed") return null;
      if (state.level === "sections") {
        const n = sections.length + 1;
        const reset = state.row === sections.length;
        if (key === "ArrowUp") state = { ...state, row: wrap(state.row - 1, n), confirm: false };
        else if (key === "ArrowDown") state = { ...state, row: wrap(state.row + 1, n), confirm: false };
        else if (key === "Escape") state = { level: "closed" };
        else if (key === "Enter" && reset && state.confirm) {
          state = { ...state, confirm: false };
          return { settings: defaultTableSettings };
        } else if (key === "Enter" && reset) state = { ...state, confirm: true };
        else if (key === "Enter") state = { level: "settings", section: state.row, row: 0 };
        else state = { ...state, confirm: false };
        return {};
      }
      const rows = sections[state.section]!.rows;
      const row = rows[state.row]!;
      if (key === "ArrowUp") state = { ...state, row: wrap(state.row - 1, rows.length) };
      else if (key === "ArrowDown") state = { ...state, row: wrap(state.row + 1, rows.length) };
      else if (key === "Escape") state = { level: "sections", row: state.section, confirm: false };
      else if (key === "Enter" && row.type === "action") return { action: row.action };
      else if ((key === "ArrowLeft" || key === "ArrowRight") && row.type === "setting") {
        const i = row.choices.indexOf(row.get(settings));
        const to = Math.max(0, Math.min(row.choices.length - 1, i + (key === "ArrowLeft" ? -1 : 1)));
        if (to !== i) return { settings: row.set(settings, row.choices[to]) };
      }
      return {};
    },
    close() {
      state = { level: "closed" };
    },
    view(settings) {
      if (state.level === "closed") return null;
      if (state.level === "sections") {
        const { row, confirm } = state;
        return {
          title: "Settings",
          crumb: null,
          rows: [
            ...sections.map((s, i) => ({ label: s.name, value: null, chosen: i === row })),
            { label: confirm ? RESET_CONFIRM : RESET, value: null, chosen: row === sections.length },
          ],
          keys: "↑↓ Choose · Enter Open · Esc Close",
        };
      }
      const section = sections[state.section]!;
      const at = state.row;
      return {
        title: section.name,
        crumb: "Settings",
        rows: section.rows.map((r, i) => ({
          label: r.label,
          value: r.type === "setting" ? r.text(r.get(settings)) : null,
          chosen: i === at,
        })),
        keys: section.rows.some((r) => r.type === "action") ? "↑↓ Choose · Enter Start · Esc Back" : "↑↓ Choose · ←→ Change · Esc Back",
      };
    },
  };
}
