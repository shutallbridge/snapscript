// `pnpm print` (#200), in Electron: makes sheets.pdf, pages.pdf and ruler.pdf for a project with
// Chromium's printToPDF, in the project's print/ folder (not committed). It stops with an error,
// and writes nothing, for a kit card with no marker, a page whose program has an error, or a page
// that doesn't fit its A4 sheet.
//
// Arguments: the project folder (projects/confetti), then the folder to write to (<project>/print),
// then a kit file to print in place of the project's kit.yaml, such as a few sheets more.
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow } from "electron";
import { loadKit } from "../kit.ts";
import { loadProject, ProjectError } from "../project.ts";
import { printDocuments, PrintError, type PrintDocument, type PrintDocuments } from "./documents.ts";

const repo = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../../..");
// Electron's own arguments come first; ours follow the script.
const args = process.argv.slice(process.argv.findIndex((a) => a.endsWith("print.js")) + 1).filter((a) => !a.startsWith("-"));
const projectDir = resolve(args[0] ?? join(repo, "projects/confetti"));
const outDir = resolve(args[1] ?? join(projectDir, "print"));
const kitFile = args[2] === undefined ? undefined : resolve(args[2]);

/** The fonts each document must have before it prints: no fallback face may stand in. */
const FONTS = ['400 12px "Geist"', '600 12px "Geist"', '500 12px "Geist Mono"', '400 12px "Geist Mono"', '400 12px "Kalam"'];

/** Run in the page once it has loaded: waits for fonts and images, and says what's wrong with the page. */
const INSPECT = `(async () => {
  const fonts = ${JSON.stringify(FONTS)};
  const missing = [];
  for (const f of fonts) if ((await document.fonts.load(f)).length === 0) missing.push(f);
  await Promise.all([...document.images].map((i) => i.decode().catch(() => {})));
  return {
    missing,
    broken: [...document.images].filter((i) => i.naturalWidth === 0).map((i) => decodeURI(i.src)),
    overflowing: [...document.querySelectorAll(".page")].flatMap((page) =>
      [...page.querySelectorAll(".body")].some((b) => b.scrollHeight > b.clientHeight + 1) ? [page.dataset.page] : []),
  };
})()`;

/** A PDF's page count, from its page objects. */
const pdfPages = (pdf: Buffer): number => pdf.toString("latin1").match(/\/Type\s*\/Page(?![s\w])/g)?.length ?? 0;

async function toPdf(name: string, doc: PrintDocument, scratch: string): Promise<Buffer> {
  const file = join(scratch, `${name}.html`);
  writeFileSync(file, doc.html);
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } });
  try {
    await win.loadFile(file);
    const found = (await win.webContents.executeJavaScript(INSPECT)) as { missing: string[]; broken: string[]; overflowing: string[] };
    if (found.missing.length > 0) throw new PrintError(`${name}.pdf: these fonts didn't load: ${found.missing.join(", ")}`);
    if (found.broken.length > 0) throw new PrintError(`${name}.pdf: these images didn't load: ${found.broken.join(", ")}`);
    if (found.overflowing.length > 0) throw new PrintError(`${name}.pdf: ${found.overflowing.join(", ")} doesn't fit its A4 sheet`);
    const pdf = await win.webContents.printToPDF({ printBackground: true, preferCSSPageSize: true, margins: { top: 0, bottom: 0, left: 0, right: 0 } });
    const pages = pdfPages(pdf);
    if (pages !== doc.pages) throw new PrintError(`${name}.pdf came to ${pages} pages, not ${doc.pages}: something spilled onto another sheet`);
    return pdf;
  } finally {
    win.destroy();
  }
}

async function main(): Promise<void> {
  let docs: PrintDocuments;
  try {
    const project = loadProject(projectDir);
    docs = printDocuments(project, loadKit(project, kitFile));
  } catch (error) {
    if (error instanceof PrintError || error instanceof ProjectError) fail(error.message);
    throw error;
  }
  await app.whenReady();
  const scratch = mkdtempSync(join(tmpdir(), "snapscript-print-"));
  try {
    const pdfs: [string, Buffer][] = [];
    // A project with no kit or no textbooks has nothing for that PDF.
    for (const [name, doc] of Object.entries(docs)) if (doc.pages > 0) pdfs.push([`${name}.pdf`, await toPdf(name, doc, scratch)]);
    mkdirSync(outDir, { recursive: true });
    for (const [file, pdf] of pdfs) {
      writeFileSync(join(outDir, file), pdf);
      console.log(`print: ${join(outDir, file)}`);
    }
  } catch (error) {
    if (error instanceof PrintError) fail(error.message);
    throw error;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

function fail(message: string): never {
  console.error(`print: ${message}`);
  app.exit(1);
  process.exit(1);
}

app.on("window-all-closed", () => {});
main().then(
  () => app.quit(),
  (error) => {
    console.error(error);
    app.exit(1);
  },
);
