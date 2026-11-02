"""The vision service: frames -> markers -> tracks -> table states, sent over local TCP as JSON lines.

    python -m snapscript_vision --source drawn:SCENE.json|recording:PATH|world:WORLD.json|camera \
        --lineup LINEUP.json --markers MARKERS.json [--settings SETTINGS.json] [--port 8115]

It prints `listening on 127.0.0.1:PORT` once the socket is open, starts on its frames when the first client
connects, and exits when its frames run out (the camera's never do).

The line-up file is the service's own: calibration's commands, on the same socket, make it (`calibration.py`). Until
there is one, positions are camera pixels.

A table state is sent only when a card counts, goes, or moves past the dead band. It lists every card:

    {"type": "state", "seq": 42, "t": 1793598123.41, "mm_per_projector_height": 781.0,
     "cards": [{"track": 3, "marker": 1001, "x": 300.0, "y": 210.5, "angle": 0.4},
               {"track": 5, "marker": 2000, "x": 120.0, "y": 80.0, "angle": 0.0}],
     "page": 5}

`x` and `y` are the marker's centre in table mm, and `angle` is in degrees (ADR 0007). `t` is the frame's time.
A page is followed like a card, so it is in `cards` too; `page` is the track of the newest page in view, or null.
A marker the service doesn't know is sent like a card (the table reader makes it an unknown card). The ruler
page's markers, and the ones projected in calibration, are for calibration and aren't sent.
"""

import argparse
import sys
from pathlib import Path

import numpy as np

from pupil_apriltags import Detector

from . import markers as markers_mod
from .calibration import Calibration
from . import sources
from .geometry import Lineup, marker_pose
from .hub import Hub
from .settings import Settings
from .tracker import Sighting, Tracker


def sightings(dets, lineup: Lineup, known):
    out = []
    for d in dets:
        m = known.get(int(d.tag_id))
        if m is not None and m.kind in ("ruler", "calibration"):
            continue  # for calibration (#172), not the table state
        c, a, _ = marker_pose(lineup.to_mm(d.corners))
        out.append(Sighting(int(d.tag_id), c, a))
    return out


def card_json(tr):
    c, a = tr.pose
    return {"track": tr.id, "marker": tr.marker, "x": round(float(c[0]), 1), "y": round(float(c[1]), 1),
            "angle": round(float(a), 1)}


def table_state(live, known):
    """Every track that counts, pages and markers the service doesn't know included, and the current page."""
    cards = [card_json(tr) for tr in live]
    pages = [tr for tr in live if known.get(tr.marker) is not None and known[tr.marker].kind == "page"]
    page = max(pages, key=lambda tr: (tr.counted_at, tr.id), default=None)
    return cards, (page.id if page else None)


def run(args):
    settings = Settings.load(args.settings)
    known = markers_mod.load(args.markers)
    table = markers_mod.load_table(args.markers)
    if Path(args.lineup).exists():
        lineup = Lineup.load(args.lineup)
    else:
        print(f"snapscript-vision: no line-up at {args.lineup} yet: positions are camera pixels until calibration",
              file=sys.stderr, flush=True)
        lineup = Lineup(0.0, np.eye(3), 1.0)
    source = sources.make(args.source, known)
    det = Detector(families=settings.tag_family, nthreads=settings.threads,
                   quad_decimate=settings.quad_decimate, refine_edges=1)
    cal = Calibration(args.lineup, lineup, source, det, table, settings)
    tracker = Tracker(settings)
    hub = Hub(args.port)
    print(f"snapscript-vision: listening on {hub.host}:{hub.port}", flush=True)
    hub.first.wait()

    frames = iter(source)
    seq, last = 0, ([], None, lineup.mm_per_ph)  # an empty table: nothing to send until something counts
    for t, grey in frames:
        while not hub.commands.empty():
            cmd = hub.commands.get()
            if cmd.get("type") == "calibrate":
                hub.send(cal.command(cmd, frames))
        lineup = cal.live
        live = tracker.step(t, sightings(det.detect(grey), lineup, known))
        cards, page = table_state(live, known)
        if (cards, page, lineup.mm_per_ph) != last:
            last = (cards, page, lineup.mm_per_ph)
            seq += 1
            hub.send({"type": "state", "seq": seq, "t": t, "mm_per_projector_height": lineup.mm_per_ph,
                      "cards": cards, "page": page}, keep=True)
    hub.close()


def main(argv=None):
    ap = argparse.ArgumentParser(prog="snapscript-vision")
    ap.add_argument("--source", required=True, help="drawn:SCENE.json, recording:PATH, world:WORLD.json or camera[:lens=DIOPTRES]")
    ap.add_argument("--lineup", required=True, help="the line-up file, which calibration saves")
    ap.add_argument("--markers", required=True, help="the marker data file")
    ap.add_argument("--settings", help="a JSON file of named settings to change")
    ap.add_argument("--port", type=int, default=8115, help="TCP port on 127.0.0.1 (0: any free one)")
    run(ap.parse_args(argv))
    return 0


if __name__ == "__main__":
    sys.exit(main())
