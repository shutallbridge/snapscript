"""The marker family's printed patterns, read from the AprilTag library's own family table.

Used to draw test frames. The pattern of tag `i` is what `apriltag_to_image` gives: a `total_width` square of cells,
True where the cell is printed black.
"""

import ctypes
from functools import cache

import numpy as np
from pupil_apriltags import bindings

FAMILY = "tagStandard41h12"


@cache
def _family():
    libc = bindings.Detector(families=FAMILY).libc
    create = getattr(libc, f"{FAMILY}_create")
    create.restype = ctypes.POINTER(bindings._ApriltagFamily)
    return create().contents


def pattern(tag_id: int) -> np.ndarray:
    """(n, n) bool cells, True = black, as printed (row 0 at the top)."""
    f = _family()
    n, nbits = f.total_width, f.nbits
    white = np.zeros((n, n), bool)
    ring = f.width_at_border + (0 if f.reversed_border else 2)
    s = (n - ring) // 2
    white[s, s:s + ring] = white[s + ring - 1, s:s + ring] = True
    white[s:s + ring, s] = white[s:s + ring, s + ring - 1] = True
    start = (n - f.width_at_border) // 2
    code = f.codes[tag_id]
    for i in range(nbits):
        if code & (1 << (nbits - i - 1)):
            bx = ctypes.c_int32(f.bit_x[i]).value
            by = ctypes.c_int32(f.bit_y[i]).value
            white[by + start, bx + start] = True
    return ~white
