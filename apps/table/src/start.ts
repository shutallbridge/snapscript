// `pnpm table`: starts the built table app (#181). On Linux (the rig) it runs pinned to cores 2-3,
// leaving 0-1 for the vision service, which the app starts. Over `ssh rig` it draws on the Pi's
// desktop session (Wayland). Arguments are passed on to Electron.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import electron from "electron";

const app = fileURLToPath(new URL("../", import.meta.url));
// A shell started from an Electron app may say to run Electron as plain Node.
const { ELECTRON_RUN_AS_NODE: _, ...env } = process.env;
let command = electron as unknown as string;
let args = [app, ...process.argv.slice(2)];
if (process.platform === "linux") {
  const runtime = env.XDG_RUNTIME_DIR ?? `/run/user/${process.getuid!()}`;
  env.XDG_RUNTIME_DIR = runtime;
  if (!env.WAYLAND_DISPLAY && existsSync(`${runtime}/wayland-0`)) env.WAYLAND_DISPLAY = "wayland-0";
  if (env.WAYLAND_DISPLAY) args.push("--ozone-platform=wayland");
  args = ["-c", "2,3", command, ...args];
  command = "taskset";
}
const child = spawn(command, args, { env, stdio: "inherit" });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => child.kill(signal));
