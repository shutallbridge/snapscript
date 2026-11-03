// Virtual cards and textbook pages (#197, #127, #129): the guide sources the session gives the
// reader (the current page's program, and the values each call card expects), and the scene's
// part of them: the virtual cards to draw, every page's outline to cut out, and a page's status.
import type { CheckResult, ExpectedOverload, ExpectedValue } from "@snapscript/checker";
import type { FunctionColor } from "@snapscript/core";
import { sideOf } from "@snapscript/faces";
import {
  type CardMap,
  type GuideSources,
  type StepOutput,
  type TableState,
  type ValueGuideSource,
} from "@snapscript/table-reader";
import { nameKey, sameName } from "./names.ts";
import { cardQuad, pointOn, type Quad } from "./pose.ts";
import type { Project } from "./project.ts";

/** What the guides need of a loaded project. */
export type GuidesProject = Pick<Project, "entry" | "lockfile" | "cards" | "pages">;

/**
 * A virtual card to draw with `@snapscript/faces`: a stand-in, a page's guide, or a value guide. `text`
 * is its card notation (a value guide's is the card its type takes, `[num{…}]`, or `[{…}]` for a
 * plain guide), `value` a value guide's name, and `at` the whole card on the table, in mm.
 */
export interface VirtualFace {
  id: string;
  kind: "stand-in" | "guide" | "value";
  text: string;
  functionColor: FunctionColor | null;
  value: string | null;
  length: number;
  at: Quad;
}

/** A page on the table: its paper's outline, to cut out of everything projected. */
export interface PageCut {
  track: number;
  outline: Quad;
}

/**
 * A printed page (#128, `pnpm print`): A4, its 13 mm marker's top-left at [187, 274] mm, so the
 * marker's centre (where the camera puts the page) is 193.5 mm along and 280.5 mm down it.
 */
export const PAGE_MM: { width: number; height: number; markerX: number; markerY: number } = { width: 210, height: 297, markerX: 193.5, markerY: 280.5 };

/** The guides' timing: the decided starting values (#129), for the rig to tune. */
export interface GuidesSettings {
  /** With nothing laid after a call card, its forms take turns this often, in seconds. */
  turnS: number;
}

export const defaultGuidesSettings: GuidesSettings = { turnS: 1 };

/** A call card in the checked buffer, and the forms it can take. */
interface Call {
  /** Its key in the reader's value guide ids (`t12`), and its track if it is a real card. */
  key: string;
  track: number | null;
  at: ValueGuideSource["at"];
  overloads: ExpectedOverload[];
  /** How many values are laid after it. */
  laid: number;
}

/** The card a value's guide is drawn as: its type's card, or a plain one with its name. */
function valueCard(value: ExpectedValue): string {
  switch (value.type) {
    case "num":
    case "str":
      return `[${value.type}{…}]`;
    case "color":
      return "[color(…)]";
    default:
      return "[{…}]";
  }
}

/** A form's guides: its values, and a value slot that takes any number while nothing is laid in it. */
function guidesOf(form: ExpectedOverload, laid: number): ExpectedValue[] {
  return form.variadic && laid <= form.values.length ? [...form.values, form.variadic] : form.values;
}

const fits = (form: ExpectedOverload, laid: number): boolean =>
  form.values.length === laid || (form.variadic !== null && laid >= form.values.length);

/**
 * The form the laid values fit: exactly that many values, else the shortest longer one. With
 * nothing laid, `null`: the forms take turns.
 */
function settled(call: Call): ExpectedOverload | undefined {
  const exact = call.overloads.find((f) => fits(f, call.laid));
  if (exact) return exact;
  return call.overloads.filter((f) => f.values.length > call.laid).sort((a, b) => a.values.length - b.values.length)[0];
}

/** How many values each call card in the program has after it, by the call card's text offset. */
function laidValues(program: CheckResult["program"]): Map<number, number> {
  const laid = new Map<number, number>();
  const visit = (node: unknown): void => {
    if (Array.isArray(node)) return node.forEach(visit);
    if (typeof node !== "object" || node === null) return;
    const n = node as { type?: string; args?: unknown[]; card?: { span?: { start: number } } };
    if (n.type === "call" && n.args && n.card?.span) laid.set(n.card.span.start, n.args.length);
    for (const value of Object.values(node)) visit(value);
  };
  visit(program.declarations);
  return laid;
}

/** The packages a program's import lines name, by their local names. */
function importsOf(text: string): Map<string, string> {
  return new Map([...text.matchAll(/\[import\(([^()]+)\)as\(([^()]+)\)\]/gi)].map((m) => [nameKey(m[2]!), m[1]!]));
}

/** A page whose marker lies at (x, y), turned `angle`: its paper, from its top-left corner. */
function pageQuad(x: number, y: number, angle: number): Quad {
  const [px, py] = pointOn({ x, y, angle }, [PAGE_MM.markerX, PAGE_MM.markerY], 0, 0);
  return { x: px, y: py, angle, width: PAGE_MM.width, height: PAGE_MM.height };
}

export interface Guides {
  /** What the reader should show, for the table now. */
  sources(state: TableState, now: number): GuideSources;
  /** The buffer was checked: its call cards' expected values, and which card each span is. */
  checked(result: CheckResult, map: CardMap, now: number): void;
  /** The reader stepped with this table state. */
  see(state: TableState, output: StepOutput): void;
  readonly virtual: VirtualFace[];
  readonly pages: PageCut[];
  /** The top status bar's part: a page from a textbook the project doesn't have. */
  readonly status: string[];
  /** When the next form's turn comes, on the app's clock, or `null`. */
  readonly wakeAt: number | null;
}

export function createGuides(project: GuidesProject, options: { settings?: Partial<GuidesSettings> } = {}): Guides {
  const settings = { ...defaultGuidesSettings, ...options.settings };
  let version = -1;
  let calls: Call[] = [];
  /** When each call card's forms started taking turns, by its key. */
  let since = new Map<string, number>();
  let clock = 0;
  let virtual: VirtualFace[] = [];
  let pages: PageCut[] = [];
  let status: string[] = [];
  const entryImports = importsOf(project.entry.text);
  let pageImports = new Map<string, string>();

  /** The forms that take turns with nothing laid: those with a guide to show. */
  const turns = (call: Call) => call.overloads.filter((f) => f.values.length > 0 || f.variadic);

  const formOf = (call: Call, now: number): ExpectedOverload | undefined => {
    if (call.laid > 0) return settled(call);
    const forms = turns(call);
    if (forms.length === 0) return undefined;
    const turn = Math.floor((now - (since.get(call.key) ?? now)) / settings.turnS + 1e-9);
    return forms[turn % forms.length];
  };

  const pageOf = (state: TableState) => {
    const card = state.page == null ? undefined : state.cards.find((c) => c.track === state.page);
    const entry = card && project.lockfile.get(card.marker);
    if (entry?.kind !== "page") return null;
    const page = project.pages.find((p) => p.textbook === entry.textbook && p.volume === entry.volume && p.page === entry.page);
    return { entry, page: page ?? null };
  };

  const functionColorOf = (text: string, imports: Map<string, string>): FunctionColor | null => {
    const m = /^\[call\(([^().]+)\.([^().]+)\)\]$/i.exec(text);
    if (!m) return null;
    const pkg = imports.get(nameKey(m[1]!));
    const found = project.cards.find((c) => c.card === "call" && c.package === pkg && sameName(c.name, m[2]!));
    return found?.functionColor ?? null;
  };

  return {
    sources(state, now) {
      clock = now;
      const current = pageOf(state);
      const program = current?.page?.program ?? undefined;
      pageImports = program ? importsOf(program) : new Map();
      const values: ValueGuideSource[] = [];
      for (const call of calls) {
        const form = formOf(call, now);
        if (form) values.push({ version, at: call.at, values: guidesOf(form, call.laid) });
      }
      return program === undefined ? { values } : { page: program, values };
    },

    checked(result, map, now) {
      version = map.version;
      const laid = laidValues(result.program);
      const detached = new Set(result.program.detachedLines);
      const keyAt = (line: number, start: number) => {
        const c = map.cards.find((c) => c.span.line === line && c.span.start === start);
        return c && ("track" in c ? { key: `t${c.track}`, track: c.track } : { key: c.standIn, track: null });
      };
      calls = result.expectedValues.flatMap((e) => {
        if (detached.has(e.at.line)) return [];
        const card = keyAt(e.at.line, e.at.start);
        if (!card) return [];
        return [{ ...card, at: { line: e.at.line, start: e.at.start }, overloads: e.overloads, laid: laid.get(e.span.start) ?? 0 }];
      });
      const next = new Map<string, number>();
      for (const call of calls) if (call.laid === 0) next.set(call.key, since.get(call.key) ?? now);
      since = next;
    },

    see(state, output) {
      // A call card on a page guide shows the page's cards, not its own value guides.
      const onPage = new Set(output.places.filter((p) => p.virtual.startsWith("g")).map((p) => `t${p.track}`));
      const laidOf = new Map(calls.map((c) => [c.key, c.laid]));
      virtual = output.virtualCards.flatMap((v): VirtualFace[] => {
        const at = cardQuad(v, v.length);
        if (v.kind !== "value") {
          const imports = v.kind === "guide" ? pageImports : entryImports;
          return [{ id: v.id, kind: v.kind, text: v.card, functionColor: functionColorOf(v.card, imports), value: null, length: v.length, at }];
        }
        const m = /^v\.(.+)\.(\d+)$/.exec(v.id);
        if (m && (onPage.has(m[1]!) || Number(m[2]) <= (laidOf.get(m[1]!) ?? 0))) return [];
        const text = valueCard({ name: v.value, type: v.type as ExpectedValue["type"] });
        return [{ id: v.id, kind: "value", text, functionColor: null, value: v.value, length: v.length, at }];
      });
      pages = state.cards.flatMap((c) => (project.lockfile.get(c.marker)?.kind === "page" ? [{ track: c.track, outline: pageQuad(c.x, c.y, c.angle) }] : []));
      const current = pageOf(state);
      status = current && !current.page ? [`This page is from ${current.entry.textbook}, which isn't in this project, so it shows no guides.`] : [];
    },

    get virtual() {
      return virtual;
    },
    get pages() {
      return pages;
    },
    get status() {
      return status;
    },
    get wakeAt() {
      let at = Infinity;
      for (const call of calls) {
        if (call.laid > 0 || turns(call).length < 2) continue;
        const start = since.get(call.key) ?? clock;
        const turn = Math.floor((clock - start) / settings.turnS + 1e-9);
        at = Math.min(at, start + (turn + 1) * settings.turnS);
      }
      return at === Infinity ? null : at;
    },
  };
}

/** A card's printed label, for a message: `rect` for `[call(p5.rect)]`. */
export function labelOf(card: string): string {
  const side = sideOf(card);
  return side.kind === "handwritten" ? side.keyword : side.kind === "dedent" ? "dedent" : side.label;
}
