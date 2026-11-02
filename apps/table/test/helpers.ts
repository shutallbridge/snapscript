// A fixture project in a temporary folder, with its packages linked into its node_modules
// as pnpm would, so the loader and `lock` can read and write it freely.
import { cpSync, mkdtempSync, mkdirSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

export const fixtures: string = fileURLToPath(new URL("./fixtures/", import.meta.url));

/** The packages in `fixtures/`, by package name. */
const packages: Record<string, string> = {
  "fixture-shapes": "shapes",
  "fixture-lessons": "lessons",
  "fixture-two-programs": "two-programs",
};

export interface FixtureOptions {
  /** The project's dependencies, in order; the fixture project's own when left out. */
  dependencies?: string[];
  /** The lockfile's text; `null` for no lockfile. The fixture project's own when left out. */
  lock?: string | null;
}

/** Copies the fixture project into a new folder and returns the project's folder. */
export function fixtureProject(options: FixtureOptions = {}): string {
  const root = mkdtempSync(join(tmpdir(), "snapscript-project-"));
  const dir = join(root, "project");
  cpSync(join(fixtures, "project"), dir, { recursive: true });
  const dependencies = options.dependencies ?? ["fixture-shapes", "fixture-lessons"];
  const manifest = { name: "fixture-project", private: true, snapscript: "main.snap", dependencies: Object.fromEntries(dependencies.map((d) => [d, "workspace:*"])) };
  writeFileSync(join(dir, "package.json"), JSON.stringify(manifest, null, 2));
  if (options.lock === null) writeFileSync(join(dir, "snapscript.lock"), "");
  else if (options.lock !== undefined) writeFileSync(join(dir, "snapscript.lock"), options.lock);
  mkdirSync(join(dir, "node_modules"));
  for (const name of dependencies) symlinkSync(join(fixtures, packages[name]!), join(dir, "node_modules", name), "dir");
  return dir;
}
