// A stand-in for the vision service, for the Electron smoke start: it waits for the markers
// message, then lays a few programs in turn, as table states. Run by smoke.ts.
//
//   node test/smoke/fake-vision.ts PORT
import { createServer } from "node:net";
import { languageMarkers } from "@snapscript/core";

const port = Number(process.argv[2] ?? 8115);
const U = 30;
const marker = (card: string): number => [...languageMarkers].find(([, m]) => m.card === card)![0];
const length = (id: number): number => languageMarkers.get(id)?.length ?? LOCKED[id]!;
/** confetti's lockfile: createCanvas, background, define setup. */
const CREATE_CANVAS = 400;
const BACKGROUND = 401;
const SETUP = 406;
const LOCKED: Record<number, number> = { 400: 4, 401: 3, 406: 4 };
const NUM = marker("[num{}]");
const REPEAT = marker("[repeat]");

type Laid = [marker: number, text?: string];

/** A strip: its head at (150, 150) mm, clear of the top-left corner, each line under it at its indent (in U), cards end to end. */
function strip(...lines: [indent: number, ...cards: Laid[]][]): object[] {
  const cards: object[] = [];
  lines.forEach(([indent, ...line], i) => {
    let x = 150 + indent * U;
    for (const [m, text] of line) {
      const c: Record<string, unknown> = { track: cards.length + 1, marker: m, x: x + 8.5, y: 150 + i * U + 15, angle: 0 };
      if (text !== undefined) c.hw = { state: "read", text };
      cards.push(c);
      x += length(m) * U;
    }
  });
  return cards;
}

const setup = (...lines: [number, ...Laid[]][]) =>
  strip([0, [SETUP]], [0, [CREATE_CANVAS], [NUM, "500"], [NUM, "300"]], ...lines);

/** What is laid, and for how long. */
const programs: [string, object[], number][] = [
  ["a 500 x 300 mediumblue canvas", setup([0, [BACKGROUND], [marker("[color(mediumblue)]")]]), 3],
  ["the background changed to gold: a restart in the same process", setup([0, [BACKGROUND], [marker("[color(gold)]")]]), 3],
  ["a setup that never ends: frozen, so the process is killed", setup([0, [REPEAT], [NUM, "1000000000000"]], [1, [BACKGROUND], [marker("[color(gold)]")]]), 6],
  ["tomato: a fresh process", setup([0, [BACKGROUND], [marker("[color(tomato)]")]]), 3],
];

let seq = 0;
const server = createServer((socket) => {
  let buf = "";
  socket.on("data", async (d) => {
    buf += d;
    if (!buf.includes("\n")) return;
    let first: { type?: string };
    try {
      first = JSON.parse(buf.slice(0, buf.indexOf("\n")));
    } catch {
      return void socket.destroy();
    }
    if (first.type !== "markers" || seq > 0) return;
    console.log("fake vision: markers came");
    for (const [what, cards, seconds] of programs) {
      console.log("fake vision: laying", what);
      seq += 1;
      socket.write(JSON.stringify({ type: "state", seq, t: Date.now() / 1000, mm_per_projector_height: 781, cards, page: null }) + "\n");
      await new Promise((r) => setTimeout(r, seconds * 1000));
    }
    console.log("fake vision: done");
    server.close();
    socket.destroy();
  });
});
server.listen(port, "127.0.0.1", () => console.log(`fake vision: listening on 127.0.0.1:${port}`));
