import { describe, expect, it } from "vitest";
import { builtins, languageMarkers, tableMarkers } from "@snapscript/core";

/** The IDs giving this card at this length. */
const idsOf = (card: string, length?: number): number[] =>
  [...languageMarkers]
    .filter(([, m]) => m.card === card && (length === undefined || m.length === length))
    .map(([id]) => id);

/** The lengths a card is given at. */
const lengthsOf = (card: string): number[] => [...languageMarkers.values()].filter((m) => m.card === card).map((m) => m.length);

// REFERENCE.md §2's keyword cards, with the rest of classes.yaml's one-word cards.
const keywords = [
  "[+]", "[-]", "[*]", "[/]", "[%]", "[<]", "[>]", "[<=]", "[>=]", "[==]", "[!=]", "[and]", "[or]",
  "[not]", "[(]", "[)]", "[if]", "[elif]", "[else]", "[repeat]", "[dedent]", "[return]", "[none]", "[root]",
];

// Handwritten kinds and their shortest length (#101): [define{…}], [global{…}], [getProp{…}] and
// [setProp{…}to] 5U, the rest 4U.
const handwritten: [string, number][] = [
  ["[set{}to]", 4], ["[get{}]", 4], ["[call{}]", 4], ["[num{}]", 4], ["[str{}]", 4], ["[for{}in]", 4],
  ["[required{}]", 4], ["[optional{}]", 4],
  ["[define{}]", 5], ["[global{}]", 5], ["[getProp{}]", 5], ["[setProp{}to]", 5],
];

// The PoC kit's colour cards, both sides (#158).
const kitColors = ["mediumblue", "deepskyblue", "gold", "yellow", "hotpink", "tomato", "aquamarine", "limegreen"];

describe("the language markers", () => {
  it("give every keyword card one ID", () => {
    for (const card of keywords) expect(idsOf(card), card).toHaveLength(1);
  });

  it("give each handwritten kind one ID at each length from its shortest up to 8U", () => {
    for (const [card, shortest] of handwritten) {
      const want = Array.from({ length: 9 - shortest }, (_, i) => shortest + i);
      expect(lengthsOf(card).sort(), card).toEqual(want);
    }
    expect(lengthsOf("[get{}]")).toEqual([4, 5, 6, 7, 8]);
    expect(lengthsOf("[define{}]")).toEqual([5, 6, 7, 8]);
  });

  it("give the bools, the events and the kit's colours at their printed length", () => {
    expect(idsOf("[bool(true)]", 2)).toHaveLength(1);
    expect(idsOf("[bool(false)]", 2)).toHaveLength(1);
    expect(idsOf("[on(load)]", 3)).toHaveLength(1);
    expect(idsOf("[on(stop)]", 3)).toHaveLength(1);
    for (const color of kitColors) expect(idsOf(`[color(${color})]`, 4), color).toHaveLength(1);
  });

  it("give every builtin its printed card", () => {
    for (const b of builtins) {
      const card = b.type === "function" ? `[call(${b.name})]` : `[get(${b.name})]`;
      expect(idsOf(card), card).toHaveLength(1);
    }
    expect(lengthsOf("[call(random)]")).toEqual([2]);
  });

  it("keep language cards in 0–299, each ID once", () => {
    for (const id of languageMarkers.keys()) {
      expect(id).toBeGreaterThanOrEqual(0);
      expect(id).toBeLessThan(300);
    }
    const pairs = [...languageMarkers.values()].map((m) => `${m.card} ${m.length}`);
    expect(new Set(pairs).size).toBe(pairs.length);
  });
});

describe("the table's own markers", () => {
  it("are the ruler page's two, 257 mm apart, and the 12 projected in calibration", () => {
    expect(tableMarkers.ruler.markers).toHaveLength(2);
    expect(tableMarkers.ruler.distanceMm).toBe(257);
    expect(tableMarkers.calibration).toHaveLength(12);
  });

  it("are all in 300–399, each once, and none a language card", () => {
    const ids = [...tableMarkers.ruler.markers, ...tableMarkers.calibration];
    expect(new Set(ids).size).toBe(14);
    for (const id of ids) {
      expect(id).toBeGreaterThanOrEqual(300);
      expect(id).toBeLessThan(400);
      expect(languageMarkers.has(id)).toBe(false);
    }
  });
});
