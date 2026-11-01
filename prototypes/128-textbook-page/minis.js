// PROTOTYPE (#128), throwaway: mini cards, the sibling of sheets.js's real card faces, for cards named in
// running text. Same look (white marker zone, stripe, tint, label, whiteboard) and the same colours and parsing
// from sheets.js, but its own sizes: tall enough to read inline, and only as long as its text.
// Needs sheets.js (window.LIBRARY) loaded first.

const MINI = {
  h: 6,          // mm, card height
  mz: 4.6,       // marker zone width
  mk: 3.2,       // stand-in marker (far below the 8 mm a camera can read)
  stripe: 0.5,
  pad: 1.3,      // around the main area
  gap: 1.1,      // between a word and the whiteboard
  label: 3.1,    // mm label font size (about 9 pt)
  wbPad: 0.8,    // whiteboard inset, top and bottom
  wbEmpty: 7,    // whiteboard width when nothing is written on it
  hand: 3.9,     // mm handwriting size
  handFont: 'Kalam, cursive',
};

const miniCtx = document.createElement('canvas').getContext('2d');
function miniWidth(str, size, font) {  // mm, at size mm
  if (!str) return 0;
  miniCtx.font = `${font === 'hand' ? 400 : 500} 100px ${font === 'hand' ? MINI.handFont : MONO}`;
  return miniCtx.measureText(str).width / 100 * size;
}

function miniMarker(x, y, seed) {  // sheets.js's stand-in, at MINI.mk
  let s = seed * 9301 + 49297; const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280), c = MINI.mk / 9;
  let out = '';
  for (let i = 0; i < 9; i++) for (let j = 0; j < 9; j++) {
    const ring = Math.min(i, j, 8 - i, 8 - j);
    if (ring === 2 || (ring !== 1 && r() < 0.5)) out += `<rect x="${x + j * c}" y="${y + i * c}" width="${c + 0.01}" height="${c + 0.01}" fill="#000"/>`;
  }
  return out;
}

// one mini card as an inline SVG, sized in em so it scales with the text around it
function miniCard(card, emPerMm) {
  const side = parseCard(card), M = MINI, { bg, stripe, text } = side.c, mid = M.h / 2;
  const tx = (x, str, o = {}) => `<text x="${x}" y="${mid}" dominant-baseline="central" font-size="${o.size || M.label}" ` +
    `font-family='${o.hand ? M.handFont : MONO}' font-weight="${o.hand ? 400 : 500}" fill="${o.fill || text}"${o.anchor ? ` text-anchor="${o.anchor}"` : ''}>${esc(str)}</text>`;
  const x0 = M.mz + M.stripe + M.pad;
  let body = '', w;

  if (side.k === 'icon') {  // dedent: lucide corner-down-left
    const s = M.label * 1.3, k = s / 24;
    w = x0 + s + M.pad;
    body = `<g transform="translate(${x0} ${mid - s / 2}) scale(${k})" fill="none" stroke="${text}" stroke-width="${0.45 / k}" stroke-linecap="round" stroke-linejoin="round">` +
      `<path d="M20 4v7a4 4 0 0 1-4 4H4"/><path d="m9 10-5 5 5 5"/></g>`;
  } else if (side.k === 'hw') {  // word · whiteboard as long as its writing · word
    let x = x0;
    body += tx(x, side.word); x += miniWidth(side.word, M.label) + M.gap;
    const sample = side.sample === '…' ? '' : side.sample;
    const wbW = sample ? miniWidth(sample, M.hand, 'hand') + 2 * M.gap : M.wbEmpty;
    body += `<rect x="${x}" y="${M.wbPad}" width="${wbW}" height="${M.h - 2 * M.wbPad}" rx=".3" fill="#fff"/>`;
    if (sample) body += tx(x + wbW / 2, sample, { hand: true, size: M.hand, fill: '#000', anchor: 'middle' });
    x += wbW;
    if (side.after) { x += M.gap; body += tx(x, side.after); x += miniWidth(side.after, M.label); }
    w = x + M.pad;
  } else {  // printed, color, operators
    w = x0 + miniWidth(side.label, M.label) + M.pad;
    body = tx(x0, side.label);
  }

  const g = `<rect width="${M.mz}" height="${M.h}" fill="#fff"/><rect x="${M.mz}" width="${w - M.mz}" height="${M.h}" fill="${bg}"/>` +
    `<rect x="${M.mz}" width="${M.stripe}" height="${M.h}" fill="${stripe}"/>` + miniMarker((M.mz - M.mk) / 2, mid - M.mk / 2, hash(side.text)) + body +
    `<rect width="${w}" height="${M.h}" fill="none" stroke="#a1a1aa" stroke-width=".2"/>`;
  return `<svg class="mini" xmlns="${NS}" viewBox="-.1 -.1 ${w + .2} ${M.h + .2}" style="width:${(w + .2) * emPerMm}em;height:${(M.h + .2) * emPerMm}em">${g}</svg>`;
}

// card notation in running text, like [call(p5.rect)], as mini cards; a run of cards stays on one line
const minis = (html, emPerMm) => html.replace(/(\[[^\[\]]*\])+/g, run =>
  `<span class="minis">${run.match(/\[[^\[\]]*\]/g).map(c => miniCard(c, emPerMm)).join('')}</span>`);
