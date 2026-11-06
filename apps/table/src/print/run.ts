// `pnpm print`: runs the built print script (src/print/main.ts) in Electron, for printToPDF.
// Arguments are passed on: the project folder, the folder to write to, and a kit file in place of kit.yaml.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import electron from "electron";

const script = fileURLToPath(new URL("../../out/main/print.js", import.meta.url));
// A shell started from an Electron app may say to run Electron as plain Node.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
// Folders are from where `pnpm print` was typed, not this package.
const from = env.INIT_CWD ?? process.cwd();
const args = [script, ...process.argv.slice(2).map((path) => resolve(from, path))];
if (process.platform === "linux") {
  // Over `ssh rig`, Electron needs the Pi's desktop session (Wayland) even for a hidden window.
  const runtime = env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid!()}`;
  env.XDG_RUNTIME_DIR = runtime;
  if (!env.WAYLAND_DISPLAY && existsSync(`${runtime}/wayland-0`)) env.WAYLAND_DISPLAY = "wayland-0";
  if (env.WAYLAND_DISPLAY) args.push("--ozone-platform=wayland");
}
const child = spawn(electron as unknown as string, args, { env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
