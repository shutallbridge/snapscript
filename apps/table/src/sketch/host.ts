// The sketch view's host (#181 "Processes"): it runs each program the session starts, with its own
// p5 instance and its own copy of each native module, in a container of its own, and tells the
// session about frames and errors. It has no Electron in it: the sketch view's renderer gives it
// p5, the DOM and the way back to main.
import { run as runProgram, type NativeModule, type Run, type RunError } from "@snapscript/runtime";
import type { SketchMessage } from "../session.ts";

/** A native module's source, for the sketch view to load: main reads the file. */
export interface NativeModuleSource {
  id: string;
  source: string;
}

/** The session's sketch commands as the sketch view gets them: a start carries its natives' sources. */
export type SketchViewCommand =
  | { type: "start"; run: number; js: string; natives: NativeModuleSource[] }
  | { type: "show"; run: number }
  | { type: "stop"; run: number }
  | { type: "kill"; run: number };

/** Where one run draws. */
export interface RunContainer {
  /** What p5 is given to draw in. */
  element: unknown;
  show(): void;
  hide(): void;
  remove(): void;
}

/** The part of p5's instance mode the host needs: it removes a killed run's instances. */
type P5 = new (sketch: (p: never) => void, container?: unknown) => { remove(): void };

export interface SketchHostOptions {
  /** p5's constructor, given to each run's native modules through their `mount`. */
  p5: P5;
  /** A new, hidden container for a run. */
  container(run: number): RunContainer;
  /** A fresh copy of each native module for a run: a module keeps state, so runs never share one. */
  load(natives: NativeModuleSource[], run: number): Promise<Record<string, NativeModule>>;
  send(message: SketchMessage): void;
  /** Where a run keeps the text position it is at, for the frozen-sketch watchdog. */
  position?(run: number): Int32Array | undefined;
  /** The clock, in seconds. */
  now?(): number;
  /** After a run's first frame, frames are sent at most this often: the session needs only a heartbeat. */
  frameEveryS?: number;
}

export interface SketchHost {
  /** Commands are done in the order given, each once the one before it is done. */
  handle(command: SketchViewCommand): Promise<void>;
}

interface Live {
  container: RunContainer;
  instances: { remove(): void }[];
  handle: Run | null;
}

const fileOf = (id: string): string => (id.split(/[\\/]/).pop() ?? id).replace(/\.snap$/, ".js");

export function createSketchHost(options: SketchHostOptions): SketchHost {
  const { now = () => performance.now() / 1000, frameEveryS = 0.25 } = options;
  const runs = new Map<number, Live>();
  let queue: Promise<void> = Promise.resolve();

  const start = async (command: Extract<SketchViewCommand, { type: "start" }>): Promise<void> => {
    const { run } = command;
    const live: Live = { container: options.container(run), instances: [], handle: null };
    runs.set(run, live);
    // A run that stopped on an error sends no more frames: the session no longer watches it for freezing.
    let stopped = false;
    const error = (e: RunError) => {
      stopped = true;
      options.send({ type: "error", run, error: e });
    };
    let natives: Record<string, NativeModule>;
    try {
      natives = await options.load(command.natives, run);
    } catch (e) {
      const file = command.natives.length === 1 ? fileOf(command.natives[0]!.id) : "a native module";
      error({ type: "library", kind: null, message: `${file} didn't load: ${e instanceof Error ? e.message : String(e)}`, span: null });
      return;
    }
    // The run's p5 instances, so a kill can remove them.
    const P5 = options.p5;
    function Recorded(sketch: (p: never) => void, element?: unknown) {
      const instance = new P5(sketch, element);
      live.instances.push(instance);
      return instance;
    }
    for (const module of Object.values(natives)) {
      if (typeof module.mount === "function") (module.mount as (p5: unknown, element: unknown) => void)(Recorded, live.container.element);
    }
    let sentAt = -Infinity;
    live.handle = runProgram(command.js, {
      natives: (id) => natives[id] ?? null,
      position: options.position?.(run),
      output: {
        print: () => {},
        error,
        frame: () => {
          const t = now();
          if (stopped || t - sentAt < frameEveryS) return;
          sentAt = t;
          options.send({ type: "frame", run });
        },
      },
    });
  };

  const apply = async (command: SketchViewCommand): Promise<void> => {
    if (command.type === "start") return start(command);
    const live = runs.get(command.run);
    if (!live) return;
    if (command.type === "show") {
      for (const [id, other] of runs) if (id !== command.run) other.container.hide();
      live.container.show();
    } else if (command.type === "stop") live.handle?.stop();
    else {
      for (const instance of live.instances) instance.remove();
      live.container.remove();
      runs.delete(command.run);
    }
  };

  return {
    handle(command) {
      queue = queue.then(() => apply(command));
      return queue;
    },
  };
}
