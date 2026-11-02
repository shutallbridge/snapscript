// The help corner (#181 "Corners", "Help content", #156): a card laid on a corner set to Help (the
// bottom-left, unless the settings menu says otherwise) shows what it does in a box beside the corner,
// until it has been gone for about 1 s. Cards in a corner never count for the program (the reader
// leaves them out), so laying one there restarts nothing.
import { builtins } from "@snapscript/core";
import { SHEET, sideOf } from "@snapscript/faces";
import type { Layout, TableCard, TableState } from "@snapscript/table-reader";
import { sameName } from "./names.ts";
import { cardQuad, corners } from "./pose.ts";
import type { Project } from "./project.ts";
import type { CornerAction, CornerName } from "./settings.ts";

/** What the help corner needs of a loaded project. */
export type HelpProject = Pick<Project, "lockfile" | "languageMarkers" | "cards">;

/** The help box: what it says and where it goes, in table mm. */
export interface HelpBox {
  /** The card's track. */
  track: number;
  /** The card's label: "rect", "random", "repeat", "num". */
  label: string;
  /** Its one sentence, or "No help for this card". */
  sentence: string;
  /** A line per value, in the order the cards sit, with no types. */
  values: readonly { name: string; about: string }[];
  /** The help corner it is beside, and so which of the box's own corners is at (x, y): the table view draws it away from there, as tall as its text. */
  anchor: CornerName;
  x: number;
  y: number;
  /** Its width, in mm. */
  width: number;
}

export const NO_HELP = "No help for this card";

/** The help corner's timing and gaps: the decided starting values (#181), for the rig to tune. */
export interface HelpSettings {
  /** How long the box stays once its card is gone, in s: the vision service takes about 0.85 s a frame (#114). */
  goneS: number;
  /** The box clears the corner's circle by this, its card by this, and the table's edge by this, in U. */
  circleClearU: number;
  cardClearU: number;
  edgeClearU: number;
  /** The box's width, in U, as in the #114 prototype. */
  widthU: number;
}

export const defaultHelpSettings: HelpSettings = { goneS: 1, circleClearU: 0.5, cardClearU: 1, edgeClearU: 0.5, widthU: 9 };

type Content = Pick<HelpBox, "label" | "sentence" | "values">;

/** What a card's sheet prints: a handwritten card's words, without its whiteboard. */
function labelOf(card: string): string {
  const side = sideOf(card);
  if (side.kind === "dedent") return "dedent";
  if (side.kind === "handwritten") return [side.keyword, side.after].filter(Boolean).join(" … ");
  return side.label;
}

/** What a card's help box says, or `null` for a marker that isn't a card (a page, the table's own). */
function contentOf(marker: number, project: HelpProject): (Content & { length: number }) | null {
  const entry = project.lockfile.get(marker);
  if (entry?.kind === "library") {
    const card = project.cards.find((c) => c.card === entry.card && c.package === entry.package && sameName(c.name, entry.name));
    const label = card?.label ?? labelOf(`[${entry.card}(${entry.name})]`);
    const help = card?.help.sentence ? card.help : null;
    return { label, sentence: help?.sentence ?? NO_HELP, values: help?.values ?? [], length: entry.length };
  }
  const language = project.languageMarkers.get(marker);
  if (!language) return null;
  const named = language.card.match(/^\[(?:call|get)\(([^()]+)\)\]$/)?.[1];
  const builtin = named === undefined ? undefined : builtins.find((b) => sameName(b.name, named));
  if (builtin) return { label: builtin.name, ...builtin.help, length: language.length };
  return { label: labelOf(language.card), sentence: NO_HELP, values: [], length: language.length };
}

/** How far the card's outline reaches across the table: its least and greatest x. */
function reach(c: TableCard, length: number): [number, number] {
  const xs = corners(cardQuad(c, length)).map(([x]) => x);
  return [Math.min(...xs), Math.max(...xs)];
}

export interface HelpCorner {
  /** A table state came, read with this layout, with what each corner does. */
  see(state: TableState, layout: Layout, actions: Readonly<Record<CornerName, CornerAction>>, now: number): void;
  /** The clock. */
  tick(now: number): void;
  readonly box: HelpBox | null;
  /** When the box goes, unless its card comes back first. */
  readonly wakeAt: number | null;
}

export function createHelpCorner(project: HelpProject, settings: Partial<HelpSettings> = {}): HelpCorner {
  const s = { ...defaultHelpSettings, ...settings };
  const U = SHEET.unitMm;
  let box: HelpBox | null = null;
  /** When the box's card was first seen gone from its corner, or `null` while it lies there. */
  let goneAt: number | null = null;

  return {
    see(state, layout, actions, now) {
      // A corner turned from Help to None in the menu closes its box at once.
      if (box && actions[box.anchor] !== "help") box = goneAt = null;
      const laid = layout.corners
        .filter((k) => actions[k.name as CornerName] === "help")
        .flatMap((corner) =>
          state.cards.flatMap((c) => {
            if (Math.hypot(c.x - corner.x, c.y - corner.y) >= corner.radius) return [];
            const content = contentOf(c.marker, project);
            return content ? [{ c, corner, content }] : [];
          }),
        );
      // The card shown stays while it lies there; another card takes over only once it's gone.
      const found = laid.find((l) => l.c.track === box?.track) ?? laid[0];
      if (!found) {
        goneAt ??= now;
        return this.tick(now);
      }
      goneAt = null;
      const { c, corner } = found;
      const { length, ...content } = found.content;
      const anchor = corner.name as CornerName;
      const [least, most] = reach(c, length);
      // Along the corner's edge, on the table's side of the circle and of the card.
      const x = anchor.endsWith("left")
        ? Math.max(corner.x + corner.radius + s.circleClearU * U, most + s.cardClearU * U)
        : Math.min(corner.x - corner.radius - s.circleClearU * U, least - s.cardClearU * U);
      const y = anchor.startsWith("bottom") ? corner.y - s.edgeClearU * U : corner.y + s.edgeClearU * U;
      box = { track: c.track, ...content, anchor, x, y, width: s.widthU * U };
    },
    tick(now) {
      if (box && goneAt !== null && now - goneAt >= s.goneS) box = null;
    },
    get box() {
      return box;
    },
    get wakeAt() {
      return box && goneAt !== null ? goneAt + s.goneS : null;
    },
  };
}
