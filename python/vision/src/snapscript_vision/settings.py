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
    # handwriting (#105, #147, #110)
    hw_steady_frames: int = 3       # a whiteboard crop is judged once it has held steady this many frames (~0.4 s)
    hw_steady_mm2: float = 4.0      # ... changing less than this much ink from one frame to the next
    hw_paper_lo: float = 0.85       # ... and looks like paper: its brightness this many times the white beside
    hw_paper_hi: float = 1.5        #     the marker, up to this (a hand reads about 0.7)
    hw_blank_mm2: float = 6.0       # less ink than this is blank, decided here with no cloud call
    hw_rewrite_mm2: float = 10.0    # this much ink added or removed since the crop that was read is a rewrite ...
    hw_rewrite_frames: int = 3      # ... once it has held this many calm frames
    hw_light_tol: float = 0.15      # no rewrite is judged while the paper is this share off its brightness at the read
    hw_retry_s: float = 5.0         # after a failed request, try again this long after
    # the cloud handwriting reader (`--reader openrouter`); its key is OPENROUTER_API_KEY in the environment
    reader_url: str = "https://openrouter.ai/api/v1/chat/completions"
    reader_model: str = "google/gemma-4-31b-it"
    reader_timeout_s: float = 60.0  # a slow read is still reading; a request that takes longer than this failed
    reader_px_per_mm: float = 8.0   # the whiteboard picture sent to the reader
    # calibration (#132, #172)
    calibration_tries: int = 5      # frames a step looks at before it gives up
    calibration_min_markers: int = 6  # step 1 needs at least this many of its 12 markers seen
    paper_grey: float = 150.0       # step 2 fixes the exposure so the ruler page's paper comes out this grey ...
    paper_tolerance: float = 12.0   # ... give or take this
    exposure_max_ms: float = 50.0   # past this, gain goes up instead
    gain_max: float = 4.0

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
