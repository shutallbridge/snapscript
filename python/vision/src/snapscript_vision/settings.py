"""Every threshold the service uses, by name. The defaults are the prototypes' measured starting values (#105, #147);
the rig tunes them with a settings file (JSON, any subset of the names) rather than by editing code."""

import json
from dataclasses import dataclass, fields, replace
from pathlib import Path


@dataclass(frozen=True)
class Settings:
    # the marker search (#105)
    tag_family: str = "tagStandard41h12"
    quad_decimate: float = 2.0
    threads: int = 2
    # tracks (#105)
    gate_mm: float = 40.0           # a sighting goes to the nearest track with its marker within this
    confirm_sightings: int = 2      # a new card counts on this many sightings in a row
    hold_s: float = 30.0            # a covered card goes after this long unseen
    # a missed marker (#147, #170): its spot is compared with the card's face
    face_every_s: float = 1.0       # a seen card's face is refreshed this often
    face_match: float = 0.93        # a spot matching the face this well is the card, its marker just missed
    lift_contrast: float = 0.40     # a spot with under this share of the face's contrast is bare table: lifted
    lift_s: float = 0.5             # a lifted card goes after its spot looks bare this long
    replace_mm: float = 15.0        # a different marker this close to a missed card's spot replaces it at once
    # pose (#105, #132)
    still_mm: float = 1.5           # a reading this close to a card's average is averaged in; farther, it jumps
    smooth: float = 0.25            # the weight of each reading averaged into a still card's pose
    band_mm: float = 2.0            # a move counts past this far ...
    band_deg: float = 3.0           # ... or this much turn

    @classmethod
    def load(cls, path=None):
        s = cls()
        if path is None:
            return s
        given = json.loads(Path(path).read_text())
        names = {f.name for f in fields(cls)}
        unknown = sorted(set(given) - names)
        if unknown:
            raise ValueError(f"unknown settings: {', '.join(unknown)}")
        return replace(s, **given)
