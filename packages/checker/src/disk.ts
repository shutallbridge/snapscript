// The default module loader: a thin adapter from the checker's module loader
// to disk and installed packages. It is the only part of the checker that
// touches the file system, and is reached as `@snapscript/checker/disk`.
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { LoadedModule, ModuleLoader } from "./modules.ts";

const read = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

/** The module a package's `package.json` names in `"snapscript"`, looked for in `node_modules` from `dir` up. */
function packageModule(name: string, dir: string): string | null {
  for (let at = dir; ; at = dirname(at)) {
    const root = join(at, "node_modules", name);
    const manifest = read(join(root, "package.json"));
    if (manifest !== null) {
      try {
        const entry: unknown = JSON.parse(manifest).snapscript;
        return typeof entry === "string" ? resolve(root, entry) : null;
      } catch {
        return null;
      }
    }
    if (dirname(at) === at) return null;
  }
}

/**
 * Loads modules from disk. A path is read from the importing file's folder,
 * or from `root` for the program being checked; a package is found in
 * `node_modules`. Each module's id is its absolute path.
 */
export function diskLoader(root: string): ModuleLoader {
  return {
    load(source: string, from: string | null): LoadedModule | null {
      const dir = from === null ? resolve(root) : dirname(from);
      const path = /^\.\.?\//.test(source) ? resolve(dir, source) : packageModule(source, dir);
      if (path === null) return null;
      const text = read(path);
      return text === null ? null : { id: path, text };
    },
  };
}
