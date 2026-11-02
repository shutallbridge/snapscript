// The table app's main process (#181 "The table app"). It holds the table session (the project,
// the buffer, the reader, the checker and the compiler), starts the vision service and carries
// messages: table states in, sketch commands out to the sketch view, the scene out to the table view.
//
// Environment, all optional: SNAPSCRIPT_PROJECT (the project folder; projects/confetti),
// SNAPSCRIPT_VISION=off (don't start the service: connect to one already running),
// SNAPSCRIPT_VISION_PORT (8115), SNAPSCRIPT_VISION_SOURCE (camera), SNAPSCRIPT_VISION_READER (the
// service's default), SNAPSCRIPT_LINEUP (the service's line-up file; ~/.local/state/snapscript/lineup.json),
// SNAPSCRIPT_SETTINGS (the settings menu's file; ~/.local/state/snapscript/settings.json),
// SNAPSCRIPT_SMOKE (a folder: write what the views show there, then quit).
import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, extname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { app, BrowserWindow, ipcMain, MessageChannelMain, protocol, screen, WebContentsView, type MessagePortMain } from "electron";
import type { TableState } from "@snapscript/table-reader";
import type { CalibrationResult } from "../calibration.ts";
import { tableGeometry, type TableGeometry } from "../layout.ts";
import { loadProject } from "../project.ts";
import { createSession, type Session, type SessionEvent, type SketchCommand, type SketchMessage } from "../session.ts";
import { loadSettings, saveSettings } from "../settings-file.ts";
import type { TableSettings } from "../settings.ts";
import type { SketchViewCommand } from "../sketch/host.ts";
import { connectVision, markersMessage, visionCommand, type VisionLink } from "../vision.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
const repo = resolve(here, "../../../..");
const rendererDir = resolve(here, "../renderer");
const env = process.env;
const projectDir = resolve(env.SNAPSCRIPT_PROJECT ?? join(repo, "projects/confetti"));
const port = Number(env.SNAPSCRIPT_VISION_PORT ?? 8115);
const smoke = env.SNAPSCRIPT_SMOKE ? resolve(env.SNAPSCRIPT_SMOKE) : null;
const settingsFile = resolve(env.SNAPSCRIPT_SETTINGS ?? join(homedir(), ".local/state/snapscript/settings.json"));
/** The table's depth until the first table state says: the rig's, roughly. */
const START_MM_PER_PROJECTOR_HEIGHT = 781;

const log = (...args: unknown[]): void => console.log("table:", ...args);
const now = (): number => performance.now() / 1000;

// The views' pages come from this scheme, which sends the headers for cross-origin isolation: the
// sketch view shares memory with its watchdog worker (#187). Each view has its own host, since
// Chromium keeps zoom per origin and only the sketch view is zoomed.
protocol.registerSchemesAsPrivileged([{ scheme: "snapscript", privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
const TYPES: Record<string, string> = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json" };

async function serve(request: Request): Promise<Response> {
  const path = resolve(rendererDir, "." + decodeURIComponent(new URL(request.url).pathname));
  if (relative(rendererDir, path).startsWith("..")) return new Response("not found", { status: 404 });
  try {
    return new Response(await readFile(path), {
      headers: {
        "content-type": TYPES[extname(path)] ?? "application/octet-stream",
        "cross-origin-opener-policy": "same-origin",
        "cross-origin-embedder-policy": "require-corp",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}

/** The sketch view: one renderer process for every run, until a frozen run kills it. */
interface SketchView {
  view: WebContentsView;
  /** Commands go out in order, once the page has loaded. */
  sent: Promise<void>;
  watchdog: MessagePortMain;
}

let win: BrowserWindow;
let tableView: WebContentsView;
let sketchView: SketchView;
let geometry: TableGeometry;
let settings: TableSettings;
let session: Session;
let vision: VisionLink | null = null;
let service: ChildProcess | null = null;
let tick: ReturnType<typeof setTimeout> | undefined;
/** The watchdog's last word on each run: where it is in its program's text. */
const positions = new Map<number, { start: number; end: number }>();

function makeSketchView(): SketchView {
  const view = new WebContentsView({
    webPreferences: { preload: join(here, "../preload/sketch.cjs"), sandbox: true, contextIsolation: true, backgroundThrottling: false },
  });
  view.setBackgroundColor("#000000");
  // Under the table view, which leaves the canvas space clear.
  win.contentView.addChildView(view, 0);
  view.setBounds(geometry.canvasPx);
  const { port1, port2 } = new MessageChannelMain();
  port1.on("message", ({ data }) => positions.set(data.run, { start: data.start, end: data.end }));
  port1.start();
  const loaded = new Promise<void>((done) => view.webContents.once("did-finish-load", () => done()));
  void view.webContents.loadURL("snapscript://sketch/sketch/index.html");
  const sent = loaded.then(() => {
    view.webContents.setZoomFactor(geometry.zoom);
    view.webContents.send("sketch at", settings.sketchAt);
    view.webContents.postMessage("watchdog", null, [port2]);
  });
  view.webContents.on("render-process-gone", (_, details) => log("sketch process gone:", details.reason));
  return { view, sent, watchdog: port1 };
}

function killSketchProcess(): void {
  const old = sketchView;
  // Where each run was stuck, for the session to light that card: after this command's handling is done.
  const stuck = [...positions].filter(([, p]) => p.start >= 0);
  for (const [run, p] of stuck) log(`run ${run} froze at text offsets ${p.start}-${p.end}`);
  setImmediate(() => {
    for (const [run, span] of stuck) handle({ type: "sketch", now: now(), message: { type: "stuck", run, span } });
  });
  positions.clear();
  old.watchdog.close();
  old.view.webContents.forcefullyCrashRenderer();
  win.contentView.removeChildView(old.view);
  old.view.webContents.close();
  sketchView = makeSketchView();
}

async function viewCommand(command: Exclude<SketchCommand, { type: "kill process" }>): Promise<SketchViewCommand> {
  if (command.type !== "start") return command;
  const natives = await Promise.all(command.natives.map(async ({ id, path }) => ({ id, source: await readFile(path, "utf8") })));
  return { ...command, natives };
}

function sketchCommand(command: SketchCommand): void {
  log("sketch:", command.type, "run" in command ? command.run : "");
  if (command.type === "kill process") return killSketchProcess();
  if (command.type === "kill") positions.delete(command.run);
  const target = sketchView;
  // Read the natives now, so commands keep their order. A native module that can't be read is the library's error.
  const ready = viewCommand(command).catch((e: Error) => {
    if (command.type !== "start") throw e;
    const error = { type: "library" as const, kind: null, message: `a native module can't be read: ${e.message}`, span: null };
    handle({ type: "sketch", now: now(), message: { type: "error", run: command.run, error } });
    return null;
  });
  target.sent = target.sent
    .then(async () => {
      const ok = await ready;
      if (ok) target.view.webContents.send("command", ok);
    })
    .catch((e) => log("sketch command failed:", e));
  if (smoke && command.type === "show") void smokeShot(command.run);
}

function handle(event: SessionEvent): void {
  const out = session.handle(event);
  for (const command of out.sketch) sketchCommand(command);
  clearTimeout(tick);
  const at = session.wakeAt;
  if (at !== null) tick = setTimeout(() => handle({ type: "tick", now: now() }), Math.max(0, (at - now()) * 1000) + 1);
  const scene = session.scene;
  const errors = JSON.stringify(scene.errors.map((e) => `${e.kind ?? e.from}: ${e.message}`));
  if (errors !== lastErrors) log("errors:", errors);
  lastErrors = errors;
  tableView.webContents.send("scene", scene);
  for (const command of out.vision) {
    log("vision:", JSON.stringify(command));
    vision?.send(command);
  }
  if (out.settings) setSettings(out.settings);
}
let lastErrors = "[]";

/** The menu changed the settings: keep them, and lay the windows and the sketch out again. */
function setSettings(next: TableSettings): void {
  const relaid = next.splitPercent !== settings.splitPercent || next.fullScreen !== settings.fullScreen;
  const moved = next.sketchAt !== settings.sketchAt;
  settings = next;
  try {
    saveSettings(settingsFile, settings);
  } catch (e) {
    log("the settings weren't kept:", (e as Error).message);
  }
  if (moved) void sketchView.sent.then(() => sketchView.view.webContents.send("sketch at", settings.sketchAt));
  if (relaid) {
    setGeometry(geometry.workArea.height);
    handle({ type: "layout", now: now(), layout: geometry.layout });
  }
}

function geometryFor(mmPerProjectorHeight: number): TableGeometry {
  const { splitPercent, fullScreen } = settings;
  return tableGeometry(screen.getPrimaryDisplay().bounds, mmPerProjectorHeight, { splitPercent, fullScreen });
}

function setGeometry(mmPerProjectorHeight: number): void {
  geometry = geometryFor(mmPerProjectorHeight);
  sketchView.view.setBounds(geometry.canvasPx);
  void sketchView.sent.then(() => sketchView.view.webContents.setZoomFactor(geometry.zoom));
  tableView.webContents.send("geometry", geometry);
}

function onVision(message: unknown): void {
  const m = message as { type?: string };
  if (m.type === "calibration") {
    log("vision:", JSON.stringify(m).slice(0, 200));
    return handle({ type: "vision", now: now(), message: m as CalibrationResult });
  }
  if (m.type !== "state") return log("vision:", JSON.stringify(m).slice(0, 200));
  const state = m as TableState;
  if (state.mm_per_projector_height !== geometry.workArea.height) {
    setGeometry(state.mm_per_projector_height);
    handle({ type: "layout", now: now(), layout: geometry.layout });
  }
  handle({ type: "table", now: now(), state });
}

function startVision(): void {
  if (env.SNAPSCRIPT_VISION === "off") return;
  const lineup = resolve(env.SNAPSCRIPT_LINEUP ?? join(homedir(), ".local/state/snapscript/lineup.json"));
  mkdirSync(dirname(lineup), { recursive: true });
  const { command, args, cwd } = visionCommand({
    repo,
    platform: process.platform,
    lineup,
    port,
    source: env.SNAPSCRIPT_VISION_SOURCE,
    reader: env.SNAPSCRIPT_VISION_READER,
  });
  log("starting the vision service:", command, args.join(" "));
  service = spawn(command, args, { cwd, stdio: ["ignore", "inherit", "inherit"] });
  service.on("error", (e) => log("the vision service didn't start:", e.message));
  service.on("exit", (code, signal) => log("the vision service stopped:", code ?? signal));
}

async function smokeShot(run: number): Promise<void> {
  await new Promise((r) => setTimeout(r, 500));
  const view = sketchView.view;
  const canvases = await view.webContents.executeJavaScript(
    `[...document.querySelectorAll(".run")].filter((r) => r.style.visibility === "visible").flatMap((r) => [...r.querySelectorAll("canvas")]).map((c) => { const b = c.getBoundingClientRect(); return { x: b.x, y: b.y, width: b.width, height: b.height, viewport: [innerWidth, innerHeight] }; })`,
  );
  mkdirSync(smoke!, { recursive: true });
  await writeFile(join(smoke!, `sketch-${run}.png`), (await view.webContents.capturePage()).toPNG());
  await writeFile(join(smoke!, `table-${run}.png`), (await tableView.webContents.capturePage()).toPNG());
  log(`smoke: run ${run} shown`, JSON.stringify({ canvases, bounds: view.getBounds(), zoom: view.webContents.getZoomFactor() }));
}

app.whenReady().then(() => {
  protocol.handle("snapscript", serve);
  const project = loadProject(projectDir);
  log("opened", projectDir);
  const display = screen.getPrimaryDisplay();
  settings = loadSettings(settingsFile);
  geometry = geometryFor(START_MM_PER_PROJECTOR_HEIGHT);
  win = new BrowserWindow({
    ...display.bounds,
    fullscreen: process.platform === "linux",
    frame: false,
    backgroundColor: "#000000",
    show: true,
  });
  tableView = new WebContentsView({
    webPreferences: { preload: join(here, "../preload/table.cjs"), sandbox: true, contextIsolation: true },
  });
  tableView.setBackgroundColor("#00000000");
  win.contentView.addChildView(tableView);
  tableView.setBounds({ x: 0, y: 0, ...display.size });
  sketchView = makeSketchView();
  session = createSession({
    project,
    layout: geometry.layout,
    tableSettings: settings,
    projectorAspect: display.bounds.width / display.bounds.height,
  });

  ipcMain.on("sketch", (event, message: SketchMessage) => {
    if (event.sender === sketchView.view.webContents) handle({ type: "sketch", now: now(), message });
  });
  ipcMain.on("sketch hello", (_, info) => log("sketch view up:", JSON.stringify(info)));
  tableView.webContents.on("before-input-event", (event, input) => {
    if (input.control && input.key.toLowerCase() === "q") {
      event.preventDefault();
      app.quit();
    } else if (input.type === "keyDown" && !input.control && !input.alt && !input.meta) {
      // The settings menu and calibration: the session takes every other key.
      event.preventDefault();
      handle({ type: "key", now: now(), key: input.key });
    }
  });
  tableView.webContents.once("did-finish-load", () => {
    // Keys go to the table view: Ctrl+Q here, and the settings menu's to the session.
    tableView.webContents.focus();
    tableView.webContents.send("geometry", geometry);
    startVision();
    vision = connectVision({ port, markers: markersMessage(project), onMessage: onVision });
  });
  void tableView.webContents.loadURL("snapscript://table/table/index.html");
  win.on("resize", () => {
    const { width, height } = win.getContentBounds();
    tableView.setBounds({ x: 0, y: 0, width, height });
  });
});

app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  vision?.close();
  service?.kill();
});
