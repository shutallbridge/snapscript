// The help corner (#181 "Corners", "Help content", #156): a card laid on the bottom-left corner shows
// what it does in a box beside the corner, until it has been gone for about 1 s. Cards in a corner never
// count for the program (the reader leaves them out), so laying one there restarts nothing.
import { builtins } from "@snapscript/core";
import { sideOf } from "@snapscript/faces";
import type { Layout, TableCard, TableState } from "@snapscript/table-reader";
import { U_MM } from "./layout.ts";
import { cardQuad, corners } from "./pose.ts";
import type { Project } from "./project.ts";

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
  /** The box's bottom-left corner: the table view draws it upward and rightward from there, as big as its text. */
  x: number;
  y: number;
}

export const NO_HELP = "No help for this card";
/** The help corner's name in the layout. */
export const HELP_CORNER = "bottom-left";
/** How long the box stays once its card is gone: the vision service takes about 0.85 s a frame (#114). */
export const HELP_GONE_S = 1;
/** The box clears the corner's circle by 0.5U, the card by 1U, and sits 0.5U above the table's edge. */
const CIRCLE_CLEAR_MM = 0.5 * U_MM;
const CARD_CLEAR_MM = U_MM;
const EDGE_CLEAR_MM = 0.5 * U_MM;

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
    const card = project.cards.find((c) => c.card === entry.card && c.package === entry.package && c.name === entry.name);
    const label = card?.label ?? labelOf(`[${entry.card}(${entry.name})]`);
    const help = card?.help.sentence ? card.help : null;
    return { label, sentence: help?.sentence ?? NO_HELP, values: help?.values ?? [], length: entry.length };
  }
  const language = project.languageMarkers.get(marker);
  if (!language) return null;
  const named = language.card.match(/^\[(?:call|get)\(([^()]+)\)\]$/)?.[1];
  const builtin = named === undefined ? undefined : builtins.find((b) => b.name === named);
  if (builtin) return { label: builtin.name, ...builtin.help, length: language.length };
  return { label: labelOf(language.card), sentence: NO_HELP, values: [], length: language.length };
}

/** The x of the card's outline furthest right: from its marker's centre and angle and its length. */
const reach = (c: TableCard, length: number): number => Math.max(...corners(cardQuad(c, length)).map(([x]) => x));

export interface HelpCorner {
  /** A table state came, read with this layout. */
  see(state: TableState, layout: Layout, now: number): void;
  /** The clock. */
  tick(now: number): void;
  readonly box: HelpBox | null;
  /** When the box goes, unless its card comes back first. */
  readonly wakeAt: number | null;
}

export function createHelpCorner(project: HelpProject): HelpCorner {
  let box: HelpBox | null = null;
  /** When the box's card was first seen gone from the corner, or `null` while it lies there. */
  let goneAt: number | null = null;

  return {
    see(state, layout, now) {
      const corner = layout.corners.find((k) => k.name === HELP_CORNER);
      const laid = corner
        ? state.cards.flatMap((c) => {
            if (Math.hypot(c.x - corner.x, c.y - corner.y) >= corner.radius) return [];
            const content = contentOf(c.marker, project);
            return content ? [{ c, content }] : [];
          })
        : [];
      // The card shown stays while it lies there; another card takes over only once it's gone.
      const found = laid.find((l) => l.c.track === box?.track) ?? laid[0];
      if (!found || !corner) {
        goneAt ??= now;
        return this.tick(now);
      }
      goneAt = null;
      const { length, ...content } = found.content;
      box = {
        track: found.c.track,
        ...content,
        x: Math.max(corner.x + corner.radius + CIRCLE_CLEAR_MM, reach(found.c, length) + CARD_CLEAR_MM),
        y: corner.y - EDGE_CLEAR_MM,
      };
    },
    tick(now) {
      if (box && goneAt !== null && now - goneAt >= HELP_GONE_S) box = null;
    },
    get box() {
      return box;
    },
    get wakeAt() {
      return box && goneAt !== null ? goneAt + HELP_GONE_S : null;
    },
  };
}
