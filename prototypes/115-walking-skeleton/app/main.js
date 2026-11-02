// PROTOTYPE (#115), throwaway: the walking skeleton's table app. Electron main process.
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

const NOTES = JSON.parse(fs.readFileSync(path.join(__dirname, '../cards.json'), 'utf8')).cards;
const TABLE_MM = 790, ASPECT = 1.5, SPLIT = 0.5, SKETCH_PX = 500, U_PX = 50;  // app px: 1U = 50 px
const runs = path.join(__dirname, '../runs');
fs.mkdirSync(runs, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 15);
const latLog = fs.createWriteStream(path.join(runs, `latency-${stamp}.jsonl`), { flags: 'a' });
const now = () => Date.now() / 1000;

let win, sketch, geo, lastText = null, lastLight = null, lastFrame = {}, fps = 0;
const pending = new Map();  // seq -> trip record, until the views report

function finish(seq) {
  const r = pending.get(seq);
  if (!r || (r.wantLit && !r.t_lit) || (r.wantDrawn && !r.t_drawn)) return;
  pending.delete(seq);
  latLog.write(JSON.stringify(r) + '\n');
  win.webContents.send('trip', r);
}
setInterval(() => { for (const [s, r] of pending) if (now() - r.t_recv > 5) { r.timeout = true; pending.delete(s); latLog.write(JSON.stringify(r) + '\n'); } }, 1000);

function onState(st) {
  const r = { seq: st.seq, t_cap: st.t_cap, t_sent: st.t_sent, t_recv: now(), cards: st.cards.length };
  const rd = snap.read(st, NOTES, { split: geo.splitMm });
  r.t_read = now();
  const ck = snap.check(rd.text, rd.unread);
  r.t_check = now();
  const text = rd.text;
  r.text_changed = text !== lastText;
  const light = {
    seq: st.seq,
    cards: st.cards.map(c => ({ marker: c.marker, x: c.x, y: c.y, angle: c.angle, hw: c.hw })),
    lines: rd.lines.map(l => ({ col: l.col, cards: l.cards.map(c => ({ tl: c.tl, u: c.u, v: c.v, L: c.L, note: c.note })) })),
    detached: rd.detached.map(l => l.map(c => ({ tl: c.tl, u: c.u, v: c.v, L: c.L }))),
    errors: ck.errors, skipped: ck.skipped, unread: rd.unread,
  };
  const lightKey = JSON.stringify([light.lines.map(l => l.cards.map(c => c.tl.map(Math.round))), light.errors, light.skipped, light.detached.length]);
  r.light_changed = lightKey !== lastLight;
  lastLight = lightKey;
  r.wantLit = true;  // the table view redraws on every state (marker rings follow the cards)
  if (r.text_changed) {
    lastText = text;
    r.js = snap.compile(ck.program);
    r.t_compile = now();
    r.wantDrawn = true;
    sketch.webContents.send('run', st.seq, r.js);
  }
  r.errors = ck.errors.map(e => `${e.kind} line ${e.line}`);
  pending.set(st.seq, r);
  win.webContents.send('state', light, { frame: lastFrame, fps, text });
}

function connect() {
  const sock = net.connect(8115, '127.0.0.1');
  let buf = '';
  sock.setNoDelay(true);
  sock.on('data', d => {
    buf += d;
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
      if (m.type === 'state') onState(m); else lastFrame = m;
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
  win.loadFile(path.join(__dirname, 'table.html'), { query: { geo: JSON.stringify(geo) } });

  sketch = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload-sketch.js'), contextIsolation: false, sandbox: false, backgroundThrottling: false } });
  sketch.setBackgroundColor('#000');
  win.contentView.addChildView(sketch);
  sketch.setBounds({ x: geo.sketch.x, y: geo.sketch.y, width: geo.sketch.w, height: geo.sketch.h });
  sketch.webContents.loadFile(path.join(__dirname, 'sketch.html'), { query: { stress: process.env.STRESS || '0' } });
  sketch.webContents.on('did-finish-load', () => { sketch.webContents.setZoomFactor(zoom); win.webContents.once('did-finish-load', connect); if (!win.webContents.isLoading()) connect(); });

  ipcMain.on('lit', (_, seq, t) => { const r = pending.get(seq); if (r) { r.t_lit = t; finish(seq); } });
  ipcMain.on('drawn', (_, seq, t, err) => { const r = pending.get(seq); if (r) { r.t_drawn = t; if (err) r.run_error = err; finish(seq); } });
  ipcMain.on('fps', (_, f) => { fps = f; });

  setTimeout(async () => {
    const info = { featureStatus: app.getGPUFeatureStatus(), gpu: await app.getGPUInfo('complete'), geo };
    fs.writeFileSync(path.join(runs, `gpu-${stamp}.json`), JSON.stringify(info, null, 1));
  }, 3000);
});
