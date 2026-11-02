// A card's colours (#101): its tint (a Tailwind 300), and its stripe and label, from one rule.

import type { Side } from "./sheet.ts";

/** Which of four colours a [call] card is printed in. */
export type FunctionColor = "primary" | "secondary" | "helper" | "setting";

export interface Colors {
  /** The sheet right of the stripe. */
  tint: string;
  stripe: string;
  label: string;
}

type Oklch = readonly [l: number, c: number, h: number];

/** Tailwind v4's 300 shades (theme.css, tailwindcss 4.1), in OKLCH. */
const TAILWIND_300 = {
  orange: [0.837, 0.128, 66.29],
  yellow: [0.905, 0.182, 98.111],
  green: [0.871, 0.15, 154.449],
  teal: [0.855, 0.138, 181.071],
  sky: [0.828, 0.111, 230.318],
  violet: [0.811, 0.111, 293.571],
  fuchsia: [0.833, 0.145, 321.434],
  rose: [0.81, 0.117, 11.638],
  zinc: [0.871, 0.006, 286.286],
  stone: [0.869, 0.005, 56.366],
} as const satisfies Record<string, Oklch>;

type Family = keyof typeof TAILWIND_300;

const FUNCTION_FAMILY: Record<FunctionColor, Family> = { primary: "violet", secondary: "fuchsia", helper: "sky", setting: "rose" };
const VARIABLE = new Set(["get", "set", "global", "getProp", "setProp"]);
const CONTROL = new Set(["repeat", "if", "elif", "else", "for", "return"]);

/** The syntax colour per kind: variables orange, your own functions teal, control yellow, operators green. */
function familyOf(side: Side, functionColor: FunctionColor): Family {
  switch (side.kind) {
    case "operator":
      return "green";
    case "dedent":
      return "zinc";
    case "handwritten":
      if (VARIABLE.has(side.keyword)) return "orange";
      if (side.keyword === "define" || side.keyword === "call") return "teal";
      if (side.keyword === "for") return "yellow";
      return "stone";
    case "printed":
      if (side.keyword === "call") return FUNCTION_FAMILY[functionColor];
      if (VARIABLE.has(side.keyword)) return "orange";
      if (side.keyword === "define") return "teal";
      if (CONTROL.has(side.keyword)) return "yellow";
      return "stone";
    case "color":
      throw new Error("a color card takes its own colour");
  }
}

/** The colour of [color(…)] standing for any colour. */
const ANY_COLOR = "#a1a1aa";

/** A card's tint, stripe and label colours. A color card is its colour, labelled in black or white. */
export function colorsOf(side: Side, functionColor: FunctionColor = "helper"): Colors {
  if (side.kind === "color") {
    const tint = CSS_COLORS[side.label.toLowerCase()] ?? ANY_COLOR;
    const black = contrast(tint, "#000000") >= contrast(tint, "#ffffff");
    return { tint, stripe: stripeOf(rgbToOklch(rgbOf(tint))), label: black ? "#000000" : "#ffffff" };
  }
  const tint = TAILWIND_300[familyOf(side, functionColor)];
  return { tint: hex(tint), stripe: stripeOf(tint), label: hex([RULE.labelL, tint[1] * RULE.labelC, tint[2]]) };
}

/** The rule, tuned so a Tailwind 300 lands near its 500 for the stripe and its 900–950 for the label. */
const RULE = { stripeL: 0.8, stripeC: 1.8, labelL: 0.33, labelC: 1.25 };
const stripeOf = ([l, c, h]: Oklch): string => hex([l * RULE.stripeL, c * RULE.stripeC, h]);

// OKLCH and sRGB, by Björn Ottosson's matrices.
const linear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const gamma = (c: number): number => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

function oklchToRgb([l0, c, h]: Oklch): number[] {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l = (l0 + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (l0 - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (l0 - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map(gamma);
}

function rgbToOklch(rgb: readonly number[]): Oklch {
  const [r, g, b] = rgb.map(linear) as [number, number, number];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
}

const inGamut = (rgb: number[]): boolean => rgb.every((c) => c >= -1e-4 && c <= 1 + 1e-4);

/** Lowers the chroma until the colour prints in sRGB. */
function fit([l, c, h]: Oklch): Oklch {
  if (inGamut(oklchToRgb([l, c, h]))) return [l, c, h];
  let lo = 0;
  let hi = c;
  for (let i = 0; i < 24; i++) {
    const mid = (lo + hi) / 2;
    if (inGamut(oklchToRgb([l, mid, h]))) lo = mid;
    else hi = mid;
  }
  return [l, lo, h];
}

const hex = (lch: Oklch): string =>
  "#" +
  oklchToRgb(fit(lch))
    .map((c) => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, "0"))
    .join("");
const rgbOf = (hx: string): number[] => [1, 3, 5].map((i) => parseInt(hx.slice(i, i + 2), 16) / 255);
const luminance = (hx: string): number => {
  const [r, g, b] = rgbOf(hx).map(linear) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string): number => {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
};

/** The CSS named colours (CSS Color Module Level 4). */
const CSS_COLORS: Readonly<Record<string, string>> = Object.fromEntries(
  `aliceblue f0f8ff antiquewhite faebd7 aqua 00ffff aquamarine 7fffd4 azure f0ffff beige f5f5dc bisque ffe4c4 black 000000
blanchedalmond ffebcd blue 0000ff blueviolet 8a2be2 brown a52a2a burlywood deb887 cadetblue 5f9ea0 chartreuse 7fff00
chocolate d2691e coral ff7f50 cornflowerblue 6495ed cornsilk fff8dc crimson dc143c cyan 00ffff darkblue 00008b
darkcyan 008b8b darkgoldenrod b8860b darkgray a9a9a9 darkgreen 006400 darkgrey a9a9a9 darkkhaki bdb76b
darkmagenta 8b008b darkolivegreen 556b2f darkorange ff8c00 darkorchid 9932cc darkred 8b0000 darksalmon e9967a
darkseagreen 8fbc8f darkslateblue 483d8b darkslategray 2f4f4f darkslategrey 2f4f4f darkturquoise 00ced1
darkviolet 9400d3 deeppink ff1493 deepskyblue 00bfff dimgray 696969 dimgrey 696969 dodgerblue 1e90ff firebrick b22222
floralwhite fffaf0 forestgreen 228b22 fuchsia ff00ff gainsboro dcdcdc ghostwhite f8f8ff gold ffd700 goldenrod daa520
gray 808080 green 008000 greenyellow adff2f grey 808080 honeydew f0fff0 hotpink ff69b4 indianred cd5c5c indigo 4b0082
ivory fffff0 khaki f0e68c lavender e6e6fa lavenderblush fff0f5 lawngreen 7cfc00 lemonchiffon fffacd lightblue add8e6
lightcoral f08080 lightcyan e0ffff lightgoldenrodyellow fafad2 lightgray d3d3d3 lightgreen 90ee90 lightgrey d3d3d3
lightpink ffb6c1 lightsalmon ffa07a lightseagreen 20b2aa lightskyblue 87cefa lightslategray 778899 lightslategrey 778899
lightsteelblue b0c4de lightyellow ffffe0 lime 00ff00 limegreen 32cd32 linen faf0e6 magenta ff00ff maroon 800000
mediumaquamarine 66cdaa mediumblue 0000cd mediumorchid ba55d3 mediumpurple 9370db mediumseagreen 3cb371
mediumslateblue 7b68ee mediumspringgreen 00fa9a mediumturquoise 48d1cc mediumvioletred c71585 midnightblue 191970
mintcream f5fffa mistyrose ffe4e1 moccasin ffe4b5 navajowhite ffdead navy 000080 oldlace fdf5e6 olive 808000
olivedrab 6b8e23 orange ffa500 orangered ff4500 orchid da70d6 palegoldenrod eee8aa palegreen 98fb98 paleturquoise afeeee
palevioletred db7093 papayawhip ffefd5 peachpuff ffdab9 peru cd853f pink ffc0cb plum dda0dd powderblue b0e0e6
purple 800080 rebeccapurple 663399 red ff0000 rosybrown bc8f8f royalblue 4169e1 saddlebrown 8b4513 salmon fa8072
sandybrown f4a460 seagreen 2e8b57 seashell fff5ee sienna a0522d silver c0c0c0 skyblue 87ceeb slateblue 6a5acd
slategray 708090 slategrey 708090 snow fffafa springgreen 00ff7f steelblue 4682b4 tan d2b48c teal 008080 thistle d8bfd8
tomato ff6347 turquoise 40e0d0 violet ee82ee wheat f5deb3 white ffffff whitesmoke f5f5f5 yellow ffff00
yellowgreen 9acd32`
    .split(/\s+/)
    .flatMap((word, i, words) => (i % 2 ? [] : [[word, "#" + words[i + 1]]])),
);
