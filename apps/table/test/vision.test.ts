// The table app's side of the vision service (#181 "snapscript-vision (changes)", #184): the
// markers message it sends on connecting, the JSON lines both ways, and how it starts the service.
import { createServer, type Server, type Socket } from "node:net";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, test } from "vitest";
import { loadProject } from "../src/project.ts";
import { connectVision, markersMessage, visionCommand, type VisionLink } from "../src/vision.ts";

const confetti = fileURLToPath(new URL("../../../projects/confetti/", import.meta.url));

describe("markersMessage", () => {
  const message = markersMessage(loadProject(confetti));

  test("names the language's cards by marker ID, in the reader's shape", () => {
    expect(message.type).toBe("markers");
    expect(message.languageMarkers["65"]).toEqual({ card: "[num{}]", length: 4 });
    expect(message.languageMarkers["27"]).toEqual({ card: "[on(stop)]", length: 3 });
  });

  test("gives the lockfile's library cards and pages", () => {
    expect(message.lockfile["404"]).toEqual({ kind: "library", card: "call", package: "snapscript-p5", name: "rect", length: 2 });
    expect(message.lockfile["410"]).toEqual({ kind: "page", textbook: "snapscript-p5-getting-started", volume: "confetti", page: 3 });
  });

  test("gives the table's own markers: the ruler page's two and their distance, and calibration's twelve", () => {
    expect(message.ruler).toEqual([312, 313]);
    expect(message.ruler_mm).toBe(257);
    expect(message.calibration).toEqual([300, 301, 302, 303, 304, 305, 306, 307, 308, 309, 310, 311]);
  });

  test("survives JSON: it's what goes down the socket", () => {
    expect(JSON.parse(JSON.stringify(message))).toEqual(message);
  });
});

describe("connectVision", () => {
  let server: Server | undefined;
  let link: VisionLink | undefined;
  afterEach(() => {
    link?.close();
    server?.close();
  });

  /** A stand-in service on a free port: what it is sent, line by line, and its sockets. */
  async function service(): Promise<{ port: number; lines: unknown[]; sockets: Socket[]; nextLine: () => Promise<unknown> }> {
    const lines: unknown[] = [];
    const sockets: Socket[] = [];
    let waiting: (() => void) | null = null;
    server = createServer((socket) => {
      sockets.push(socket);
      let buf = "";
      socket.on("data", (d) => {
        buf += d;
        for (let i = buf.indexOf("\n"); i >= 0; i = buf.indexOf("\n")) {
          lines.push(JSON.parse(buf.slice(0, i)));
          buf = buf.slice(i + 1);
          waiting?.();
        }
      });
    });
    await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
    const port = (server.address() as { port: number }).port;
    const nextLine = async (): Promise<unknown> => {
      const n = lines.length;
      while (lines.length === n) await new Promise<void>((resolve) => (waiting = resolve));
      return lines[n];
    };
    return { port, lines, sockets, nextLine };
  }

  const markers = { type: "markers" as const, languageMarkers: {}, lockfile: {}, ruler: [312, 313], ruler_mm: 257, calibration: [] };

  test("sends the markers message as its first line on connecting", async () => {
    const s = await service();
    link = connectVision({ port: s.port, markers, onMessage: () => {} });
    expect(await s.nextLine()).toEqual(markers);
  });

  test("gives each JSON line the service sends, however the bytes are split", async () => {
    const s = await service();
    const got: unknown[] = [];
    let arrived: () => void = () => {};
    link = connectVision({ port: s.port, markers, onMessage: (m) => (got.push(m), got.length === 2 && arrived()) });
    await s.nextLine();
    s.sockets[0]!.write('{"type": "state", "se');
    s.sockets[0]!.write('q": 1}\n{"type": "state", "seq": 2}\n');
    await new Promise<void>((resolve) => (arrived = resolve));
    expect(got).toEqual([{ type: "state", seq: 1 }, { type: "state", seq: 2 }]);
  });

  test("sends commands as JSON lines", async () => {
    const s = await service();
    link = connectVision({ port: s.port, markers, onMessage: () => {} });
    await s.nextLine();
    link.send({ type: "calibrate", step: 1 });
    expect(await s.nextLine()).toEqual({ type: "calibrate", step: 1 });
  });

  test("keeps trying until the service listens, and sends the markers again when it connects again", async () => {
    const s = await service();
    const port = s.port;
    server!.close();
    s.sockets.length = 0;
    link = connectVision({ port, markers, onMessage: () => {}, retryMs: 20 });
    await new Promise((r) => setTimeout(r, 60));
    await new Promise<void>((resolve) => server!.listen(port, "127.0.0.1", resolve));
    expect(await s.nextLine()).toEqual(markers);
    s.sockets[0]!.destroy();
    expect(await s.nextLine()).toEqual(markers);
  });
});

describe("visionCommand", () => {
  const options = { repo: "/home/rig/snapscript", lineup: "/home/rig/.local/state/snapscript/lineup.json", port: 8115 };

  test("on the rig: the uv venv's Python, pinned to cores 0-1, on the camera", () => {
    expect(visionCommand({ ...options, platform: "linux" })).toEqual({
      command: "taskset",
      args: ["-c", "0,1", "/home/rig/snapscript/python/.venv/bin/python", "-u", "-m", "snapscript_vision",
        "--source", "camera", "--lineup", options.lineup, "--port", "8115"],
      cwd: "/home/rig/snapscript/python",
    });
  });

  test("where there's no taskset (a Mac), unpinned; the source and reader can be given", () => {
    expect(visionCommand({ ...options, platform: "darwin", source: "drawn:scene.json", reader: "fake:reader.json" })).toEqual({
      command: "/home/rig/snapscript/python/.venv/bin/python",
      args: ["-u", "-m", "snapscript_vision", "--source", "drawn:scene.json", "--lineup", options.lineup,
        "--port", "8115", "--reader", "fake:reader.json"],
      cwd: "/home/rig/snapscript/python",
    });
  });
});
