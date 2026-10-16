"""Builders for hand-made arrangements and lookups into check results."""

from magnets import CheckResult, Contact


def set_get(flip="top_bottom", **edges):
    """An arrangement holding only the set_get class, with the given edges.

    Pockets are written as `(from, at, layers)` on top/bottom edges and
    `(at, layers)` on left/right edges.
    """
    authored = {}
    for edge, pockets in edges.items():
        if edge in ("top", "bottom"):
            authored[edge] = [{"from": f, "at": at, "layers": ly} for f, at, ly in pockets]
        else:
            authored[edge] = [{"at": at, "layers": ly} for at, ly in pockets]
    return {"flip": flip, "classes": {"set_get": authored}}


def stack(result: CheckResult, upper: str, lower: str, offset=0) -> Contact:
    """The vertical contact with `upper` over `lower` (side names like 'set')."""
    found = [
        c
        for c in result.contacts
        if c.axis == "vertical"
        and c.a == f"set_get.{upper}"
        and c.b == f"set_get.{lower}"
        and c.offset == offset
    ]
    assert len(found) == 1, found
    return found[0]
