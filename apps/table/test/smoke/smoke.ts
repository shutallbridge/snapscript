// The Electron smoke start (#194): the built app against a stand-in vision service, on this
// machine's display. It needs a display, so it isn't part of `pnpm test`: `pnpm smoke` after
// `pnpm table`'s build. It checks the app's log: each program shown, the frozen one killed.
//
// Screenshots of each view at each shown run are written to out/smoke/.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import electron from "electron";

const app = fileURLToPath(new URL("../../", import.meta.url));
const port = 28115;
const out: string[] = [];
const echo = (prefix: string) => (d: Buffer) => {
  for (const line of String(d).split("\n").filter(Boolean)) {
    out.push(line);
    console.log(prefix, line);
  }
};

const vision = spawn(process.execPath, [fileURLToPath(new URL("fake-vision.ts", import.meta.url)), String(port)]);
vision.stdout.on("data", echo("[vision]"));
vision.stderr.on("data", echo("[vision]"));
// A shell started from an Electron app may say to run Electron as plain Node.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
const table = spawn(electron as unknown as string, [app], {
  env: { ...env, SNAPSCRIPT_VISION: "off", SNAPSCRIPT_VISION_PORT: String(port), SNAPSCRIPT_SMOKE: `${app}out/smoke`, SNAPSCRIPT_SETTINGS: `${app}out/smoke/settings.json` },
});
table.stdout.on("data", echo("[table]"));
table.stderr.on("data", echo("[table]"));

// The stand-in's programs take about 15 s; give up after 60.
await new Promise<void>((done) => {
  vision.on("exit", () => done());
  table.on("exit", () => done());
  setTimeout(done, 60_000);
});
vision.kill();
await new Promise((r) => setTimeout(r, 1500));
table.kill();

const has = (pattern: RegExp) => out.some((l) => pattern.test(l));
const checks: [string, boolean][] = [
  ["the sketch view is cross-origin isolated", has(/sketch view up: \{"crossOriginIsolated":true\}/)],
  ["run 1 shown", has(/smoke: run 1 shown/)],
  ["run 2 shown (restarted in the same process)", has(/smoke: run 2 shown/)],
  ["run 3 froze and its process was killed", has(/run 3 froze at/)],
  ["run 4 shown (in a fresh process)", has(/smoke: run 4 shown/)],
];
for (const [what, ok] of checks) console.log(ok ? "ok  " : "FAIL", what);
process.exit(checks.every(([, ok]) => ok) ? 0 : 1);
