// PROTOTYPE (#147), throwaway: replay recorded table states (vision-*.jsonl) through the reader stand-in and the
// checker, and count what the table view would have changed. Rules come from the same env as the app:
//   JOIN='{"mode":"axis","make":10,"brk":15}' KEEP_TEXT=1 node replay.js ../runs/vision-*.jsonl
// Per file: table states, how many changed what's projected (lines, errors, skipped lines, detached lines, unread
// lines), how many of those were join flips or unread flips, and each join's along/across/corner range.
const fs = require('fs'), path = require('path');
const snap = require('./snap.js');
const cj = JSON.parse(fs.readFileSync(path.join(__dirname, '../cards.json'), 'utf8'));
snap.setLen(cj.len || {});
const SPLIT = +(process.env.SPLIT_MM || 592.5);  // 1.5 x 790 mm / 2: the coding space's right edge
const verbose = !!process.env.VERBOSE;

for (const f of process.argv.slice(2)) {
  const rows = fs.readFileSync(f, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.state);
  let prevJoins = new Set(), last = null, changes = 0, joinFlips = 0, unreadFlips = 0, errFlips = 0, lastJ = null, lastU = null, lastE = null;
  const span = {};
  const lastText = {};  // track -> last read text (old logs clear it on a re-read; KEEP_TEXT puts it back)
  for (const r of rows) {
    if (process.env.KEEP_TEXT) for (const c of r.state) if (c.hw) {
      if (c.hw.text !== undefined) lastText[c.track] = c.hw.text;
      else if (c.hw.state === 'reading' && lastText[c.track] !== undefined) c.hw = { ...c.hw, text: lastText[c.track] };
    }
    const rd = snap.read({ cards: r.state }, cj.cards, { split: SPLIT, prevJoins });
    prevJoins = rd.joined;
    const ck = snap.check(rd.text, rd.unread);
    for (const g of rd.gaps) {
      if (!(g.along > -15 && g.along < 25 && Math.abs(g.across) < 15)) continue;  // only pairs that sit end to end
      const k = `${g.an}#${g.a} > ${g.bn}#${g.b}`, s = span[k] || (span[k] = { n: 0, along: [1e9, -1e9], across: [1e9, -1e9], corner: [1e9, -1e9], off: 0 });
      s.n++; if (!rd.joined.has(`${g.a}>${g.b}`)) s.off++;
      for (const q of ['along', 'across', 'corner']) { s[q][0] = Math.min(s[q][0], g[q]); s[q][1] = Math.max(s[q][1], g[q]); }
    }
    const J = JSON.stringify([...rd.joined].sort()), U = JSON.stringify(rd.unread), E = JSON.stringify([ck.errors, ck.skipped]);
    const key = JSON.stringify([rd.lines.map(l => l.cards.map(c => c.track)), ck.errors.map(e => [e.line, e.card, e.kind]), ck.skipped, rd.detached.length, rd.unread]);
    if (last !== null && key !== last) {
      changes++;
      if (J !== lastJ) joinFlips++;
      if (U !== lastU) unreadFlips++;
      if (E !== lastE) errFlips++;
      if (verbose) console.log(`  ${(r.t_cap - rows[0].t_cap).toFixed(1)}s  joins ${J !== lastJ ? 'flip' : '-'}  unread ${U}  errors ${ck.errors.map(e => e.kind + '@' + e.line).join(' ')}  detached ${rd.detached.length}`);
    }
    last = key; lastJ = J; lastU = U; lastE = E;
  }
  const dur = rows.length ? rows.at(-1).t_cap - rows[0].t_cap : 0;
  console.log(`${path.basename(f)}: ${rows.length} states in ${dur.toFixed(0)} s; projected changes ${changes} (${(60 * changes / Math.max(dur, 1)).toFixed(1)}/min): joins ${joinFlips}, unread ${unreadFlips}, errors/skips ${errFlips}`);
  if (process.env.GAPS) for (const [k, s] of Object.entries(span).sort())
    console.log(`  ${k.padEnd(48)} n ${String(s.n).padStart(4)} broken ${String(s.off).padStart(4)}  along ${s.along.map(x => x.toFixed(1)).join('..')}  across ${s.across.map(x => x.toFixed(1)).join('..')}  corner ${s.corner.map(x => x.toFixed(1)).join('..')}`);
}
