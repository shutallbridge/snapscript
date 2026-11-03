// The sketch view's renderer: p5 and the runtime library, driven by the sketch host. A watchdog
// worker reads each run's text position from shared memory, so main hears where a frozen run is
// stuck even while this thread can't answer.
import p5 from "p5";
import type { NativeModule } from "@snapscript/runtime";
import type { SketchBridge } from "../../preload/sketch.ts";
import { createSketchHost } from "../../sketch/host.ts";

declare const sketch: SketchBridge;

const watchdog = new Worker(new URL("./watchdog.ts", import.meta.url), { type: "module" });
window.addEventListener("message", (event) => {
  if (event.data === "watchdog" && event.ports[0]) watchdog.postMessage({ type: "port" }, [event.ports[0]]);
});

/** A fresh copy of a native module from its source: each import of a new blob URL is its own module. */
async function load(source: string): Promise<NativeModule> {
  const url = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
  try {
    return (await import(/* @vite-ignore */ url)) as NativeModule;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const host = createSketchHost({
  p5: p5 as never,
  container: () => {
    const element = document.createElement("div");
    element.className = "run";
    document.body.append(element);
    return {
      element,
      show: () => void (element.style.visibility = "visible"),
      hide: () => void (element.style.visibility = "hidden"),
      remove: () => element.remove(),
    };
  },
  load: async (natives) => Object.fromEntries(await Promise.all(natives.map(async (n) => [n.id, await load(n.source)] as const))),
  send: (message) => sketch.send(message),
  // Shared memory needs cross-origin isolation, which main's protocol gives this page.
  position: (run) => {
    if (!crossOriginIsolated) return undefined;
    const position = new Int32Array(new SharedArrayBuffer(8));
    watchdog.postMessage({ type: "watch", run, position });
    return position;
  },
});

sketch.onCommand((command) => {
  void host.handle(command);
  if (command.type === "kill") watchdog.postMessage({ type: "unwatch", run: command.run });
});
sketch.onSketchAt((at) => document.body.classList.toggle("top-left", at === "top-left"));
sketch.hello({ crossOriginIsolated });
