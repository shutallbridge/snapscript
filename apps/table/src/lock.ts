// `pnpm lock`: gives each library card and textbook page the project has a marker ID in its lockfile.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { loadProject, LOCKFILE } from "./project.ts";

/** The first ID a lockfile gives, after the language markers. */
export const FIRST_ID = 400;

const HEADER = "# Marker IDs for this project's library cards and textbook pages, kept by pnpm lock.\n";

/**
 * Adds an entry for each library card and page in the project that has none, at the next free ID from 400,
 * and returns the lines added. Entries already there are never changed or removed, even a removed card's,
 * so no ID is renumbered or used twice.
 */
export function lock(dir: string): string[] {
  const project = loadProject(dir);
  let next = Math.max(FIRST_ID - 1, ...project.lockfile.keys()) + 1;
  const added: string[] = [];
  for (const card of project.cards) {
    if (card.marker === null) added.push(`${next++} = ${card.card} ${card.package}.${card.name} ${card.length}`);
  }
  for (const page of project.pages) {
    if (page.marker === null) added.push(`${next++} = page ${page.textbook}/${page.volume} ${page.page}`);
  }
  if (added.length === 0) return added;

  const path = join(project.dir, LOCKFILE);
  let text: string;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    text = "";
  }
  if (text.trim() === "") text = HEADER;
  else if (!text.endsWith("\n")) text += "\n";
  writeFileSync(path, `${text}${added.map((line) => `${line}\n`).join("")}`);
  return added;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dir = resolve(process.argv[2] ?? fileURLToPath(new URL("../../../projects/confetti", import.meta.url)));
  const added = lock(dir);
  console.log(added.length === 0 ? `${join(dir, LOCKFILE)}: nothing to add` : `${join(dir, LOCKFILE)}: added\n${added.map((l) => `  ${l}`).join("\n")}`);
}
