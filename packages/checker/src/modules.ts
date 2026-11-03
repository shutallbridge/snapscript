// Modules (REFERENCE.md §5): imports go through a module loader passed to
// the checker, which never touches disk or npm itself. Each module is loaded
// and checked once, and its top-level declarations that count are its
// attributes.
import { firstStage, type Signature } from "@snapscript/core";
import { parse, type Declaration, type Program } from "@snapscript/parser";
import type { CheckError, CheckedProgram } from "./index.ts";

/** A module's source text, and the id the loader knows it by. */
export interface LoadedModule {
  /** Names the module: two imports that load one module give the same id. */
  id: string;
  text: string;
}

/**
 * Resolves an import to a module's source text: a package name (through its
 * `package.json` `"snapscript"` entry) or a path starting `./` or `../`.
 */
export interface ModuleLoader {
  /**
   * The module `source` names, imported from the module `from` (its id), or
   * from the program being checked when `from` is `null`. `null` when
   * nothing resolves.
   */
  load(source: string, from: string | null): LoadedModule | null;
}

/** What a module's attribute is. A global can be any type. */
export type Member =
  | { type: "function"; text: string; overloads: readonly Signature[] }
  | { type: "value" }
  | { type: "module"; text: string; module: ModuleInfo | null };

/** A loaded module: its attributes, by name key, and its checked program. */
export interface ModuleInfo {
  id: string;
  attributes: ReadonlyMap<string, Member>;
  program: CheckedProgram;
}

/** What the module each import line loads: `null` when the import fails, or isn't loaded. */
export type ImportedModules = ReadonlyMap<Declaration, ModuleInfo | null>;

export class Modules {
  private readonly resolved = new Map<string, LoadedModule | null>();
  /** Every module loaded, by id. */
  private readonly byId = new Map<string, LoadedModule>();
  private readonly edges = new Map<string, { source: string; to: string }[]>();
  private readonly infos = new Map<string, ModuleInfo | "checking">();

  constructor(
    private readonly loader: ModuleLoader,
    /** Checks a module's text, and gives its attributes. */
    private readonly checkModule: (module: LoadedModule) => ModuleInfo,
  ) {}

  private resolve(source: string, from: string | null): LoadedModule | null {
    const key = `${from ?? ""}\0${source}`;
    if (!this.resolved.has(key)) {
      const loaded = this.loader.load(source, from);
      this.resolved.set(key, loaded);
      if (loaded && !this.byId.has(loaded.id)) this.byId.set(loaded.id, loaded);
    }
    return this.resolved.get(key)!;
  }

  /** The imports a module makes that can load: lines with no structure error, and the ids they load. */
  private importsOf(module: LoadedModule): { source: string; to: string }[] {
    let found = this.edges.get(module.id);
    if (!found) {
      const { program, errors } = parse(module.text, []);
      const broken = new Set(errors.map((e) => e.line));
      found = [];
      for (const d of program.declarations) {
        if (d.type !== "import" || broken.has(d.line)) continue;
        const to = this.resolve(d.source, module.id);
        if (to) found.push({ source: d.source, to: to.id });
      }
      this.edges.set(module.id, found);
    }
    return found;
  }

  /**
   * The modules passed through on the shortest way from `start` back to
   * `target`, each named as its importer wrote it, or `null` when `start`
   * never imports `target`.
   */
  private wayBack(start: LoadedModule, startSource: string, target: string): string[] | null {
    const came = new Map<string, { from: string | null; source: string }>([[start.id, { from: null, source: startSource }]]);
    const queue: LoadedModule[] = [start];
    while (queue.length > 0) {
      const module = queue.shift()!;
      for (const edge of this.importsOf(module)) {
        if (edge.to === target) {
          const names: string[] = [];
          for (let at: string | null = module.id; at !== null; at = came.get(at)!.from) names.unshift(came.get(at)!.source);
          return names;
        }
        if (came.has(edge.to)) continue;
        came.set(edge.to, { from: module.id, source: edge.source });
        queue.push(this.byId.get(edge.to)!);
      }
    }
    return null;
  }

  /**
   * Loads the modules a program's import lines name. A module that can't be
   * found, or that leads back to the importing module, is an `ImportError`.
   */
  imports(program: Program, absent: ReadonlySet<number>, id: string | null): { errors: CheckError[]; modules: ImportedModules } {
    const errors: CheckError[] = [];
    const modules = new Map<Declaration, ModuleInfo | null>();
    for (const d of program.declarations) {
      if (d.type !== "import" || absent.has(d.line)) continue;
      const error = (message: string) =>
        errors.push({ kind: "ImportError", message, stage: firstStage("ImportError"), line: d.line, spans: [d.card.span], aboutCardText: false, followsFrom: null, suggestion: null });
      const loaded = this.resolve(d.source, id);
      if (!loaded) {
        error(/^\.\.?\//.test(d.source) ? `${d.source} can't be found` : `${d.source} isn't installed`);
        continue;
      }
      if (loaded.id === id) {
        error("this module imports itself");
        continue;
      }
      const through = id === null ? null : this.wayBack(loaded, d.source, id);
      if (through) {
        error(`this module imports itself, through ${through.join(" and ")}`);
        continue;
      }
      modules.set(d, this.info(loaded));
    }
    return { errors, modules };
  }

  /** A module's attributes, checking it the first time. */
  private info(module: LoadedModule): ModuleInfo | null {
    const found = this.infos.get(module.id);
    if (found === "checking") return null;
    if (found) return found;
    this.infos.set(module.id, "checking");
    const info = this.checkModule(module);
    this.infos.set(module.id, info);
    return info;
  }
}
