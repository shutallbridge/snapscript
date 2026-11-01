// PROTOTYPE (#128), throwaway: copied from #101's sheets.js (prototype/101-card-sheets). Only change: with
// window.LIBRARY set, it draws nothing itself, so pages.html and table.html can use face() and minLength().
// ---- sizes (mm) ------------------------------------------------------------------------------
const U = 30, H = 30, MK = 13, MZ = 17;  // U, card height, marker, white marker zone
const STRIPE = 1.5;     // the stripe where the tint starts (Figma had 2)
const TAB_END = 8, TAB_SIDE = 5;  // paper tabs: left/right 8 mm, top/bottom 5 mm (Shu's tests); they tuck under the face and are the bleed
const LETTER = 5.5;     // mm per handwritten letter, rough, from the rig test
const MONO = '"Geist Mono", ui-monospace, Menlo, monospace';
const HAND = 'Caveat, "Bradley Hand", cursive';
const PT = 25.4 / 72;

// ---- Tailwind v4 (theme.css, tailwindcss 4.1): 300, 500, 900, 950 -----------------------------------
const TW = Object.fromEntries(`red 80.8 .114 19.571 63.7 .237 25.331 39.6 .141 25.723 25.8 .092 26.042
orange 83.7 .128 66.29 70.5 .213 47.604 40.8 .123 38.172 26.6 .079 36.259
amber 87.9 .169 91.605 76.9 .188 70.08 41.4 .112 45.904 27.9 .077 45.635
yellow 90.5 .182 98.111 79.5 .184 86.047 42.1 .095 57.708 28.6 .066 53.813
lime 89.7 .196 126.665 76.8 .233 130.85 40.5 .101 131.063 27.4 .072 132.109
green 87.1 .15 154.449 72.3 .219 149.579 39.3 .095 152.535 26.6 .065 152.934
emerald 84.5 .143 164.978 69.6 .17 162.48 37.8 .077 168.94 26.2 .051 172.552
teal 85.5 .138 181.071 70.4 .14 182.503 38.6 .063 188.416 27.7 .046 192.524
cyan 86.5 .127 207.078 71.5 .143 215.221 39.8 .07 227.392 30.2 .056 229.695
sky 82.8 .111 230.318 68.5 .169 237.323 39.1 .09 240.876 29.3 .066 243.157
blue 80.9 .105 251.813 62.3 .214 259.815 37.9 .146 265.522 28.2 .091 267.935
indigo 78.5 .115 274.713 58.5 .233 277.117 35.9 .144 278.697 25.7 .09 281.288
violet 81.1 .111 293.571 60.6 .25 292.717 38 .189 293.745 28.3 .141 291.089
purple 82.7 .119 306.383 62.7 .265 303.9 38.1 .176 304.987 29.1 .149 302.717
fuchsia 83.3 .145 321.434 66.7 .295 322.15 40.1 .17 325.612 29.3 .136 325.661
pink 82.3 .12 346.018 65.6 .241 354.308 40.8 .153 2.432 28.4 .109 3.907
rose 81 .117 11.638 64.5 .246 16.439 41 .159 10.272 27.1 .105 12.094
zinc 87.1 .006 286.286 55.2 .016 285.938 21 .006 285.885 14.1 .005 285.823
stone 86.9 .005 56.366 55.3 .013 58.071 21.6 .006 56.043 14.7 .004 49.25`.split('\n').map(line => {
  const [name, ...n] = line.split(' '), v = n.map(Number), s = i => [v[i] / 100, v[i + 1], v[i + 2]];
  return [name, { 300: s(0), 500: s(3), 900: s(6), 950: s(9) }];
}));

// ---- colour maths: OKLCH <-> sRGB ---------------------------------------------------------------
const lin = c => c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
const gam = c => c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
function oklchToRgb([L, C, h]) {
  const a = C * Math.cos(h * Math.PI / 180), b = C * Math.sin(h * Math.PI / 180);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s].map(gam);
}
function rgbToOklch(rgb) {
  const [r, g, b] = rgb.map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(A, B), (Math.atan2(B, A) * 180 / Math.PI + 360) % 360];
}
const inGamut = rgb => rgb.every(c => c >= -1e-4 && c <= 1 + 1e-4);
function fit([L, C, h]) {  // lower chroma until it prints in sRGB
  if (inGamut(oklchToRgb([L, C, h]))) return [L, C, h];
  let lo = 0, hi = C;
  for (let i = 0; i < 24; i++) { const mid = (lo + hi) / 2; inGamut(oklchToRgb([L, mid, h])) ? lo = mid : hi = mid; }
  return [L, lo, h];
}
const hex = lch => '#' + oklchToRgb(fit(lch)).map(c => Math.round(Math.min(1, Math.max(0, c)) * 255).toString(16).padStart(2, '0')).join('');
const rgbOf = hx => [1, 3, 5].map(i => parseInt(hx.slice(i, i + 2), 16) / 255);
const luminance = rgb => { const [r, g, b] = rgb.map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const [x, y] = [luminance(rgbOf(a)), luminance(rgbOf(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// THE RULE: from any background, its stripe and its text. Tuned so a Tailwind 300 lands near its 500 and 900–950.
const RULE = { stripeL: 0.8, stripeC: 1.8, textL: 0.33, textC: 1.25 };
function shades(bgLch, { blackOrWhite = false } = {}) {
  const [L, C, h] = bgLch, bg = hex(bgLch);
  const stripe = hex([L * RULE.stripeL, C * RULE.stripeC, h]);
  const text = blackOrWhite ? (contrast(bg, '#000000') >= contrast(bg, '#ffffff') ? '#000000' : '#ffffff') : hex([RULE.textL, C * RULE.textC, h]);
  return { bg, stripe, text };
}
const family = name => shades(TW[name][300]);
const cssColor = (() => {  // a CSS color name to its shades, through the browser
  const ctx = document.createElement('canvas').getContext('2d');
  return name => { ctx.fillStyle = '#000'; ctx.fillStyle = name; return shades(rgbToOklch(rgbOf(ctx.fillStyle)), { blackOrWhite: true }); };
})();

// ---- syntax colours --------------------------------------------------------------------------------
// Library functions pick one of four roles in their doc comment (tag syntax TBD).
const ROLE_FAMILY = { action: 'violet', action2: 'fuchsia', helper: 'sky', setting: 'rose' };
const FN_ROLE = { circle: 'action', rect: 'action', line: 'action', background: 'action', translate: 'action2', rotate: 'action2', scale: 'action2',
  random: 'helper', print: 'helper', len: 'helper', range: 'helper', frameCount: 'helper', createCanvas: 'setting', fill: 'setting', noStroke: 'setting', stroke: 'setting' };
const P = { vars: 'orange', define: 'teal', callhw: 'teal' };  // proposal 1: variables orange, your own functions teal
const OPS = new Set(['+', '-', '*', '/', '%', '<', '>', '<=', '>=', '==', '!=', 'and', 'or', 'not', '(', ')']);
const CONTROL = new Set(['repeat', 'if', 'elif', 'else', 'for', 'return']);

function parseCard(t) {  // "[set{x}to]" → a side: { k, label | word/after/sample, colours }
  const m = t.match(/^\[([^\[\]{}()]*)(?:([({])([^)}]*)[)}])?([^\[\]{}()]*)\]$/) || [t, t.slice(1, -1), undefined, '', ''];  // [(] and [)] fall through
  const [, kw, open, inner, after] = m;
  if (open === '{') {
    const fam = ['get', 'set', 'global', 'getProp', 'setProp'].includes(kw) ? P.vars : kw === 'define' ? P.define : kw === 'call' ? P.callhw : kw === 'for' ? 'yellow' : 'stone';
    return { k: 'hw', word: kw, after, sample: inner, c: family(fam), fam, text: t };
  }
  if (open === '(') {
    const name = inner.split('.').pop();
    if (kw === 'color') return { k: 'color', label: inner, c: cssColor(inner), fam: 'css', text: t };
    if (kw === 'bool') return { k: 'printed', label: inner, c: family('stone'), fam: 'stone', text: t };
    const fam = ROLE_FAMILY[FN_ROLE[name] || 'helper'];
    return { k: 'printed', label: name, c: family(fam), fam, role: FN_ROLE[name] || 'helper', text: t };
  }
  if (kw === 'dedent') return { k: 'icon', c: family('zinc'), fam: 'zinc', text: t };
  if (OPS.has(kw)) return { k: 'printed', label: kw.replace('-', '−'), center: true, c: family('green'), fam: 'green', text: t };
  if (CONTROL.has(kw)) return { k: 'printed', label: kw, c: family('yellow'), fam: 'yellow', text: t };
  return { k: 'printed', label: kw, c: family('stone'), fam: 'stone', text: t };
}
const parseLine = s => (s.match(/\[[^\[\]]*\]/g) || []).map(parseCard);

// ---- measuring -----------------------------------------------------------------------------------
const NS = 'http://www.w3.org/2000/svg';
const probe = document.createElementNS(NS, 'svg');
probe.setAttribute('viewBox', '0 0 100 100');
probe.style.cssText = 'position:absolute;left:-9999px;width:100px;height:100px';
document.body.appendChild(probe);
const probeText = document.createElementNS(NS, 'text');
probe.appendChild(probeText);
function measure(str, size, family = MONO) {
  if (!str) return 0;
  Object.entries({ 'font-size': size, 'font-family': family, 'font-weight': 500 }).forEach(([k, v]) => probeText.setAttribute(k, v));
  probeText.textContent = str;
  return probeText.getComputedTextLength();
}
const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const T = (x, y, str, size, fill, o = {}) =>
  `<text x="${x}" y="${y}" font-size="${size}" font-family='${o.family || MONO}' font-weight="500" fill="${fill}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(str)}</text>`;

// ---- the stand-in marker: tagStandard41h12's layout -------------------------------------------------
function marker(x, y, seed) {
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280), c = MK / 9;
  let out = '';
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const ring = Math.min(i, j, 8 - i, 8 - j);
    if (ring === 2 || (ring !== 1 && r() < 0.5)) out += `<rect x="${x + j * c}" y="${y + i * c}" width="${c + 0.02}" height="${c + 0.02}" fill="#000"/>`;
  }
  return out;
}
const hash = s => [...s].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);

// ---- layout: how long a side must be -----------------------------------------------------------------
// S = { pt, margin, gap, wbPad, wbMin, colorLen }. The main area right of the marker zone is a row:
// stripe, then padding · word · gap · whiteboard · gap · word · padding (a flex row with px = margin, gap = gap).
const fsz = S => S.pt * PT;
const labelX = S => MZ + STRIPE + S.margin;
function minLength(side, S) {
  if (side.k === 'icon') return 2;
  if (side.k === 'color') return S.colorLen;
  if (side.k === 'printed') return Math.max(2, Math.ceil((labelX(S) + measure(side.label, fsz(S)) + S.margin) / U - 1e-9));
  const words = [side.word, side.after].filter(Boolean);
  const need = labelX(S) + words.reduce((n, w) => n + measure(w, fsz(S)) + S.gap, 0) + S.wbMin + S.margin;
  return Math.max(2, Math.ceil(need / U - 1e-9));
}

// ---- drawing one side: the face, and with tabs for printing ---------------------------------------------
function face(side, L, S, hand) {
  const w = L * U, { bg, stripe, text } = side.c, f = fsz(S), base = H / 2 + f * 0.27;
  let g = `<rect width="${MZ}" height="${H}" fill="#fff"/><rect x="${MZ}" width="${w - MZ}" height="${H}" fill="${bg}"/>` +
    `<rect x="${MZ}" width="${STRIPE}" height="${H}" fill="${stripe}"/>` + marker((MZ - MK) / 2, (H - MK) / 2, hash(side.text));
  const x0 = labelX(S), mid = (MZ + STRIPE + w) / 2;
  if (side.k === 'printed' || side.k === 'color') {
    g += side.center ? T(mid, base, side.label, f, text, { anchor: 'middle' }) : T(x0, base, side.label, f, text);
    if (side.k === 'color' && x0 + measure(side.label, f) + S.margin > w)  // too long for this kit's color cards
      g += `<rect x="${w - 3}" y="2" width="2" height="${H - 4}" fill="#e11d48"/>`;
  } else if (side.k === 'icon') {  // lucide corner-down-left, its 24-unit box scaled to S.iconSize mm
    const s = S.iconSize / 24;
    g += `<g transform="translate(${mid - S.iconSize / 2} ${H / 2 - S.iconSize / 2}) scale(${s})" fill="none" stroke="${text}" stroke-width="${S.iconStroke / s}" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/></g>`;
  } else {
    let cx = x0;
    g += T(cx, base, side.word, f, text); cx += measure(side.word, f) + S.gap;
    const afterW = side.after ? measure(side.after, f) : 0;
    const wbEnd = side.after ? w - S.margin - afterW - S.gap : w - S.margin, wbW = wbEnd - cx, wbH = H - 2 * S.wbPad;
    g += `<rect x="${cx}" y="${S.wbPad}" width="${wbW}" height="${wbH}" fill="#fff"/>`;
    if (hand) g += `<svg x="${cx}" y="${S.wbPad}" width="${wbW}" height="${wbH}">${T(2.5, wbH / 2 + 2.5, side.sample, Math.min(17, wbH * 0.8), '#1d3f8f', { family: HAND })}</svg>`;
    if (side.after) g += T(w - S.margin - afterW, base, side.after, f, text);
  }
  return g;
}
// a sheet to print: the face and a tab on every edge (left/right TAB_END, top/bottom TAB_SIDE), corners cut
// away so the tabs fold past each other. Each tab is bleed in the colour it folds from. Only the cut line is drawn:
// a printed fold line would show on the card if the fold is a little off.
function sheet(side, L, S, hand) {
  const w = L * U, { bg } = side.c, E = TAB_END, V = TAB_SIDE;
  const cut = `M0 ${-V} H${w} V0 H${w + E} V${H} H${w} V${H + V} H0 V${H} H${-E} V0 H0 Z`;
  return `<rect x="${-E}" y="0" width="${E + 0.1}" height="${H}" fill="#fff"/>` +
    `<rect x="${w - 0.1}" y="0" width="${E + 0.1}" height="${H}" fill="${bg}"/>` +
    `<rect x="0" y="${-V}" width="${MZ}" height="${H + 2 * V}" fill="#fff"/><rect x="${MZ}" y="${-V}" width="${w - MZ}" height="${H + 2 * V}" fill="${bg}"/>` +
    `<rect x="${MZ}" y="${-V}" width="${STRIPE}" height="${H + 2 * V}" fill="${side.c.stripe}"/>` + face(side, L, S, hand) +
    `<path d="${cut}" fill="none" stroke="#333" stroke-width=".2"/>`;
}
const sheetBox = L => [-TAB_END - 0.3, -TAB_SIDE - 0.3, L * U + 2 * TAB_END + 0.6, H + 2 * TAB_SIDE + 0.6];
const svgMm = (inner, x, y, w, h) => `<svg xmlns="${NS}" viewBox="${x} ${y} ${w} ${h}" style="display:block;width:${w}mm;height:${h}mm">${inner}</svg>`;

// ---- programs -------------------------------------------------------------------------------------------
const REP = `[repeat][num{30}]
  [set{xPos}to][call(random)][num{0}][num{500}]
  [set{yPos}to][call(random)][num{0}][num{500}]
  [call(p5.rect)][get{xPos}][get{yPos}][num{10}][num{16}]
[dedent]`;
const PROGRAMS = [
  { name: 'A first sketch (OVERVIEW_SPEC.md)', strips: [
    `[define{setup}]
[call(p5.createCanvas)][num{500}][num{500}]
[call(p5.background)][color(midnightblue)]`,
    `[define{draw}]
[set{x}to][call(random)][num{0}][num{500}]
[set{y}to][call(random)][num{0}][num{500}]
[call(p5.circle)][get{x}][get{y}][num{5}]`] },
  { name: 'Confetti (demo.md, second sketch)', strips: [
    `[define{setup}]
[call(p5.createCanvas)][num{500}][num{500}]
[call(p5.background)][color(midnightblue)]
[call(p5.noStroke)]
[call(p5.fill)][color(gold)]
${REP}
[call(p5.fill)][color(hotpink)]
${REP}
[call(p5.fill)][color(aquamarine)]
${REP}`] },
];
function tableSvg(prog, S, hand) {
  let inner = '', ox = 0, maxH = 0;
  for (const strip of prog.strips) {
    let y = 0, stripW = 0;
    for (const line of strip.split('\n')) {
      let x = ox + ((line.match(/^ */)[0].length / 2) | 0) * U;
      for (const side of parseLine(line.trim())) {
        const L = minLength(side, S);
        inner += `<g transform="translate(${x} ${y})">${face(side, L, S, hand)}<rect width="${L * U}" height="${H}" fill="none" stroke="#bbb" stroke-width=".3"/></g>`;
        x += L * U + 0.6;
      }
      stripW = Math.max(stripW, x - ox); y += H + 0.6;
    }
    ox += stripW + U; maxH = Math.max(maxH, y);
  }
  return { inner, w: ox - U, h: maxH };
}

// ---- the catalog --------------------------------------------------------------------------------------------
const CATALOG = [
  ['Control and dedent', ['[repeat]', '[if]', '[else]', '[for{i}in]', '[dedent]']],
  ['Function cards: the four roles', ['[call(p5.circle)]', '[call(p5.translate)]', '[call(random)]', '[call(p5.createCanvas)]']],
  ['Operators (centred) and literals', ['[+] / [-]', '[<=] / [>=]', '[and] / [or]', '[bool(true)] / [bool(false)]', '[num{…}] / [str{…}]']],
  ['Variables and your own functions', ['[get{x}]', '[set{score}to]', '[define{drawDot}]', '[call{drawDot}]']],
  ['Color cards (a flip pair each)', ['[color(gold)] / [color(midnightblue)]', '[color(white)] / [color(black)]', '[color(mediumaquamarine)] / [color(rebeccapurple)]']],
];
const CSS_NAMES = 'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan darkgoldenrod darkgray darkgreen darkkhaki darkmagenta darkolivegreen darkorange darkorchid darkred darksalmon darkseagreen darkslateblue darkslategray darkturquoise darkviolet deeppink deepskyblue dimgray dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ghostwhite gold goldenrod gray green greenyellow honeydew hotpink indianred indigo ivory khaki lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow lightgray lightgreen lightpink lightsalmon lightseagreen lightskyblue lightslategray lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen seashell sienna silver skyblue slateblue slategray snow springgreen steelblue tan teal thistle tomato turquoise violet wheat white whitesmoke yellow yellowgreen'.split(' ');

// ---- page ------------------------------------------------------------------------------------------------------
const $ = id => document.getElementById(id);
const val = (id, d) => $(id) ? +$(id).value : d;
const settings = () => ({ pt: val('pt', 26), margin: val('margin', 3), gap: val('gap', 3), wbPad: val('wbpad', 3), wbMin: val('wbmin', 60),
  colorLen: val('colorlen', 4), iconSize: val('iconsize', 12), iconStroke: val('iconstroke', 1.5) });
const show = (id, v) => { if ($(id)) $(id).textContent = v; };

// print.html: a few sheets to cut, fold and try on a base, at true size
const PRINT_SET = ['[repeat]', '[dedent]', '[call(p5.circle)]', '[call(p5.createCanvas)]', '[get{…}]', '[set{…}to]', '[num{…}]', '[str{…}]',
  '[define{…}]', '[call{…}]', '[for{…}in]', '[color(midnightblue)]', '[color(gold)]', '[color(mediumaquamarine)]'];
function renderPrint(S) {
  const sheets = PRINT_SET.map(c => { const s = parseCard(c), L = minLength(s, S); return `<figure>${svgMm(sheet(s, L, S, false), ...sheetBox(L))}<figcaption>${esc(c)} ${L}U</figcaption></figure>`; });
  $('out').innerHTML = `<p class="settings">${S.pt} pt Geist Mono · padding ${S.margin} mm · gap ${S.gap} mm · whiteboard ≥ ${S.wbMin} mm, ${S.wbPad} mm above and below · ` +
    `dedent icon ${S.iconSize} mm, stroke ${S.iconStroke} mm · tabs ${TAB_END} / ${TAB_SIDE} mm</p>` +
    `<div class="sheets">${sheets.join('')}</div>` +
    `<svg xmlns="${NS}" viewBox="0 0 52 8" style="display:block;width:52mm;height:8mm;margin-top:4mm"><path d="M1 6 H51 ${Array.from({ length: 11 }, (_, i) => `M${1 + 5 * i} 6 V${i % 2 ? 4.5 : 3.5}`).join(' ')}" stroke="#000" stroke-width=".25"/>` +
    `<text x="1" y="2.6" font-size="2.4" font-family="sans-serif">50 mm: check the printer kept the scale</text></svg>`;
}

function render() {
  const S = settings(), hand = $('hw') ? $('hw').checked : false, a = measure('0000000000', fsz(S)) / 10;
  for (const k of ['pt', 'margin', 'gap', 'wbpad', 'iconsize', 'iconstroke']) show(k + 'v', $(k).value);
  if (window.PRINT) return renderPrint(S);
  $('about').innerHTML = `Row 3: ${MZ} mm white marker zone, ${STRIPE} mm stripe, Geist Mono at ${S.pt} pt (${a.toFixed(2)} mm per letter), ${S.margin} mm padding round the main area, ${S.gap} mm between a word and the whiteboard, ${S.wbPad} mm above and below the whiteboard. ` +
    `Backgrounds are Tailwind v4 300s; the stripe and the text come from one rule (see "The colour rule"). Handwritten cards are as long as a ${S.wbMin} mm whiteboard needs. ` +
    `Markers are stand-ins. Print at 100% for true size.`;
  let html = '';

  for (const prog of window.INLINE ? PROGRAMS.slice(0, 1) : PROGRAMS) {
    const t = tableSvg(prog, S, hand), cards = prog.strips.join('\n').match(/\[[^\[\]]*\]/g);
    const total = cards.reduce((n, c) => n + minLength(parseCard(c), S), 0);
    html += `<h2>${prog.name}</h2><p class="note">${cards.length} cards, ${total}U of card; ${(t.w / 10).toFixed(0)} × ${(t.h / 10).toFixed(0)} cm on the table. Scaled to fit.</p>` +
      `<div class="program"><div class="table" style="flex:1 1 600px"><svg xmlns="${NS}" viewBox="-2 -2 ${t.w + 4} ${t.h + 4}" style="display:block;width:100%">${t.inner}</svg></div>` +
      `<pre class="screen-only">${esc(prog.strips.join('\n\n'))}</pre></div>`;
  }

  html += `<h2 class="print-break">Sheets to print (true size, with tabs)</h2><p class="note">The line is the cut; fold at the face's edges and tuck the tabs under the face. Left and right tabs ${TAB_END} mm, top and bottom ${TAB_SIDE} mm, corners cut away. A flip pair is two sheets, front and back.</p>`;
  for (const [title, list] of CATALOG) {
    html += `<h3>${title}</h3><div class="cards">`;
    for (const entry of list) {
      const sides = entry.split(' / ').map(c => parseCard(c)), L = Math.max(...sides.map(s => minLength(s, S)));
      for (const s of sides) html += `<figure>${svgMm(sheet(s, L, S, hand), ...sheetBox(L))}<figcaption><b>${esc(s.text)}</b> ${L}U${s.role ? ' · ' + s.role : ''}</figcaption></figure>`;
    }
    html += `</div>`;
  }

  if (!window.INLINE) {
  // print test: the same cards at 26, 27, 28 pt
  html += `<h2 class="print-break">Print test: 26, 27 and 28 pt</h2><p class="note">The same cards at each size, with the margin above. Lengths change where a label stops fitting.</p>`;
  for (const pt of [26, 27, 28]) {
    const S2 = { ...S, pt };
    html += `<h3>${pt} pt</h3><div class="cards">` + ['[repeat]', '[call(p5.createCanvas)]', '[+]', '[num{…}]', '[set{x}to]'].map(c => {
      const s = parseCard(c), L = minLength(s, S2);
      return `<figure>${svgMm(sheet(s, L, S2, false), ...sheetBox(L))}<figcaption><b>${esc(c)}</b> ${L}U</figcaption></figure>`;
    }).join('') + `</div>`;
  }
  }

  // color cards
  const room = S.colorLen * U - labelX(S) - S.margin, fitN = Math.floor(room / a + 1e-9);
  const tooLong = CSS_NAMES.filter(n => measure(n, fsz(S)) > room);
  html += `<h2>Color cards at ${S.colorLen}U</h2><p class="note">Room for ${fitN} letters. ${CSS_NAMES.length - tooLong.length} of ${CSS_NAMES.length} CSS color names fit; these don't:</p>` +
    `<div>${tooLong.map(n => { const c = cssColor(n); return `<span class="chip" style="background:${c.bg};color:${c.text};box-shadow:inset 3px 0 ${c.stripe}">${n}</span>`; }).join('') || '—'}</div>`;

  // the colour rule
  html += `<h2>The colour rule</h2><p class="note">From a background in OKLCH (L, C, h): stripe = (${RULE.stripeL}·L, ${RULE.stripeC}·C, h), text = (${RULE.textL}, ${RULE.textC}·C, h), ` +
    `each lowered in chroma until it prints in sRGB. Color cards use the same stripe, with black or white text, whichever has more contrast. Compared here with Tailwind's own shades.</p>` +
    `<table><tr><th>family</th><th>300 (background)</th><th>stripe by rule</th><th>500</th><th>text by rule</th><th>900</th><th>950</th><th>a label</th><th>contrast</th></tr>`;
  for (const fam of ['yellow', 'zinc', 'violet', 'fuchsia', 'sky', 'rose', 'green', 'stone', 'orange', 'teal']) {
    const c = family(fam), sw = x => `<span class="sw" style="background:${x}"></span>`;
    html += `<tr><td>${fam}</td><td>${sw(c.bg)}</td><td>${sw(c.stripe)}</td><td>${sw(hex(TW[fam][500]))}</td><td>${sw(c.text)}</td><td>${sw(hex(TW[fam][900]))}</td><td>${sw(hex(TW[fam][950]))}</td>` +
      `<td><span class="chip" style="background:${c.bg};color:${c.text};box-shadow:inset 3px 0 ${c.stripe};margin:0">repeat</span></td><td class="n">${contrast(c.bg, c.text).toFixed(1)}:1</td></tr>`;
  }
  html += `</table>`;

  // the length rule
  if (!window.INLINE) {
  html += `<h2>Length rule at ${S.pt} pt, ${S.margin} mm padding, ${S.gap} mm gap</h2><p class="note">Printed label: room = length − ${labelX(S) + S.margin} mm (marker zone, stripe, two margins). ` +
    `Handwritten: padding, each printed word and its gap, a ${S.wbMin} mm whiteboard, padding.</p><table><tr><th>length</th><th>room</th><th>letters</th><th>printed labels that land here</th><th>handwritten cards at their shortest</th></tr>`;
  const names = ['else', 'fill', 'rect', 'repeat', 'circle', 'random', 'noStroke', 'translate', 'background', 'createCanvas', 'frameCount'];
  const hws = ['[get{…}]', '[set{…}to]', '[num{…}]', '[str{…}]', '[for{…}in]', '[define{…}]', '[call{…}]'];
  for (let L = 2; L <= 6; L++) {
    const r = L * U - labelX(S) - S.margin;
    html += `<tr><td>${L}U</td><td class="n">${r.toFixed(1)} mm</td><td class="n">${Math.floor(r / a + 1e-9)}</td>` +
      `<td>${names.filter(n => minLength({ k: 'printed', label: n }, S) === L).join(', ')}</td><td>${hws.filter(c => minLength(parseCard(c), S) === L).join(' ')}</td></tr>`;
  }
  html += `</table>`;
  }
  $('out').innerHTML = html;
}

if (!window.LIBRARY) {
for (const id of ['pt', 'margin', 'gap', 'wbpad', 'wbmin', 'colorlen', 'hw', 'iconsize', 'iconstroke']) if ($(id)) $(id).addEventListener('input', render);
render();
Promise.all([document.fonts.load('500 12px "Geist Mono"'), document.fonts.load('500 12px Caveat')]).then(render, render);
}
