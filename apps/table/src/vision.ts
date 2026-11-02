// The table app's side of the vision service (#181 "snapscript-vision (changes)"): it starts the
// service, connects over local TCP (JSON lines both ways) and sends the marker data first (#184).
import { connect, type Socket } from "node:net";
import { join } from "node:path";
import { tableMarkers } from "@snapscript/core";
import type { LanguageMarker, LibraryCardEntry, PageEntry } from "@snapscript/table-reader";
import type { Project } from "./project.ts";

/** The `markers` message: the reader's loaded shapes keyed by marker ID, and the table's own markers. */
export interface MarkersMessage {
  type: "markers";
  languageMarkers: Record<string, LanguageMarker>;
  lockfile: Record<string, LibraryCardEntry | PageEntry>;
  ruler: number[];
  ruler_mm: number;
  calibration: number[];
}

export function markersMessage(project: Pick<Project, "languageMarkers" | "lockfile">): MarkersMessage {
  return {
    type: "markers",
    languageMarkers: Object.fromEntries([...project.languageMarkers].map(([id, m]) => [String(id), { card: m.card, length: m.length }])),
    lockfile: Object.fromEntries([...project.lockfile].map(([id, e]) => [String(id), { ...e }])),
    ruler: [...tableMarkers.ruler.markers],
    ruler_mm: tableMarkers.ruler.distanceMm,
    calibration: [...tableMarkers.calibration],
  };
}

export interface VisionLink {
  /** Sends a command (a calibration step) as one JSON line; dropped while not connected. */
  send(message: object): void;
  close(): void;
}

export interface VisionLinkOptions {
  port: number;
  host?: string;
  markers: MarkersMessage;
  /** Each JSON line the service sends: table states, calibration results. */
  onMessage(message: unknown): void;
  /** How long to wait before trying again, while the service isn't listening or after it went. */
  retryMs?: number;
}

/** Connects to the service, and again whenever the connection goes; the markers message goes first each time. */
export function connectVision(options: VisionLinkOptions): VisionLink {
  const { port, host = "127.0.0.1", markers, onMessage, retryMs = 500 } = options;
  let socket: Socket | null = null;
  let closed = false;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const open = (): void => {
    const s = connect(port, host);
    s.setNoDelay(true);
    let buf = "";
    s.on("connect", () => {
      socket = s;
      s.write(JSON.stringify(markers) + "\n");
    });
    s.on("data", (d) => {
      buf += d;
      for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        if (line.trim()) onMessage(JSON.parse(line));
      }
    });
    s.on("error", () => {});
    s.on("close", () => {
      if (socket === s) socket = null;
      if (!closed) retry = setTimeout(open, retryMs);
    });
  };
  open();
  return {
    send(message) {
      socket?.write(JSON.stringify(message) + "\n");
    },
    close() {
      closed = true;
      clearTimeout(retry);
      socket?.destroy();
    },
  };
}

export interface VisionCommandOptions {
  /** The repo: the service runs from its Python workspace's uv venv (docs/rig-setup.md). */
  repo: string;
  platform: NodeJS.Platform;
  lineup: string;
  port: number;
  /** The frame source; the rig's camera if not given. */
  source?: string;
  /** Who reads handwriting; the service's default (the cloud) if not given. */
  reader?: string;
}

/** How to start the service: on Linux (the rig) pinned to cores 0-1, leaving 2-3 for the sketch. */
export function visionCommand(options: VisionCommandOptions): { command: string; args: string[]; cwd: string } {
  const cwd = join(options.repo, "python");
  const python = join(cwd, ".venv", "bin", "python");
  const args = ["-u", "-m", "snapscript_vision", "--source", options.source ?? "camera", "--lineup", options.lineup, "--port", String(options.port)];
  if (options.reader) args.push("--reader", options.reader);
  return options.platform === "linux" ? { command: "taskset", args: ["-c", "0,1", python, ...args], cwd } : { command: python, args, cwd };
}
