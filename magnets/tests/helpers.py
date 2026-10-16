"""Builders for hand-made arrangements and lookups into check results."""

from magnets import CheckResult, Contact

SET_GET = {"set_get.set", "set_get.get"}


def arrangement(flip="top_bottom", **classes):
    """An arrangement holding the given classes' fronts, e.g. `set_get={"top": [...]}`.

    Pockets are written as `(from, at, layers)` on top/bottom edges and
    `(at, layers)` on left/right edges.
    """
    return {"flip": flip, "classes": {name: _edges(edges) for name, edges in classes.items()}}


def set_get(flip="top_bottom", **edges):
    """An arrangement holding only the set_get class, with the given edges."""
    return arrangement(flip, set_get=edges)


def _edges(edges):
    authored = {}
    for edge, pockets in edges.items():
        if edge in ("top", "bottom"):
            authored[edge] = [{"from": f, "at": at, "layers": ly} for f, at, ly in pockets]
        else:
            authored[edge] = [{"at": at, "layers": ly} for at, ly in pockets]
    return authored


def stack(result: CheckResult, upper: str, lower: str, offset: float = 0) -> Contact:
    """The vertical contact with `upper` over `lower` (side names like 'set')."""
    return over(result, f"set_get.{upper}", f"set_get.{lower}", offset)


def over(result: CheckResult, upper: str, lower: str, offset: float = 0) -> Contact:
    """The vertical contact with `upper` over `lower` (sides like 'set_get.set'),
    where exactly one has this offset."""
    found = [
        c
        for c in result.contacts
        if c.axis == "vertical" and c.a == upper and c.b == lower and c.offset == offset
    ]
    assert len(found) == 1, found
    return found[0]


def beside(result: CheckResult, left: str, right: str, offset: float = 0) -> Contact:
    """The horizontal contact `[left][right]` (sides like 'set_get.set')."""
    found = [
        c
        for c in result.contacts
        if c.axis == "horizontal" and c.a == left and c.b == right and c.offset == offset
    ]
    assert len(found) == 1, found
    return found[0]
