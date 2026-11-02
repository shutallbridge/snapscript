"""A stand-in for libcamera's Python bindings, off the Pi: only the controls the camera source sets."""

import enum


class _AfModeEnum(enum.IntEnum):
    Manual = 0
    Auto = 1
    Continuous = 2


class controls:
    AfModeEnum = _AfModeEnum
