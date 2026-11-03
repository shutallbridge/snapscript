// The sketch view's bridge to main: sketch commands in, frames and errors out. The watchdog's port
// is handed on to the page, which gives it to the watchdog worker.
import { contextBridge, ipcRenderer } from "electron";
import type { SketchMessage } from "../session.ts";
import type { SketchViewCommand } from "../sketch/host.ts";

export interface SketchBridge {
  onCommand(f: (command: SketchViewCommand) => void): void;
  send(message: SketchMessage): void;
  /** Says the view is up, and whether it can share memory with a worker. */
  hello(info: { crossOriginIsolated: boolean }): void;
  /** Where each run's canvas sits in the view: centred, or at its top-left (a Windows setting). */
  onSketchAt(f: (at: "centre" | "top-left") => void): void;
}

const bridge: SketchBridge = {
  onCommand: (f) => void ipcRenderer.on("command", (_, command: SketchViewCommand) => f(command)),
  send: (message) => ipcRenderer.send("sketch", message),
  hello: (info) => ipcRenderer.send("sketch hello", info),
  onSketchAt: (f) => void ipcRenderer.on("sketch at", (_, at: "centre" | "top-left") => f(at)),
};
contextBridge.exposeInMainWorld("sketch", bridge);

ipcRenderer.on("watchdog", (event) => window.postMessage("watchdog", "*", event.ports));
