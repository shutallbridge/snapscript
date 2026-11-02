// The faces seam: face(card) → SVG. These check facts the SVG carries (lengths, marker or dot, colours), not pixels.
import { describe, expect, test } from "vitest";
import { face, markerPattern, shortestLength } from "@snapscript/faces";

/** The SVG's width and height attributes, in mm. */
function sizeMm(svg: string): [number, number] {
  const [, w, h] = svg.match(/^<svg[^>]* width="([\d.]+)mm" height="([\d.]+)mm"/)!;
  return [Number(w), Number(h)];
}

describe("the length rule", () => {
  test.each([
    // 2U holds 6 letters, 3U 11, 4U 17.
    ["[repeat]", 2],
    ["[call(random)]", 2],
    ["[call(p5.circle)]", 2],
    ["[call(p5.noStroke)]", 3],
    ["[call(p5.background)]", 3],
    ["[define(draw)]", 3],
    ["[define(setup)]", 4],
    ["[call(p5.createCanvas)]", 4],
    ["[+]", 2],
    ["[bool(false)]", 2],
    // Handwritten at least 4U, [define{…}] 5U.
    ["[get{…}]", 4],
    ["[set{x}to]", 4],
    ["[num{300}]", 4],
    ["[define{…}]", 5],
  ])("%s is %iU at its shortest", (card, length) => {
    expect(shortestLength(card)).toBe(length);
  });

  test("the letters per length: 6 fit in 2U, 7 need 3U, 11 fit in 3U, 12 need 4U, 17 fit in 4U, 18 need 5U", () => {
    const named = (n: number) => `[call(${"a".repeat(n)})]`;
    expect([6, 7, 11, 12, 17, 18].map((n) => shortestLength(named(n)))).toEqual([2, 3, 3, 4, 4, 5]);
  });

  test("a printed sheet is 30 mm a U along, 30 mm across, with 8 mm end tabs and 5 mm side tabs", () => {
    expect(sizeMm(face({ text: "[call(p5.circle)]", marker: 412 }, { use: "sheet" }).svg)).toEqual([2 * 30 + 16, 40]);
    expect(sizeMm(face({ text: "[define{…}]", marker: 40 }, { use: "sheet" }).svg)).toEqual([5 * 30 + 16, 40]);
  });

  test("a card can be longer than its shortest, never shorter", () => {
    expect(face({ text: "[get{…}]", length: 6, marker: 30 }, { use: "sheet" }).length).toBe(6);
    expect(() => face({ text: "[define{…}]", length: 4, marker: 40 }, { use: "sheet" })).toThrow(/5U/);
  });
});

/** Each drawn part's attributes, by its data-part. */
function parts(svg: string, part: string): Record<string, string>[] {
  return [...svg.matchAll(new RegExp(`<\\w+ data-part="${part}"([^>]*)>`, "g"))].map(([, attrs]) =>
    Object.fromEntries([...attrs!.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, k, v]) => [k!, v!])),
  );
}
const fill = (svg: string, part: string): string | undefined => parts(svg, part)[0]?.fill;

describe("the marker or a dot", () => {
  test("a printed sheet carries its marker in the middle of its 17 mm white marker zone", () => {
    const { svg } = face({ text: "[call(p5.circle)]", marker: 412 }, { use: "sheet" });
    expect(parts(svg, "marker")).toEqual([expect.objectContaining({ "data-id": "412" })]);
    expect(parts(svg, "marker-zone")).toEqual([expect.objectContaining({ x: "0", width: "17", fill: "#ffffff" })]);
    expect(parts(svg, "dot")).toEqual([]);
  });

  test("marker 2000 prints as AprilRobotics' tag41_12_02000.png", () => {
    const rows = markerPattern(2000).map((row) => row.map((black) => (black ? "1" : "0")).join(""));
    expect(rows).toEqual(["001110100", "111111111", "010000010", "110001010", "010010011", "110100011", "010000011", "111111111", "011100100"]);
  });

  test("a sheet's marker is 13 mm square, centred in the marker zone: one black rect per black cell", () => {
    const { svg } = face({ text: "[repeat]", marker: 2000 }, { use: "sheet" });
    const cells = [...svg.match(/<g data-part="marker"[^>]*>(.*?)<\/g>/)![1]!.matchAll(/x="([\d.]+)" y="([\d.]+)"/g)];
    const black = markerPattern(2000).flat().filter(Boolean).length;
    expect(cells).toHaveLength(black);
    const xs = cells.map(([, x]) => Number(x));
    // Columns 0 and 8 both have a black cell: the marker spans 2 mm to 15 mm.
    expect(Math.min(...xs)).toBeCloseTo(2, 3);
    expect(Math.max(...xs) + 13 / 9).toBeCloseTo(15, 1);
  });

  test("a marker the family doesn't have is an error", () => {
    expect(() => face({ text: "[repeat]", marker: 2115 }, { use: "sheet" })).toThrow(/2115/);
  });

  test("a mini card carries a grey dot instead of a marker, even for a card that has one", () => {
    const { svg } = face({ text: "[call(p5.rect)]", marker: 412 }, { use: "mini" });
    expect(parts(svg, "marker")).toEqual([]);
    expect(parts(svg, "dot")).toEqual([expect.objectContaining({ fill: "#a1a1aa" })]);
  });

  test("a mini card is only as long as its text", () => {
    const short = face({ text: "[if]" }, { use: "mini" });
    const long = face({ text: "[call(p5.createCanvas)]" }, { use: "mini" });
    expect(long.widthMm).toBeGreaterThan(short.widthMm);
    expect(short.widthMm).toBeLessThan(30);
  });

  test("a mini handwritten card shows what is written on it", () => {
    const { svg } = face({ text: "[num{300}]" }, { use: "mini" });
    expect(svg).toMatch(/data-part="value"[^>]*font-family="Kalam[^>]*>300</);
  });
});

/** Tailwind v4's published 300 shades, as hex. */
const TAILWIND_300 = {
  violet: "#c4b4ff", fuchsia: "#f4a8ff", sky: "#74d4ff", rose: "#ffa1ad",
  orange: "#ffb86a", teal: "#46ecd5", yellow: "#ffdf20", green: "#7bf1a8", stone: "#d6d3d1",
};
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const luminance = (hex: string): number => rgb(hex).reduce((n, c, i) => n + c * [0.2126, 0.7152, 0.0722][i]!, 0);
/**
 * Two colours alike. Some 300s (sky, orange, yellow) are outside sRGB: Tailwind's hex clips them, and a sheet lowers
 * their chroma until they print, so these differ by up to about 15 in a channel.
 */
function near(a: string | undefined, b: string): void {
  rgb(a!).forEach((c, i) => expect(Math.abs(c - rgb(b)[i]!)).toBeLessThanOrEqual(16));
}

describe("colours by kind and function colour", () => {
  test.each([
    ["[call(p5.circle)]", "primary", "violet"],
    ["[call(p5.translate)]", "secondary", "fuchsia"],
    ["[call(random)]", "helper", "sky"],
    ["[call(p5.fill)]", "setting", "rose"],
  ] as const)("%s, a %s function, is tinted %s 300", (text, functionColor, family) => {
    near(fill(face({ text, functionColor, marker: 400 }, { use: "sheet" }).svg, "tint"), TAILWIND_300[family]);
  });

  test("a builtin with no function colour given is helper", () => {
    near(fill(face({ text: "[call(print)]" }, { use: "sheet" }).svg, "tint"), TAILWIND_300.sky);
  });

  test.each([
    ["[get{…}]", "orange"],
    ["[set{x}to]", "orange"],
    ["[get(p5.width)]", "orange"],
    ["[define{…}]", "teal"],
    ["[define(setup)]", "teal"],
    ["[call{…}]", "teal"],
    ["[repeat]", "yellow"],
    ["[for{…}in]", "yellow"],
    ["[+]", "green"],
    ["[and]", "green"],
    ["[num{…}]", "stone"],
    ["[bool(true)]", "stone"],
  ] as const)("%s is tinted %s 300", (text, family) => {
    near(fill(face({ text }, { use: "sheet" }).svg, "tint"), TAILWIND_300[family]);
  });

  test("the stripe is a darker shade of the tint, and the label darker still", () => {
    for (const text of ["[call(p5.circle)]", "[repeat]", "[get{…}]", "[+]"]) {
      const { svg } = face({ text }, { use: "sheet" });
      const [tint, stripe, label] = ["tint", "stripe", "label"].map((p) => luminance(fill(svg, p)!));
      expect(stripe).toBeLessThan(tint!);
      expect(label).toBeLessThan(stripe!);
    }
  });

  test("each function colour has its own stripe and label", () => {
    const of = (functionColor: "primary" | "secondary" | "helper" | "setting") => {
      const { svg } = face({ text: "[call(p5.circle)]", functionColor }, { use: "sheet" });
      return `${fill(svg, "stripe")} ${fill(svg, "label")}`;
    };
    expect(new Set([of("primary"), of("secondary"), of("helper"), of("setting")]).size).toBe(4);
  });

  test("a color card is its colour, labelled black or white, whichever reads", () => {
    const gold = face({ text: "[color(gold)]" }, { use: "sheet" }).svg;
    expect(fill(gold, "tint")).toBe("#ffd700");
    expect(fill(gold, "label")).toBe("#000000");
    const blue = face({ text: "[color(mediumblue)]" }, { use: "sheet" }).svg;
    expect(fill(blue, "tint")).toBe("#0000cd");
    expect(fill(blue, "label")).toBe("#ffffff");
  });

  test("a mini card has its card's colours", () => {
    const sheet = face({ text: "[call(p5.rect)]", functionColor: "primary" }, { use: "sheet" }).svg;
    const mini = face({ text: "[call(p5.rect)]", functionColor: "primary" }, { use: "mini" }).svg;
    for (const p of ["tint", "stripe", "label"]) expect(fill(mini, p)).toBe(fill(sheet, p));
  });
});

describe("virtual cards", () => {
  const px = (svg: string) => svg.match(/^<svg[^>]* width="([\d.]+)px" height="([\d.]+)px"/)!.slice(1).map(Number);

  test("are drawn at 50 px per U, the face alone with no tabs", () => {
    for (const use of ["stand-in", "guide"] as const) {
      const f = face({ text: "[call(p5.circle)]" }, { use });
      expect(px(f.svg)).toEqual([100, 50]);
      expect(f.widthMm).toBe(60);
      expect(parts(f.svg, "cut")).toEqual([]);
    }
    expect(px(face({ text: "[define{…}]" }, { use: "guide" }).svg)).toEqual([250, 50]);
  });

  test("a stand-in has the real face, a 20% white marker zone and a 1.5 mm white bracket, and no marker", () => {
    const { svg } = face({ text: "[call(p5.circle)]", functionColor: "primary", marker: 412 }, { use: "stand-in" });
    const sheet = face({ text: "[call(p5.circle)]", functionColor: "primary", marker: 412 }, { use: "sheet" }).svg;
    for (const p of ["tint", "stripe", "label"]) expect(fill(svg, p)).toBe(fill(sheet, p));
    expect(fill(svg, "marker-zone")).toBe("#333333");
    expect(parts(svg, "bracket")).toEqual([expect.objectContaining({ stroke: "#ffffff", "stroke-width": "1.5" })]);
    expect(parts(svg, "marker")).toEqual([]);
  });

  test("a guide has its card's colour at 20%, a solid label in the card's colour, and a grey dot", () => {
    const { svg } = face({ text: "[call(p5.circle)]", functionColor: "primary" }, { use: "guide" });
    near(fill(svg, "tint"), TAILWIND_300.violet);
    expect(parts(svg, "tint")[0]!["fill-opacity"]).toBe("0.2");
    expect(fill(svg, "label")).toBe(fill(face({ text: "[call(p5.circle)]", functionColor: "primary" }, { use: "sheet" }).svg, "stripe"));
    expect(parts(svg, "label")[0]!["fill-opacity"]).toBeUndefined();
    expect(parts(svg, "dot")).toHaveLength(1);
    expect(parts(svg, "marker")).toEqual([]);
  });

  test("a value guide shows its value's name in Kalam", () => {
    const { svg } = face({ text: "[num{…}]" }, { use: "guide", value: "x" });
    expect(svg).toMatch(/data-part="value"[^>]*font-family="Kalam[^>]*>x</);
  });

  test("a stand-in shows what is written on its card in Kalam", () => {
    const { svg } = face({ text: "[set{xPos}to]" }, { use: "stand-in" });
    expect(svg).toMatch(/data-part="value"[^>]*font-family="Kalam[^>]*>xPos</);
  });

  test("a printed sheet's whiteboard is blank", () => {
    const { svg } = face({ text: "[set{xPos}to]", marker: 20 }, { use: "sheet" });
    expect(parts(svg, "whiteboard")).toHaveLength(1);
    expect(parts(svg, "value")).toEqual([]);
  });
});
