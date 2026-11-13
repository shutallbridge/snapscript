// What `pnpm print` prints for a project (#200): its kit's sheets, its textbooks' pages and the
// ruler page, each an HTML document of A4 pages for Electron to make a PDF of.
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { check } from "@snapscript/checker";
import { tableMarkers, type FunctionColor } from "@snapscript/core";
import { face, markerSvg, SHEET } from "@snapscript/faces";
import type { Node, Parent, RootContent } from "mdast";
import { importsOf, loadKit, type KitCard } from "../kit.ts";
import type { MiniCard, Page, Project } from "../project.ts";

/** A document to print: its HTML, and how many A4 pages it comes to. */
export interface PrintDocument {
  html: string;
  pages: number;
}

export interface PrintDocuments {
  sheets: PrintDocument;
  pages: PrintDocument;
  ruler: PrintDocument;
}

/** Something that mustn't be printed: a kit card with no marker, or a page whose program has an error. */
export class PrintError extends Error {
  override name = "PrintError";
}

/**
 * The project's three documents. Throws `PrintError` for a kit card no marker is given to, a page
 * with no marker, or a page whose program doesn't check clean.
 */
export function printDocuments(project: Project, kit: KitCard[] = loadKit(project)): PrintDocuments {
  const colorOf = functionColors(project);
  return { sheets: sheets(kit, colorOf), pages: pages(project, colorOf), ruler: ruler() };
}

const A4 = { width: 210, height: 297 };

/** Where printing may draw, kept clear of most printers' unprintable edge. */
const PAPER_MARGIN = 10;

const resolveFile = createRequire(import.meta.url).resolve;
const font = (file: string): string => `<link rel="stylesheet" href="${pathToFileURL(resolveFile(file))}">`;
/** Geist for text, Geist Mono for code and card labels, Kalam for handwriting: each from its npm package, no network. */
const FONTS = ["@fontsource/geist/400.css", "@fontsource/geist/600.css", "@fontsource/geist-mono/400.css", "@fontsource/geist-mono/500.css", "@fontsource/kalam/400.css"]
  .map(font)
  .join("");

function document(title: string, css: string, body: string): string {
  return (
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${escape(title)}</title>${FONTS}<style>` +
    `* { box-sizing: border-box; } body { margin: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; } ` +
    `.page { position: relative; overflow: hidden; break-after: page; } .page:last-child { break-after: auto; } ` +
    `.at { position: absolute; display: block; } ${css}</style></head><body>${body}</body></html>`
  );
}

const at = (x: number, y: number, inner: string): string => `<div class="at" style="left:${x}mm;top:${y}mm">${inner}</div>`;

/** A 50 mm bar to check the print's scale with a ruler, its top-left at (x, y). */
function checkBar(x: number, y: number): string {
  return at(
    x,
    y,
    `<svg data-part="check-bar" xmlns="http://www.w3.org/2000/svg" width="62mm" height="5mm" viewBox="0 0 62 5">` +
      `<path d="M0 2 H50 M0 0.5 V3.5 M50 0.5 V3.5" stroke="#000" stroke-width="0.3" fill="none"/>` +
      `<text x="52" y="2" dominant-baseline="central" font-size="2.5" font-family="'Geist Mono', monospace" fill="#71717a">50 mm</text></svg>`,
  );
}

// sheets.pdf

/** Between neighbouring sheets, to cut between. */
const SHEET_GAP = 3;
const CHECK_BAR_ROOM = 8;

interface Placed {
  svg: string;
  x: number;
  y: number;
}

/**
 * The kit's sheets on A4, both sides of a flip pair (its back right after its front), with only the
 * cut lines and a check bar. Sheets are laid in kit order, along rows, a new row when one is full.
 */
function sheets(kit: KitCard[], colorOf: (card: string) => FunctionColor | undefined): PrintDocument {
  const faces = kit.flatMap(({ sides, sheets }) =>
    Array.from({ length: sheets }, () =>
      sides.map((side) => {
        if (side.marker === null) throw new PrintError(`kit card ${side.card} has no marker in the language markers or the lockfile (run pnpm lock?)`);
        return face({ text: side.card, length: side.length, marker: side.marker, functionColor: colorOf(side.card) }, { use: "sheet" });
      }),
    ).flat(),
  );
  const width = A4.width - 2 * PAPER_MARGIN;
  const bottom = A4.height - PAPER_MARGIN - CHECK_BAR_ROOM;
  const pageFaces: Placed[][] = [[]];
  let [x, y, rowHeight] = [0, 0, 0];
  for (const f of faces) {
    if (x > 0 && x + f.widthMm > width) [x, y, rowHeight] = [0, y + rowHeight + SHEET_GAP, 0];
    if (y + f.heightMm > bottom - PAPER_MARGIN && y > 0) {
      pageFaces.push([]);
      [x, y, rowHeight] = [0, 0, 0];
    }
    pageFaces.at(-1)!.push({ svg: f.svg, x: PAPER_MARGIN + x, y: PAPER_MARGIN + y });
    x += f.widthMm + SHEET_GAP;
    rowHeight = Math.max(rowHeight, f.heightMm);
  }
  const body = pageFaces
    .map((placed) => `<section class="page">${placed.map((p) => at(p.x, p.y, p.svg)).join("")}${checkBar(PAPER_MARGIN, A4.height - PAPER_MARGIN - 5)}</section>`)
    .join("");
  return {
    html: document("SnapScript card sheets", `@page { size: A4; margin: 0; } .page { width: ${A4.width}mm; height: ${A4.height}mm; }`, body),
    pages: pageFaces.length,
  };
}

/** A call card's function colour, by the name the entry module imports its library as: `[call(p5.fill)]`. */
function functionColors(project: Project): (card: string) => FunctionColor | undefined {
  const libraries = importsOf(project);
  return (card) => {
    const named = /^\[call\(([^().]+)\.([^()]+)\)\]$/.exec(card);
    if (!named) return undefined;
    const library = libraries.get(named[1]!);
    return project.cards.find((c) => c.card === "call" && c.package === library && c.name === named[2])?.functionColor ?? undefined;
  };
}

// pages.pdf

/** The #128 page: A4, 20 mm margins, the marker's top-left at [187, 274] mm and "PAGE n" level with it. */
const PAGE = { margin: 20, marker: { x: 187, y: 274, size: SHEET.markerMm }, top: "SNAPSCRIPT · GETTING STARTED WITH P5" };

const PAGES_CSS = `
  @page { size: A4; margin: 0; }
  body { font: 11.5pt/1.45 Geist, system-ui, sans-serif; color: #18181b; }
  .page { width: ${A4.width}mm; height: ${A4.height}mm; }
  .body { position: absolute; left: ${PAGE.margin}mm; right: ${PAGE.margin}mm; top: ${PAGE.margin}mm; bottom: ${A4.height - PAGE.marker.y + 3}mm; overflow: hidden; }
  .kicker { font: 8pt "Geist Mono", monospace; color: #71717a; letter-spacing: .02em; }
  h1 { font-size: 24pt; line-height: 1.1; margin: 8mm 0; font-weight: 600; }
  h2 { font-size: 12pt; margin: 6mm 0 2mm; font-weight: 600; }
  h3, h4, h5, h6 { font-size: 11.5pt; margin: 4mm 0 1.5mm; font-weight: 600; }
  p { margin: 0 0 2.5mm; }
  code, pre { font: 10.5pt "Geist Mono", monospace; background: #f4f4f5; }
  code { padding: 0 1mm; }
  pre { padding: 2mm 3mm; margin: 0 0 2.5mm; white-space: pre-wrap; }
  ul, ol { margin: 0 0 2.5mm; padding-left: 5mm; } li { margin-bottom: 1.5mm; } li > p { margin: 0; }
  .minis { white-space: nowrap; } .mini { display: inline-block; vertical-align: -0.5em; margin: 0 .4mm; }
  .mini svg { display: block; }
  img { display: block; max-width: 100%; height: auto; margin: 2mm 0 4mm; }
  blockquote { margin: 4mm 0; }
  blockquote > p:last-child { margin: 0; }
  .callout { background: #fbeadf; border-radius: 2mm; padding: 4mm 5mm; margin: 2mm 0 4mm; font-size: 12pt; }
  .see { border-left: 1.2mm solid #a1a1aa; padding: 1mm 0 1mm 3mm; }
  .foot { position: absolute; left: ${PAGE.margin}mm; top: ${PAGE.marker.y}mm; height: ${PAGE.marker.size}mm; display: flex; align-items: flex-end; }
`;

/** Each textbook page in the #128 layout: its heading and what it shows, its mini cards and images, but not its program. */
function pages(project: Project, colorOf: (card: string) => FunctionColor | undefined): PrintDocument {
  const body = project.pages
    .map((page) => {
      const where = `${page.textbook}/${page.volume} page ${page.page} (${page.heading})`;
      if (page.marker === null) throw new PrintError(`${where} has no marker in the lockfile (run pnpm lock?)`);
      if (page.program !== null) {
        const { errors } = check(page.program, [], { loader: project.loader, id: project.entry.id });
        if (errors.length > 0) throw new PrintError(`${where}'s program has an error: line ${errors[0]!.line}: ${errors[0]!.kind}: ${errors[0]!.message}`);
      }
      const { x, y, size } = PAGE.marker;
      const marker = `<svg class="at" xmlns="http://www.w3.org/2000/svg" style="left:${x}mm;top:${y}mm" width="${size}mm" height="${size}mm" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges">${markerSvg(page.marker, 0, 0, size)}</svg>`;
      return (
        `<section class="page" data-page="${escape(where)}">${marker}<div class="body">` +
        `<div class="kicker">${escape(PAGE.top)}</div><h1>${escape(page.heading)}</h1>${page.content.children.map((n) => html(n, colorOf)).join("")}</div>` +
        `<div class="foot kicker">PAGE ${page.page}</div></section>`
      );
    })
    .join("");
  return { html: document("SnapScript textbook pages", PAGES_CSS, body), pages: project.pages.length };
}

/** A page's markdown as HTML, its mini cards drawn by faces. */
function html(node: RootContent | Node, colorOf: (card: string) => FunctionColor | undefined): string {
  const inner = (): string => ("children" in node ? (node as Parent).children.map((n) => html(n, colorOf)).join("") : "");
  switch (node.type) {
    case "text":
      return escape((node as { value: string }).value);
    case "paragraph":
      return `<p>${inner()}</p>`;
    case "heading":
      return `<h${(node as { depth: number }).depth}>${inner()}</h${(node as { depth: number }).depth}>`;
    case "strong":
      return `<strong>${inner()}</strong>`;
    case "emphasis":
      return `<em>${inner()}</em>`;
    case "delete":
      return `<s>${inner()}</s>`;
    case "inlineCode":
      return `<code>${escape((node as { value: string }).value)}</code>`;
    case "code":
      return `<pre>${escape((node as { value: string }).value)}</pre>`;
    case "break":
      return "<br>";
    case "thematicBreak":
      return "<hr>";
    case "link":
      return `<a>${inner()}</a>`;
    case "list": {
      const tag = (node as { ordered?: boolean | null }).ordered ? "ol" : "ul";
      return `<${tag}>${inner()}</${tag}>`;
    }
    case "listItem":
      return `<li>${inner()}</li>`;
    case "blockquote": {
      // "✴️ See the virtual cards on the table" is the callout; any other quote is a "You should see".
      const callout = /^\s*✴/.test(plain(node));
      return `<blockquote class="${callout ? "callout" : "see"}">${inner()}</blockquote>`;
    }
    case "image": {
      const { url, alt } = node as { url: string; alt?: string | null };
      return `<img src="${escape(/^[a-z]+:/i.test(url) ? url : pathToFileURL(url).href)}" alt="${escape(alt ?? "")}">`;
    }
    case "miniCard": {
      const minis = (node as MiniCard).cards.map((card) => `<span class="mini">${face({ text: card, functionColor: colorOf(card) }, { use: "mini" }).svg}</span>`);
      return `<span class="minis">${minis.join("")}</span>`;
    }
    case "html":
      return "";
    default:
      return inner();
  }
}

const plain = (node: Node): string =>
  "value" in node && typeof node.value === "string" ? node.value : "children" in node ? (node as Parent).children.map(plain).join("") : "";

// ruler.pdf

/** A4 landscape: the ruler's two markers, their centres the lockfile's distance apart across the middle, and a check bar. */
function ruler(): PrintDocument {
  const [width, height] = [A4.height, A4.width];
  const { markers, distanceMm } = tableMarkers.ruler;
  const size = SHEET.markerMm;
  const [x0, x1, y] = [(width - distanceMm) / 2, (width + distanceMm) / 2, height / 2];
  const marker = (id: number, cx: number): string => markerSvg(id, cx - size / 2, y - size / 2, size);
  const svg =
    `<svg class="at" xmlns="http://www.w3.org/2000/svg" style="left:0;top:0" width="${width}mm" height="${height}mm" viewBox="0 0 ${width} ${height}" shape-rendering="crispEdges">` +
    `${marker(markers[0], x0)}${marker(markers[1], x1)}` +
    `<path d="M${x0 + 10} ${y} H${x1 - 10}" stroke="#d4d4d8" stroke-width="0.3"/>` +
    `<text x="${width / 2}" y="${y - 4}" font-size="4" fill="#71717a" text-anchor="middle" font-family="'Geist Mono', monospace" shape-rendering="auto">` +
    `Ruler page: lay it flat in the box during calibration. Marker centres ${distanceMm} mm apart.</text></svg>`;
  const css = `@page { size: A4 landscape; margin: 0; } .page { width: ${width}mm; height: ${height}mm; }`;
  return { html: document("SnapScript ruler page", css, `<section class="page">${svg}${checkBar(x0, height - PAPER_MARGIN - 10)}</section>`), pages: 1 };
}

const escape = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
