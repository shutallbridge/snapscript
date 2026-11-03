// The frozen-sketch watchdog (#187): a worker in the sketch view's own process, since shared memory
// can't cross processes. It reads each run's text position and sends it to main over a port, every
// `SEND_EVERY_MS`, even while the page's thread is stuck in the program.
/** How often the watchdog sends each run's text position, in ms: well inside the frozen sketch's 3 s. */
const SEND_EVERY_MS = 250;

type Message = { type: "port" } | { type: "watch"; run: number; position: Int32Array } | { type: "unwatch"; run: number };

let port: MessagePort | null = null;
const watched = new Map<number, Int32Array>();

self.onmessage = (event: MessageEvent<Message>) => {
  const m = event.data;
  if (m.type === "port") port = event.ports[0] ?? null;
  else if (m.type === "watch") watched.set(m.run, m.position);
  else watched.delete(m.run);
};

setInterval(() => {
  for (const [run, position] of watched) port?.postMessage({ run, start: Atomics.load(position, 0), end: Atomics.load(position, 1) });
}, SEND_EVERY_MS);
