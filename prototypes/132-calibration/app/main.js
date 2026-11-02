// PROTOTYPE (#132, from #147 and #115), throwaway: the table app, with calibration in its settings menu (`,`).
// #132: table.html runs the menu and the calibration steps; this process passes its commands to vision.py over the same
// socket, hides the sketch while calibrating, and keeps px per mm in step with the line-up's scale.
//
// vision.py (TCP, one table state per line) -> read -> check -> compile, in this process (the packages run in
// process). The sketch runs in its own renderer (a WebContentsView in the same window, reused across restarts);
// the table view draws the gutter, badges, error outline and status bar. Every table state's trip is timed and
// written to runs/latency-*.jsonl: t_cap (frame exposed) -> t_sent (vision) -> t_recv -> t_read -> t_check ->
// t_lit (table view drew it) / t_drawn (the sketch's first frame after a restart).
//
//   STRESS=600 ~/electron/electron --ozone-platform=wayland .    (STRESS: extra animated confetti, for headroom)

const { app, BrowserWindow, WebContentsView, ipcMain, screen } = require('electron');
const net = require('net'), fs = require('fs'), path = require('path');
const snap = require('./snap.js');

const CARDS_JSON = JSON.parse(fs.readFileSync(path.join(__dirname, '../cards.json'), 'utf8')), NOTES = CARDS_JSON.cards;
snap.setLen(CARDS_JSON.len || {});
const RIG = JSON.parse(fs.readFileSync(path.join(__dirname, '../rig.json'), 'utf8'));
let TABLE_MM = RIG.typed_depth_mm;  // #132: mm per projector height; follows the line-up's scale
const ASPECT = RIG.aspect, SPLIT = 0.5, SKETCH_PX = 500, U_PX = 50;  // app px: 1U = 50 px
const runs = path.join(__dirname, '../runs');
fs.mkdirSync(runs, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const latLog = fs.createWriteStream(path.join(runs, `latency-${stamp}.jsonl`), { flags: 'a' });
// #147: every read's joins (along/across/corner per candidate pair) and what the table view showed
const gapLog = fs.createWriteStream(path.join(runs, `gaps-${stamp}.jsonl`), { flags: 'a' });
gapLog.write(JSON.stringify({ join: snap.JOIN, keep_text: !!process.env.KEEP_TEXT }) + '\n');
let prevJoins = new Set();
const now = () => Date.now() / 1000;

const WAIT_S = 5;
let waitSince = null, waitTimer = null, lastRun = null;
let win, sketch, geo, sock = null, lastText = null, lastLight = null, lastFrame = {}, fps = 0;
const pending = new Map();  // seq -> trip record, until the views report

function finish(seq) {
  const r = pending.get(seq);
  if (!r || (r.wantLit && !r.t_lit) || (r.wantDrawn && !r.t_drawn)) return;
  pending.delete(seq);
  latLog.write(JSON.stringify(r) + '\n');
  win.webContents.send('trip', r);
}
setInterval(() => { for (const [s, r] of pending) if (now() - r.t_recv > 5) { r.timeout = true; pending.delete(s); latLog.write(JSON.stringify(r) + '\n'); } }, 1000);

process.on('uncaughtException', e => fs.appendFileSync(path.join(runs, 'app-errors.log'), `${new Date().toISOString()} ${e.stack}\n`));

function onState(st) {
  const r = { seq: st.seq, t_cap: st.t_cap, t_sent: st.t_sent, t_recv: now(), cards: st.cards.length };
  const rd = snap.read(st, NOTES, { split: geo.splitMm, prevJoins });
  prevJoins = rd.joined;
  r.t_read = now();
  const ck = snap.check(rd.text, rd.unread);
  r.t_check = now();
  const text = rd.text;
  r.text_changed = text !== lastText;
  const light = {
    seq: st.seq,
    cards: st.cards.filter(c => NOTES[c.marker]).map(c => { const g = snap.geometry(c, NOTES); return { marker: c.marker, x: c.x, y: c.y, angle: c.angle, hw: c.hw, tl: g.tl, u: g.u, v: g.v, L: g.L }; }),
    lines: rd.lines.map(l => ({ col: l.col, cards: l.cards.map(c => ({ tl: c.tl, u: c.u, v: c.v, L: c.L, note: c.note })) })),
    detached: rd.detached.map(l => l.map(c => ({ tl: c.tl, u: c.u, v: c.v, L: c.L }))),
    errors: ck.errors, skipped: ck.skipped, unread: rd.unread,
  };
  const lightKey = JSON.stringify([light.lines.map(l => l.cards.map(c => c.tl.map(Math.round))), light.errors, light.skipped, light.detached.length]);
  r.light_changed = lightKey !== lastLight;
  lastLight = lightKey;
  r.wantLit = true;  // the table view redraws on every state (marker rings follow the cards)
  lastText = text;
  // "Handwriting in the loop": a card not read yet updates the check at once, but the run waits for it, up to
  // WAIT_S, before its line is skipped. A false re-read comes back with the same text, so nothing restarts.
  clearTimeout(waitTimer);
  if (rd.unread.length) {
    waitSince = waitSince || now();
    const left = WAIT_S - (now() - waitSince);
    if (left > 0) { r.held = true; waitTimer = setTimeout(() => onState(st), left * 1000 + 10); }
  } else waitSince = null;
  const runKey = JSON.stringify(ck.program);
  r.run_changed = !r.held && runKey !== lastRun;
  if (r.run_changed) {
    lastRun = runKey;
    r.js = snap.compile(ck.program);
    r.t_compile = now();
    r.wantDrawn = true;
    sketch.webContents.send('run', st.seq, r.js);
    module.exports.setLast && module.exports.setLast(r.js);
    global.capture && global.capture(st.seq);
  }
  r.errors = ck.errors.map(e => `${e.kind} line ${e.line}`);
  gapLog.write(JSON.stringify({ seq: st.seq, t_cap: st.t_cap, gaps: rd.gaps.map(g => ({ ...g, along: +g.along.toFixed(1), across: +g.across.toFixed(1), corner: +g.corner.toFixed(1) })),
    detached: rd.detached.length, unread: rd.unread, errors: r.errors, light: lightKey }) + '\n');
  pending.set(st.seq, r);
  win.webContents.send('state', light, { frame: lastFrame, fps, text });
}

function setScale(mm) {  // #132: the line-up's mm per projector height changed: so do px per mm
  if (!mm || Math.abs(mm - TABLE_MM) < 0.05) return;
  TABLE_MM = mm;
  geo.pxMm = geo.H / TABLE_MM; geo.splitMm = geo.splitPx / geo.pxMm;
  win.webContents.send('geo', geo);
}

function connect() {
  sock = net.connect(8115, '127.0.0.1');
  let buf = '';
  sock.setNoDelay(true);
  sock.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.type === 'state') onState(m);
      else if (m.type === 'calib') { setScale(m.lineup && m.lineup.scale); win.webContents.send('calib', m); }
      else { lastFrame = m; setScale(m.lineup && m.lineup.scale); win.webContents.send('frame', { lineup: m.lineup, cal: m.cal, raw: m.raw, search_s: m.search_s, exp_ms: m.exp_ms, gain: m.gain }); }
    }
  });
  sock.on('error', () => {});
  sock.on('close', () => setTimeout(connect, 1000));
}

app.whenReady().then(() => {
  const { width: W, height: H } = screen.getPrimaryDisplay().bounds;
  const pxMm = H / TABLE_MM, AW = Math.min(W, ASPECT * H), splitPx = AW * SPLIT;
  const zoom = (30 * pxMm) / U_PX, side = Math.round(SKETCH_PX * zoom);
  geo = { W, H, pxMm, AW, splitPx, splitMm: splitPx / pxMm, zoom,
    sketch: { x: Math.round(splitPx + (AW - splitPx - side) / 2), y: Math.round((H - side) / 2), w: side, h: side } };

  win = new BrowserWindow({ x: 0, y: 0, width: W, height: H, fullscreen: true, frame: false, backgroundColor: '#000',
    webPreferences: { preload: path.join(__dirname, 'preload-table.js') } });
  win.loadFile(path.join(__dirname, 'table.html'), { query: { geo: JSON.stringify(geo), outline: process.env.OUTLINE || 'face', rig: JSON.stringify(RIG) } });

  sketch = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload-sketch.js'), contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  sketch.setBackgroundColor('#000');
  win.contentView.addChildView(sketch);
  sketch.setBounds({ x: geo.sketch.x, y: geo.sketch.y, width: geo.sketch.w, height: geo.sketch.h });
  sketch.webContents.loadFile(path.join(__dirname, 'sketch.html'), { query: { stress: process.env.STRESS || '0', mode: process.env.SKETCH || 'a', scale: String(zoom) } });
  sketch.webContents.on('did-finish-load', () => { sketch.webContents.setZoomFactor(process.env.SKETCH === 'b' ? 1 : zoom); win.webContents.once('did-finish-load', connect); if (!win.webContents.isLoading()) connect(); });

  // #132: the table view's commands for vision.py, and hiding the sketch while calibrating
  ipcMain.on('cmd', (_, c) => { if (sock) sock.write(JSON.stringify(c) + '\n'); });
  ipcMain.on('sketch', (_, show) => sketch.setVisible(!!show));
  win.webContents.on('did-finish-load', () => win.webContents.focus());
  // over SSH: echo Enter > runs/key (or ',' 'ArrowDown' 'Escape' ...) presses a key in the table view
  fs.watchFile(path.join(runs, 'key'), { interval: 200 }, () => {
    try { const k = fs.readFileSync(path.join(runs, 'key'), 'utf8').trim(); if (k) { fs.writeFileSync(path.join(runs, 'key'), ''); k.split(/\s+/).forEach((key, i) => setTimeout(() => win.webContents.send('key', key), i * 150)); } } catch (e) {}
  });
  ipcMain.on('lit', (_, seq, t) => { const r = pending.get(seq); if (r) { r.t_lit = t; finish(seq); } });
  ipcMain.on('drawn', (_, seq, t, err) => { const r = pending.get(seq); if (r) { r.t_drawn = t; if (err) r.run_error = err; finish(seq); } });
  ipcMain.on('fps', (_, f) => { fps = f; fs.appendFileSync(path.join(runs, 'fps.log'), `${now().toFixed(1)} ${f}\n`); });
  ipcMain.on('grab', (_, seq, ms, g) => {
    if (!process.env.CAPTURE) return;
    if (!g) return fs.appendFileSync(path.join(runs, 'grab.log'), `${seq} ${ms} no canvas\n`);
    fs.appendFileSync(path.join(runs, 'grab.log'), `${seq} ${ms} ${g.w}x${g.h} css ${g.cssW} dpr ${g.dpr}\n`);
    fs.writeFileSync(path.join(runs, `grab-${seq}-${String(ms).padStart(4, '0')}.png`), Buffer.from(g.url.split(',')[1], 'base64'));
  });
  // debug: touch runs/rerun to restart the sketch with the same program; CAPTURE=1 grabs the sketch view after each run
  let lastJs = null;
  sketch.webContents.on('ipc-message', () => {});
  fs.watchFile(path.join(runs, 'rerun'), { interval: 200 }, () => { if (lastJs) sketch.webContents.send('run', -1, lastJs); capture(-1); });
  global.capture = capture;
  function capture(seq) {
    if (!process.env.CAPTURE) return;
    const t0 = Date.now();
    for (const ms of [0, 30, 60, 100, 200, 400, 800]) setTimeout(async () => {
      const img = await sketch.webContents.capturePage();
      fs.writeFileSync(path.join(runs, `cap-${seq}-${String(Date.now() - t0).padStart(4, '0')}.png`), img.toPNG());
    }, ms);
  }
  module.exports.setLast = js => { lastJs = js; };

  setTimeout(async () => {
    const info = { featureStatus: app.getGPUFeatureStatus(), gpu: await app.getGPUInfo('complete'), geo };
    fs.writeFileSync(path.join(runs, `gpu-${stamp}.json`), JSON.stringify(info, null, 1));
  }, 3000);
});
