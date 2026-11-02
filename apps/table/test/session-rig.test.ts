// Batch 1's rig recordings (#166) replayed through the table session: while nobody touches the
// table, nothing restarts.
import { describe, expect, test } from "vitest";
import type { TableState } from "@snapscript/table-reader";
import { loadProject } from "../src/project.ts";
import { createSession, type SessionProject } from "../src/session.ts";
import { ENTRY, languageMarkers, layout, lockfile, recording } from "../../../packages/table-reader/test/rig/replay.ts";
import { fixtureProject } from "./helpers.ts";

const project: SessionProject = {
  entry: { id: "/project/main.snap", text: ENTRY },
  loader: loadProject(fixtureProject({ dependencies: ["snapscript-p5"], lock: null })).loader,
  lockfile,
  languageMarkers,
  cards: [],
};

/**
 * A recording's table states, as today's vision service sends them. This run's service also sent
 * `blank` for a card it was reading again; today's decides blank from the ink, without the cloud,
 * and keeps a card's text while it reads it again (#147), so those are read as `reading`.
 */
function states(name: string): TableState[] {
  const lastText = new Map<number, string>();
  return recording(name).map((state) => ({
    ...state,
    cards: state.cards.map((c) => {
      if (c.hw?.text !== undefined) lastText.set(c.track, c.hw.text);
      else if (c.hw?.state === "blank" && lastText.has(c.track)) return { ...c, hw: { state: "reading", text: lastText.get(c.track) } };
      return c;
    }),
  }));
}

/**
 * Plays a recording through a session, on its own clock from 0, with a sketch view whose newest
 * run draws a frame every second (and at each table state). Gives the times runs started; no run
 * freezes.
 */
function starts(name: string): number[] {
  const session = createSession({ project, layout });
  const recorded = states(name);
  const started: number[] = [];
  let latest: number | null = null;
  const frame = (now: number) => {
    if (latest !== null) session.handle({ type: "sketch", now, message: { type: "frame", run: latest } });
  };
  let last = 0;
  for (const state of recorded) {
    const now = state.t - recorded[0]!.t;
    for (let t = last + 1; t < now; t += 1) frame(t);
    last = now;
    for (const c of session.handle({ type: "table", now, state }).sketch) {
      if (c.type !== "start") continue;
      started.push(now);
      latest = c.run;
    }
    frame(now);
  }
  expect(session.scene.frozen).toBe(false);
  return started;
}

describe("the rig recordings, through the session", () => {
  test("the walking skeleton's (#115): no restart after the first full read (7.70 s) to the end", () => {
    const started = starts("snap-115-vision-20261102-224407");
    expect(started.length).toBeGreaterThan(0);
    expect(started.filter((t) => t > 7.71)).toEqual([]);
  });

  test("the steady table's (#147): no restart once its cards are read", () => {
    const started = starts("snap-147-vision-20261103-015737");
    expect(started.length).toBeGreaterThan(0);
    expect(started.filter((t) => t > 3.8)).toEqual([]);
  });

  test("the steady table's lift run (#147): no restart until the first lift", () => {
    const started = starts("snap-147-vision-20261103-012950");
    expect(started.filter((t) => t > 2.7 && t < 56)).toEqual([]);
  });
});
