// The project loader: reads a project folder into the shapes the packages take.
import { readFileSync, realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { check, type DocComment, type ModuleLoader } from "@snapscript/checker";
import { diskLoader } from "@snapscript/checker/disk";
import { languageMarkers, type FunctionColor, type Help } from "@snapscript/core";
import { shortestLength, sideOf } from "@snapscript/faces";
import { readCard } from "@snapscript/parser";
import type { Node, Parent, Root, RootContent } from "mdast";
import { fromMarkdown } from "mdast-util-from-markdown";
import type { LanguageMarkers, LibraryCardEntry, Lockfile, PageEntry } from "@snapscript/table-reader";

/** A project, loaded. */
export interface Project {
  dir: string;
  /** Loads what the project's programs import: its libraries from its node_modules. */
  loader: ModuleLoader;
  lockfile: Lockfile;
  languageMarkers: LanguageMarkers;
  /** Every card the project's libraries offer, library by library in the order the project lists them. */
  cards: LibraryCard[];
  /** Every page of the project's textbooks: textbook by textbook, volume by volume, in order. */
  pages: Page[];
}

/** A page of a textbook's volume, from its `#` heading to the next. */
export interface Page {
  textbook: string;
  /** The volume's file name without `.md`: `confetti`. */
  volume: string;
  /** Numbered from 1 in its volume. */
  page: number;
  /** The `#` heading's text. */
  heading: string;
  /** The text of its one ` ```snap ` block, or `null` for none. */
  program: string | null;
  /**
   * What the page shows below its heading, as markdown's tree (mdast), without the program's block.
   * Inline code in card notation is a `miniCard`; images' URLs are the files' paths beside the volume.
   */
  content: Root;
  /** Its marker ID in the lockfile, or `null` when it has none yet. */
  marker: number | null;
}

/** Inline code in card notation: `[call(p5.circle)]`, or a strip such as `[repeat][num{30}]`. */
export interface MiniCard extends Node {
  type: "miniCard";
  /** Each card's notation, in order. */
  cards: string[];
}

declare module "mdast" {
  interface PhrasingContentMap {
    miniCard: MiniCard;
  }
  interface RootContentMap {
    miniCard: MiniCard;
  }
}

/** A card a library offers with a `@card` tag. */
export interface LibraryCard {
  card: "call" | "define" | "get";
  /** The library's package name. */
  package: string;
  /** The function or value it names, as declared. */
  name: string;
  /** The card in card notation, named by its package: `[call(snapscript-p5.circle)]`, `[define(setup)]`. */
  text: string;
  /** What its sheet prints: "circle", "define setup". */
  label: string;
  /** A `[call]` card's function colour (`primary` with no `@color`); `null` for other cards. */
  functionColor: FunctionColor | null;
  /** Its doc comment: the sentence, and a line per value. */
  help: Help;
  /** Its shortest length in U, by the faces' length rule. */
  length: number;
  /** Its marker ID in the lockfile, or `null` when it has none yet. */
  marker: number | null;
}

/** A project file that can't be read, such as a lockfile line that isn't an entry. */
export class ProjectError extends Error {
  override name = "ProjectError";
}

export const LOCKFILE = "snapscript.lock";

const read = (path: string): string | null => {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
};

const readJson = (path: string): Record<string, unknown> | null => {
  const text = read(path);
  if (text === null) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ProjectError(`${path} isn't JSON`);
  }
};

/** An installed package's folder (links followed) and `package.json`, looked for in `node_modules` from `dir` up. */
function installed(name: string, dir: string): { root: string; manifest: Record<string, unknown> } | null {
  for (let at = dir; ; at = dirname(at)) {
    const root = join(at, "node_modules", name);
    const manifest = readJson(join(root, "package.json"));
    if (manifest !== null) return { root: realpathSync(root), manifest };
    if (dirname(at) === at) return null;
  }
}

/** Reads the project in `dir`: its `package.json`, lockfile, libraries and textbooks. */
export function loadProject(dir: string): Project {
  dir = resolve(dir);
  const manifest = readJson(join(dir, "package.json"));
  if (manifest === null) throw new ProjectError(`${dir} has no package.json`);
  const loader = diskLoader(dir);
  const lockfile = readLockfile(read(join(dir, LOCKFILE)) ?? "");
  const cards: LibraryCard[] = [];
  const pages: Page[] = [];
  for (const name of Object.keys((manifest.dependencies as Record<string, string> | undefined) ?? {})) {
    const found = installed(name, dir);
    if (found === null) throw new ProjectError(`${name} isn't installed`);
    if (typeof found.manifest.snapscript === "string") cards.push(...libraryCards(name, loader, lockfile));
    if (Array.isArray(found.manifest.volumes)) pages.push(...textbookPages(name, found.root, found.manifest.volumes, lockfile));
  }
  return { dir, loader, lockfile, languageMarkers, cards, pages };
}

const FUNCTION_COLORS: readonly string[] = ["primary", "secondary", "helper", "setting"];

/** The cards a library's entry module offers with `@card` tags, in text order. */
function libraryCards(library: string, loader: ModuleLoader, lockfile: Lockfile): LibraryCard[] {
  const module = loader.load(library, null);
  if (module === null) throw new ProjectError(`${library}'s entry module can't be found`);
  const { program } = check(module.text, [], { loader, id: module.id });
  const docs: { doc: DocComment; declared: { card: LibraryCard["card"]; name: string } | null }[] = program.docComments.map((doc) => ({ doc, declared: null }));
  for (const d of program.declarations) {
    if (!d.doc) continue;
    const declared =
      (d.type === "extern" || d.type === "define") && d.name ? { card: "call" as const, name: d.name.text } : d.type === "global" && d.name ? { card: "get" as const, name: d.name.text } : null;
    docs.push({ doc: d.doc, declared });
  }
  docs.sort((a, b) => a.doc.span.start - b.doc.span.start);

  const cards: LibraryCard[] = [];
  for (const { doc, declared } of docs) {
    for (const offered of doc.cards) {
      const named = offered === null ? declared : cardNamed(offered);
      if (named === null) continue;
      const text = named.card === "define" ? `[define(${named.name})]` : `[${named.card}(${library}.${named.name})]`;
      const side = sideOf(text);
      const color = doc.color !== null && FUNCTION_COLORS.includes(doc.color) ? (doc.color as FunctionColor) : "primary";
      cards.push({
        ...named,
        package: library,
        text,
        label: side.kind === "printed" ? side.label : named.name,
        functionColor: named.card === "call" ? color : null,
        help: { sentence: doc.description.replace(/\s+/g, " "), values: doc.params.map((p) => ({ name: p.name, about: p.description })) },
        length: shortestLength(text),
        marker: markerOf(lockfile, named.card, library, named.name),
      });
    }
  }
  return cards;
}

/** The card a `@card` tag names: `[define(setup)]`, `[call(p5.circle)]` (named after its last dot). */
function cardNamed(text: string): { card: LibraryCard["card"]; name: string } | null {
  const named = /^\[(call|define|get)\(([^()]+)\)\]$/.exec(text.trim());
  if (!named) return null;
  return { card: named[1] as LibraryCard["card"], name: named[2]!.slice(named[2]!.lastIndexOf(".") + 1) };
}

function markerOf(lockfile: Lockfile, card: string, library: string, name: string): number | null {
  for (const [id, entry] of lockfile) {
    if (entry.kind === "library" && entry.card === card && entry.package === library && entry.name === name) return id;
  }
  return null;
}

/** A textbook's pages: its volumes, listed in its `package.json` `"volumes"`, split at their `#` headings. */
function textbookPages(textbook: string, root: string, volumes: unknown[], lockfile: Lockfile): Page[] {
  const pages: Page[] = [];
  for (const file of volumes) {
    if (typeof file !== "string") throw new ProjectError(`${textbook}'s volumes are file names`);
    const path = join(root, file);
    const text = read(path);
    if (text === null) throw new ProjectError(`${textbook}'s volume ${file} can't be found`);
    const volume = file.replace(/\.md$/, "");
    const tree = fromMarkdown(text);
    resolveImages(tree, dirname(path));
    markMiniCards(tree);
    // Anything before the first heading belongs to no page.
    let current: Page | null = null;
    let page = 0;
    for (const node of tree.children) {
      if (node.type === "heading" && node.depth === 1) {
        page += 1;
        current = { textbook, volume, page, heading: plainText(node), program: null, content: { type: "root", children: [] }, marker: pageMarker(lockfile, textbook, volume, page) };
        pages.push(current);
      } else if (current === null) {
        continue;
      } else if (node.type === "code" && node.lang === "snap") {
        if (current.program !== null) {
          throw new ProjectError(`${textbook}/${volume} page ${current.page} (${current.heading}) has two \`\`\`snap blocks; a page holds at most one program`);
        }
        current.program = node.value;
      } else {
        current.content.children.push(node);
      }
    }
  }
  return pages;
}

function pageMarker(lockfile: Lockfile, textbook: string, volume: string, page: number): number | null {
  for (const [id, entry] of lockfile) {
    if (entry.kind === "page" && entry.textbook === textbook && entry.volume === volume && entry.page === page) return id;
  }
  return null;
}

const plainText = (node: Node): string =>
  "value" in node && typeof node.value === "string" ? node.value : "children" in node ? (node as Parent).children.map(plainText).join("") : "";

/** Points each image at its file beside the volume. */
function resolveImages(node: Node, dir: string): void {
  if (node.type === "image" && "url" in node && typeof node.url === "string" && !/^[a-z]+:/i.test(node.url)) node.url = resolve(dir, decodeURI(node.url));
  if ("children" in node) for (const child of (node as Parent).children) resolveImages(child, dir);
}

/** Turns inline code made only of cards the language knows into mini cards. */
function markMiniCards(node: Node): void {
  if (!("children" in node)) return;
  const parent = node as Parent;
  parent.children = parent.children.map((child): RootContent => {
    if (child.type !== "inlineCode") {
      markMiniCards(child);
      return child;
    }
    const cards = cardsIn(child.value);
    return cards ? ({ type: "miniCard", cards, position: child.position } as MiniCard) : child;
  });
}

/** The cards inline code is made of, or `null` when it is anything else. */
function cardsIn(code: string): string[] | null {
  const cards = code.trim().match(/\[[^[\]]*\]/g);
  if (!cards || cards.join("") !== code.trim()) return null;
  return cards.every((card) => readCard(card, 0).kind !== null) ? cards : null;
}

/**
 * Reads `snapscript.lock`: one entry a line, such as `400 = call snapscript-p5.circle 2`,
 * `401 = define snapscript-p5.setup 4` or `402 = page snapscript-p5-getting-started/confetti 3`.
 * Blank lines and lines starting `#` are skipped.
 */
export function readLockfile(text: string): Lockfile {
  const lockfile = new Map<number, LibraryCardEntry | PageEntry>();
  text.split("\n").forEach((raw, i) => {
    const line = raw.trim();
    if (line === "" || line.startsWith("#")) return;
    const fail = (why: string): never => {
      throw new ProjectError(`${LOCKFILE} line ${i + 1}: ${why}: ${line}`);
    };
    const entry = /^(\d+)\s*=\s*(\w+)\s+(\S+)\s+(\d+)$/.exec(line) ?? fail("not an entry");
    const [, id, kind, what, n] = entry;
    if (lockfile.has(Number(id))) fail(`${id} is listed twice`);
    if (kind === "page") {
      const slash = what!.lastIndexOf("/");
      if (slash <= 0) fail("a page is <textbook>/<volume> <n>");
      lockfile.set(Number(id), { kind: "page", textbook: what!.slice(0, slash), volume: what!.slice(slash + 1), page: Number(n) });
    } else {
      const dot = what!.lastIndexOf(".");
      if (dot <= 0) fail("a card is <library>.<name> <length>");
      lockfile.set(Number(id), { kind: "library", card: kind!, package: what!.slice(0, dot), name: what!.slice(dot + 1), length: Number(n) });
    }
  });
  return lockfile;
}
