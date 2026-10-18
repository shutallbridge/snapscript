# Flip pairs only where both sides take the same roles; flip top-to-bottom

A card is a flip pair only if both its sides take the same grammar roles: `[num(…)]` / `[str(…)]`, `[bool:true]` / `[bool:false]`, `[+]` / `[-]`, `[*]` / `[/]`, `[<]` / `[>]`, `[<=]` / `[>=]`, `[==]` / `[!=]` and `[and]` / `[or]`. `[%]` is a card of its own, and `[set(x)to]`, `[get(x)]`, `[define(f)]`, `[call(f)]`, `[setProp(p)to]`, `[getProp(p)]`, `[required(p)]` and `[optional(p)]` are separate cards. Flip pairs turn top-to-bottom.

A flip pair's back is derived from its front, so every contact between two flip pairs has a partner contact that behaves exactly the same. When a pair's sides take different roles, flipping can turn an illegal pair of neighbours into a legal one: `[get(x)][set(x)to]` is illegal, but flipping both cards gives `[set(x)to][get(x)]`, which must snap, so the illegal one always snaps too. Every unavoidable leak came from such a pair. When both sides take the same roles, the partner contact has the same verdict, and the pair costs nothing. The value traded away is a smaller kit, and cards that teach "these are related" (set and get, define and call); the value gained is grammar enforcement.

With the old flip pairs, some contacts that must snap always put a pocket `P/Q` against its own flipped copy `Q/P`. The straight layer pairs attract, but the same pole faces itself diagonally across the layers, an interaction the magnet model ignores and that can't be checked without magnets. Under `[set(x)to]` over `[get(x)]` @0 with `F/S` facing `S/F`, F–S and S–F attract while the two `S`s face each other diagonally. With the new card set, a top-to-bottom flip puts no pocket against its own flipped copy on any contact that must snap; left-to-right still does, on inline value pairs such as `[num(…)][str(…)]`. So the flip is top-to-bottom, and no bench test for diagonal interaction is needed.

Scratch searches, goal `no_snap`, all classes, lengths up to 6U:

| | old set: `top_bottom` | old set: `left_right` | new set: `top_bottom` | new set: `left_right` |
|---|---|---|---|---|
| valid | yes | yes | yes, optimal | yes, optimal |
| unavoidable should/nice leak groups | 45 | 67 (+48 low) | 0 | 0 |
| avoidable should/nice leaks | 0 | 0 | 0 | 0 |
| snapping contacts with a same-pole diagonal | 225 (forced) | 675 (forced) | 0 | 1000 (forced on `[num]`/`[str]`, `[bool]`) |
| pockets | 50 | 57 | about the same | about the same |

Unavoidable counts depend only on the grammar and the flip, not on the search, so they are exact.

## Consequences

The magnets tool keeps both flip directions and both search goals, since it is a dev tool; only the spec chooses top-to-bottom. Its tests keep flip pairs with different roles on toy class data, so the flip's physics and unavoidable leaks stay tested though the real card set has none. ADR 0001's example of an edge meeting its own flipped copy, `[get(x)]` under `[set(x)to]`, no longer arises.
