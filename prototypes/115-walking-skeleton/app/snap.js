// PROTOTYPE (#115), throwaway: stand-ins for @snapscript/table-reader, checker and runtime, just enough for demo 1.
// Shapes follow the decided APIs: read(tableState) -> { text, lines, unread }, check(text, skippedLines) -> { errors,
// program }, compile(program) -> JS for p5 instance mode. Rules are the decided ones where cheap, mocked where not.

const U = 30, MARK = [8.5, 15];  // card mm: 1U, marker centre from the card's top-left
const STANDALONE = /^\[(define|on|global|import|extern)\b/;

// a card's length, from the card sheet rule (Geist Mono 26 pt ~ 5.5 mm a letter; label from 21.5 mm, 3 mm padding,
// 3 mm gap, whiteboard at least 2U; colour cards 4U; [define{…}] 5U)
function lengthU(note) {
  if (note === '[dedent]') return 2;
  if (/^\[color\(/.test(note)) return 4;
  if (/^\[define\{/.test(note)) return 5;
  const hw = note.match(/^\[(\w+)\{[^}]*\}(\w*)\]$/);
  if (hw) return Math.max(2, Math.ceil((21.5 + [hw[1], hw[2]].filter(Boolean).reduce((n, w) => n + w.length * 5.5 + 3, 0) + 60 + 3) / U - 1e-9));
  const label = note.replace(/^\[\w+\(?/, '').replace(/\)?\]$/, '').split('.').pop() || note.slice(1, -1);
  return Math.max(2, Math.ceil((21.5 + label.length * 5.5 + 3) / U - 1e-9));
}

// ---- table reader ----------------------------------------------------------------------------------------------
function geometry(c, notes) {
  const note = notes[c.marker], a = c.angle * Math.PI / 180, u = [Math.cos(a), Math.sin(a)], v = [-u[1], u[0]];
  const L = lengthU(note) * U, tl = [c.x - MARK[0] * u[0] - MARK[1] * v[0], c.y - MARK[0] * u[1] - MARK[1] * v[1]];
  return { ...c, note, L, u, v, tl, end: [tl[0] + L * u[0], tl[1] + L * u[1]] };
}
const dist = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1]);
const angDiff = (a, b) => Math.abs(((a - b + 540) % 360) - 180);

function read(state, notes, { split }) {
  const cards = state.cards.filter(c => notes[c.marker] && c.x < split).map(c => geometry(c, notes));
  const near = (p, cand, tol = 10) => cand.filter(o => dist(p, o.tl) < tol).sort((a, b) => dist(p, a.tl) - dist(p, b.tl))[0];
  // each card measured against its neighbour: 10 mm, 15°
  const right = new Map(), hasLeft = new Set();
  for (const c of cards) {
    const n = near(c.end, cards.filter(o => o !== c && angDiff(o.angle, c.angle) < 15));
    if (n && !hasLeft.has(n)) { right.set(c, n); hasLeft.add(n); }
  }
  const lineOf = head => { const l = [head]; let c = head; while (right.has(c)) l.push(c = right.get(c)); return l; };
  const heads = cards.filter(c => !hasLeft.has(c));
  const below = h => {  // the head of the line under this one: one row down, indent 0 or ±1U
    const down = [h.tl[0] + U * h.v[0], h.tl[1] + U * h.v[1]];
    return [0, 1, -1].map(k => ({ k, n: near([down[0] + k * U * h.u[0], down[1] + k * U * h.u[1]], heads.filter(o => o !== h && angDiff(o.angle, h.angle) < 15)) }))
      .find(x => x.n);
  };
  const strips = heads.filter(h => STANDALONE.test(h.note)).sort((a, b) => a.tl[1] - b.tl[1] || a.tl[0] - b.tl[0]);
  const lines = [], used = new Set();
  for (const s of strips) {
    let h = s, col = 0;
    while (h && !used.has(h)) {
      used.add(h);
      lines.push({ col, cards: lineOf(h) });
      const b = below(h);
      if (!b || STANDALONE.test(b.n.note)) break;
      h = b.n; col = Math.max(0, col + b.k);
    }
  }
  const unread = [];
  const text = lines.map((l, i) => {
    const t = l.cards.map(c => {
      if (!c.hw) return c.note;
      if (c.hw.state !== 'read') { unread.push(i + 1); return c.note.replace(/\{[^}]*\}/, '{}'); }
      return c.note.replace(/\{[^}]*\}/, `{${c.hw.text}}`);
    }).join('');
    return '  '.repeat(l.col) + t;
  }).join('\n');
  const detached = heads.filter(h => !used.has(h)).map(lineOf);
  return { text, lines, unread: [...new Set(unread)], detached };
}

// ---- checker ---------------------------------------------------------------------------------------------------
const FN = {  // arity and kinds, mocked from snapscript-p5
  'p5.createCanvas': ['num', 'num'], 'p5.background': ['color'], 'p5.noStroke': [], 'p5.fill': ['color'],
  'p5.rect': ['num', 'num', 'num', 'num'], 'p5.circle': ['num', 'num', 'num'], random: ['num'],
};
const tok = line => (line.match(/\[[^\[\]]*\]/g) || []);

function check(text, skippedLines = []) {
  const src = text.split('\n'), errors = [], skip = new Set(skippedLines);
  const err = (line, card, kind, message) => { errors.push({ line, card, kind, message }); skip.add(line); };
  const col = s => (s.match(/^ */)[0].length) / 2;
  // blocks: a head at col c opens col c+1; [dedent] at col c closes; a line at col c with the block open is an
  // IndentationError on the head, skipped with its body (#133)
  const open = [];  // { line, col }
  src.forEach((s, i) => {
    const n = i + 1, c = col(s), t = tok(s);
    if (t[0] === '[dedent]') {
      const b = open.findLastIndex(o => o.col === c);
      if (b < 0) err(n, 0, 'IndentationError', 'no block to close');
      else open.splice(b);
      return;
    }
    while (open.length && c <= open.at(-1).col) {
      const b = open.pop();
      err(b.line, 0, 'IndentationError', `no [dedent] closes this ${tok(src[b.line - 1])[0]}`);
      for (let k = b.line + 1; k < n; k++) skip.add(k);
    }
    const expect = open.length ? open.at(-1).col + 1 : 0;
    if (c > expect) err(n, 0, 'IndentationError', 'indented too far');
    if (t[0] === '[repeat]') open.push({ line: n, col: c });
  });
  // statements and values
  const defined = new Set();
  src.forEach((s, i) => {
    const n = i + 1, t = tok(s);
    if (skip.has(n) || t[0] === '[dedent]') return;
    let p = 0;
    const value = want => {
      const at = p, c = t[p++];
      if (c === undefined) return null;
      let kind, m;
      if ((m = c.match(/^\[num\{(.*)\}\]$/))) { if (m[1] === '' ) return { e: 'unread', at }; kind = 'num'; }
      else if (/^\[color\(/.test(c)) kind = 'color';
      else if ((m = c.match(/^\[get\{(.*)\}\]$/))) {
        if (!defined.has(m[1].toLowerCase())) return { e: `NameError: ${m[1]} is not defined`, at };
        kind = 'any';
      } else if ((m = c.match(/^\[call\((.*)\)\]$/))) {
        const r = call(m[1], at); if (r.e) return r; kind = 'num';
      } else return { e: `SyntaxError: ${c} can't go here`, at };
      if (want && kind !== 'any' && kind !== want) return { e: `TypeError: a ${kind} where a ${want} goes`, at };
      return { at };
    };
    const call = (name, at) => {
      const sig = FN[name];
      if (!sig) return { e: `NameError: ${name} is not defined`, at };
      for (let k = 0; k < sig.length; k++) {
        if (p >= t.length) return { e: `TypeError: ${name} takes ${sig.length} value${sig.length === 1 ? '' : 's'}, it has ${k}`, at };
        const r = value(sig[k]); if (r && r.e) return r;
      }
      return {};
    };
    let m, r = {};
    const head = t[0];
    if (!head) return;  // an empty buffer
    if ((m = head.match(/^\[define\{(.*)\}\]$/))) p = 1;
    else if (head === '[repeat]') { p = 1; r = value('num') || { e: 'TypeError: [repeat] takes 1 value', at: 0 }; }
    else if ((m = head.match(/^\[set\{(.*)\}to\]$/))) { p = 1; r = value(null) || { e: 'SyntaxError: nothing to set', at: 0 }; if (!r.e) defined.add(m[1].toLowerCase()); }
    else if ((m = head.match(/^\[call\((.*)\)\]$/))) { p = 1; r = call(m[1], 0); }
    else r = { e: `SyntaxError: ${head} can't start a line`, at: 0 };
    if (!r.e && p < t.length) r = { e: `TypeError: too many values`, at: p };
    if (r.e === 'unread') { skip.add(n); return; }
    if (r.e) { const [kind, ...msg] = r.e.split(': '); err(n, r.at, kind, msg.join(': ')); }
  });
  // a skipped [define] skips its body (the rest of its strip, up to the next standalone card)
  src.forEach((s, i) => {
    if (!skip.has(i + 1) || !/^\[define/.test(tok(s)[0] || '')) return;
    for (let j = i + 1; j < src.length && !STANDALONE.test(tok(src[j])[0] || ''); j++) skip.add(j + 1);
  });
  // a skipped block head skips its body, and the [dedent] that closes it
  src.forEach((s, i) => {
    if (!skip.has(i + 1) || tok(s)[0] !== '[repeat]') return;
    for (let j = i + 1; j < src.length; j++) {
      if (col(src[j]) > col(s)) { skip.add(j + 1); continue; }
      if (tok(src[j])[0] === '[dedent]' && col(src[j]) === col(s)) skip.add(j + 1);
      break;
    }
  });
  const program = src.map((s, i) => skip.has(i + 1) ? null : s);
  return { errors, skipped: [...skip].sort((a, b) => a - b), program };
}

// ---- runtime: compile to p5 instance mode ----------------------------------------------------------------------
function compile(program) {
  const js = [], open = [], vars = new Set();
  let fn = null;
  program.forEach(s => {
    if (s === null) return;
    const t = tok(s);
    if (!t.length) return;
    let p = 0;
    const value = () => {
      const c = t[p++]; let m;
      if ((m = c.match(/^\[num\{(.*)\}\]$/))) return String(Number(m[1]));
      if ((m = c.match(/^\[color\((.*)\)\]$/))) return JSON.stringify(m[1]);
      if ((m = c.match(/^\[get\{(.*)\}\]$/))) return `v_${m[1].toLowerCase()}`;
      if ((m = c.match(/^\[call\((.*)\)\]$/))) return callJs(m[1]);
    };
    const callJs = name => {
      const args = FN[name].map(() => value());
      return name === 'random' ? `p.random(0, ${args[0]})` : `p.${name.slice(3)}(${args.join(', ')})`;
    };
    let m;
    if ((m = t[0].match(/^\[define\{(.*)\}\]$/))) { if (fn) js.push('};'); fn = m[1]; js.push(`p.${fn} = function () {`); }
    else if (t[0] === '[repeat]') { p = 1; js.push(`for (let i${open.length} = 0; i${open.length} < ${value()}; i${open.length}++) {`); open.push(1); }
    else if (t[0] === '[dedent]') { if (open.pop()) js.push('}'); }
    else if ((m = t[0].match(/^\[set\{(.*)\}to\]$/))) { p = 1; vars.add(`v_${m[1].toLowerCase()}`); js.push(`v_${m[1].toLowerCase()} = ${value()};`); }
    else if ((m = t[0].match(/^\[call\((.*)\)\]$/))) { p = 1; js.push(callJs(m[1]) + ';'); }
  });
  while (open.pop()) js.push('}');
  if (fn) js.push('};');
  return (vars.size ? `let ${[...vars].join(', ')};\n` : '') + js.join('\n');
}

module.exports = { read, check, compile, lengthU };
