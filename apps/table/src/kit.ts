// The kit: the cards made for a project and how many sheets of each, from its `kit.yaml`.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { shortestLength } from "@snapscript/faces";
import { parse, readCard } from "@snapscript/parser";
import { parse as parseYaml } from "yaml";
import { nameKey, sameName } from "./names.ts";
import { ProjectError, type Project } from "./project.ts";

export const KIT = "kit.yaml";

/** A card made for the project: one side, or a flip pair's two (front first), and how many sheets. */
export interface KitCard {
  sides: KitSide[];
  sheets: number;
}

export interface KitSide {
  /** In card notation as the kit writes it, named as the entry module names it: `[call(p5.fill)]`, `[num{}]`. */
  card: string;
  /** Its shortest length in U. */
  length: number;
  /** Its marker ID in the language markers or the lockfile, or `null` when it has none. */
  marker: number | null;
}

/**
 * Reads the project's `kit.yaml`: one line per card, `"<card>": <sheets>`, a flip pair written
 * `"[num{}] / [str{}]"`. Library cards are named by the entry module's imports, and every card is
 * at its shortest length. A side with no marker is given with `null`; it is printing's to refuse it.
 */
export function loadKit(project: Project): KitCard[] {
  const path = join(project.dir, KIT);
  let data: unknown;
  try {
    data = parseYaml(readFileSync(path, "utf8"));
  } catch (error) {
    throw new ProjectError(`${path} can't be read: ${(error as Error).message}`);
  }
  if (data === null || typeof data !== "object" || Array.isArray(data)) throw new ProjectError(`${path} is one "<card>": <sheets> line per card`);
  const libraries = importsOf(project);
  return Object.entries(data).map(([cards, sheets]): KitCard => {
    if (!Number.isInteger(sheets) || (sheets as number) < 1) throw new ProjectError(`${KIT}: ${cards} needs a whole number of sheets, not ${sheets}`);
    const sides = cards.split("/").map((card) => card.trim());
    if (sides.length > 2) throw new ProjectError(`${KIT}: ${cards} has more than two sides`);
    for (const card of sides) {
      if (!/^\[.*\]$/.test(card) || readCard(card, 0).kind === null) throw new ProjectError(`${KIT}: ${card} isn't a card`);
    }
    return { sides: sides.map((card) => kitSide(card, project, libraries)), sheets: sheets as number };
  });
}

/** The entry module's imports: the name each binds, by its name key → its package. */
export function importsOf(project: Project): Map<string, string> {
  const manifest = JSON.parse(readFileSync(join(project.dir, "package.json"), "utf8")) as { snapscript?: unknown };
  const libraries = new Map<string, string>();
  if (typeof manifest.snapscript !== "string") return libraries;
  for (const d of parse(readFileSync(join(project.dir, manifest.snapscript), "utf8")).program.declarations) {
    if (d.type === "import" && d.binding) libraries.set(d.binding.key, d.source);
  }
  return libraries;
}

function kitSide(card: string, project: Project, libraries: Map<string, string>): KitSide {
  const named = /^\[(call|get|define)\(([^()]+)\)\]$/.exec(card);
  if (named) {
    const [, kind, name] = named;
    const dot = name!.lastIndexOf(".");
    const library = dot > 0 ? libraries.get(nameKey(name!.slice(0, dot))) : undefined;
    const offered = project.cards.find((c) =>
      kind === "define"
        ? c.card === "define" && sameName(c.name, name!)
        : library !== undefined && c.card === kind && c.package === library && sameName(c.name, name!.slice(dot + 1)),
    );
    if (offered) return { card, length: offered.length, marker: offered.marker };
  }
  const length = shortestLength(card);
  for (const [id, marker] of project.languageMarkers) {
    const same = named ? sameName(marker.card, card) : marker.card === card;
    if (same && marker.length === length) return { card, length, marker: id };
  }
  return { card, length, marker: null };
}
