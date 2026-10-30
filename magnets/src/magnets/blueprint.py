"""A card's base: its fixed sizes, the builder's tolerances, and where its
bores go, from the blueprint of the reference base (#75). `parts` builds
the solids, which need build123d; this module doesn't.

Axes: x along the card (0 to L), y across it (0 to W, the top edge at W),
z through it (up is +z, towards the front side). Every size is in mm.
"""

import math
from dataclasses import dataclass, fields
from typing import Any

from .physics import POSITIONS, Edges

# Fixed by the language version and the kit.
U = 30.0
WIDTH = 30.0  # the card's width W, 1U
THICKNESS = 10.0  # the frame's thickness T
MAGNET_DIAMETER = 3.0
MAGNET_THICKNESS = 1.5
LAYER_Z = {"up": 7.5, "down": 2.5}  # each layer's centre: 3T/4 and T/4
SKIN = 0.6  # plastic between a magnet and the outside: thinner won't print, thicker weakens the snap

# Design values from the reference STEP (#74).
CORE_WALL = 2.0
PLATE = 1.2  # a face plate's thickness
BAR_OFFSET = 10.0  # a cross-bar's outer side, from the card's end, at every length
BAR_W = 2.0  # also the centre rib's width
RIB_FROM_LENGTH = 4  # a centre rib from this length up, in U
LEG_T = 1.0
LEG_W = 4.0
FRONT_LEG_Y = (-6.0, 6.0)  # a front face's legs, from the card's centre line: two per end
BACK_LEG_Y = (0.0,)  # a back face's legs: one per end
CATCH_DEPTH = 3.4  # the hook's catch, from the side of the core the leg comes in from
LEG_REACH = 8.8  # the leg's tip, from that same side
HOOK_REACH = 1.4  # the hook's tip, out from the leg; the catch is at 45°
HOOK_FLAT = 1.0
GUSSET = 1.0  # where the leg meets the plate


@dataclass(frozen=True)
class Tolerances:
    """The gaps a builder sets to suit their printer, magnets and paper,
    each on one side, in mm. They never move a bore's centre, so they never
    change what snaps.

    `slide_clearance` is between parts that slide together (the core in the
    frame, and a face's leg past its cross-bar and in its window),
    `sheet_clearance` the room for the paper sheet (a face plate is inset
    this far from the frame's outline and sits this far above it, and a
    single-sided frame's back this far below it), `magnet_clearance` around a
    magnet in its bore, and `magnet_depth_clearance` how far a magnet can
    move front to back. Raises `ValueError` for a negative tolerance, or
    tolerances that leave no wall.
    """

    slide_clearance: float = 0.2
    sheet_clearance: float = 0.2
    magnet_clearance: float = 0.2
    magnet_depth_clearance: float = 0.3

    def __post_init__(self) -> None:
        for f in fields(self):
            value = getattr(self, f.name)
            if not math.isfinite(value) or value < 0:
                raise ValueError(f"{f.name} must be 0 or more, not {value}")
        if self.bore_depth <= 0:
            self._no_wall(
                f"slide_clearance {self.slide_clearance} leaves no bore: it must be less than the magnet's "
                f"thickness {MAGNET_THICKNESS} + magnet_depth_clearance {self.magnet_depth_clearance}"
            )
        if self.bore_diameter >= THICKNESS / 2:
            self._no_wall(
                f"magnet_clearance {self.magnet_clearance} leaves no wall between a pocket's layers: "
                f"its bores must be narrower than {THICKNESS / 2}"
            )
        nearest = float(POSITIONS[0] * U)
        if self.frame_wall + self.bore_diameter / 2 >= nearest:
            self._no_wall(
                f"magnet_depth_clearance {self.magnet_depth_clearance} leaves no wall between the bores at a "
                f"corner: the frame wall {self.frame_wall:g} and a bore's radius must be less than {nearest:g}"
            )

    @staticmethod
    def _no_wall(why: str) -> None:
        raise ValueError(f"tolerances leave no wall: {why}")

    @property
    def frame_wall(self) -> float:
        return SKIN + MAGNET_THICKNESS + self.magnet_depth_clearance - self.slide_clearance

    @property
    def bore_diameter(self) -> float:
        return MAGNET_DIAMETER + 2 * self.magnet_clearance

    @property
    def bore_depth(self) -> float:
        """From the skin to the frame wall's inside: a bore has to reach it, or
        the magnet can't go in. The magnet moves in the bore and the slide gap
        together."""
        return self.frame_wall - SKIN


@dataclass(frozen=True)
class BasePart:
    """One printed part of a base, for cards of one length in U: `kind`
    "frame", for one card class, or "core", "front-face" or "back-face",
    which serve every class (`card_class` None). `solid` is a build123d Part
    in mm, ready to print: laid flat on z = 0, a single-sided frame on its
    built-in back, a core flat and a face on its plate with its legs up.
    `placement` is the build123d Location that puts it where it sits in the
    card: `placement * solid`, in the frame's axes."""

    kind: str
    card_class: str | None
    length: int
    solid: Any
    placement: Any


def bores(edges: Edges, length: int) -> list[tuple[str, float, str]]:
    """(edge, mm along it, layer) of every magnet on a front with these
    edges: along from the left end on top/bottom edges, and up from the
    bottom edge (y) on left/right edges."""
    found = []
    for edge, pockets in edges.items():
        for p in pockets:
            along = float(p.position(length) * U) if edge in ("top", "bottom") else WIDTH - float(p.at * U)
            found += [(edge, along, layer) for layer, pole in (("up", p.up), ("down", p.down)) if pole != "-"]
    return found
