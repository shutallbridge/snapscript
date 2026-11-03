// The table view's bridge to main: it gets the scene to draw, and where things are.
import { contextBridge, ipcRenderer } from "electron";
import type { TableGeometry } from "../layout.ts";
import type { Scene } from "../session.ts";

export interface TableBridge {
  onGeometry(f: (geometry: TableGeometry) => void): void;
  onScene(f: (scene: Scene) => void): void;
}

const bridge: TableBridge = {
  onGeometry: (f) => void ipcRenderer.on("geometry", (_, geometry: TableGeometry) => f(geometry)),
  onScene: (f) => void ipcRenderer.on("scene", (_, scene: Scene) => f(scene)),
};
contextBridge.exposeInMainWorld("table", bridge);
