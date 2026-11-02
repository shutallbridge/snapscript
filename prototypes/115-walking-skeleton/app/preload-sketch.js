// PROTOTYPE (#115): the sketch view. One p5 instance at a time; a new program removes the old one and starts again.
const { ipcRenderer } = require('electron');
const stress = Number(new URLSearchParams(location.search).get('stress') || 0);
let inst = null;

// STRESS: demo 4's animated confetti (N rects falling), drawn over the program every frame, to load the renderer
function addStress(p) {
  if (!stress) return;
  const xs = [], ys = [], cs = ['gold', 'hotpink', 'aquamarine'];
  for (let i = 0; i < stress; i++) { xs.push(Math.random() * 500); ys.push(Math.random() * 500); }
  const draw0 = p.draw;
  p.draw = () => {
    if (draw0) draw0();
    p.background('mediumblue');
    p.noStroke();
    for (let i = 0; i < stress; i++) {
      ys[i] = ys[i] > 500 ? -16 : ys[i] + 2;
      p.fill(cs[i % 3]); p.rect(xs[i], ys[i], 10, 16);
    }
  };
}

// SKETCH=a: one container, the old instance removed before the new one starts (what first showed half-drawn frames).
// SKETCH=b: zoom 1 and the canvas scaled by CSS; the new instance draws in a hidden container and is swapped in
// once its first frame is drawn, so a half-painted canvas is never on screen.
const mode = new URLSearchParams(location.search).get('mode') || 'a';
const scale = Number(new URLSearchParams(location.search).get('scale') || 1);

window.addEventListener('DOMContentLoaded', () => {
  const root = document.getElementById('c');
  if (mode === 'b') { root.style.transform = `scale(${scale})`; root.style.transformOrigin = '0 0'; root.style.position = 'relative'; root.style.width = root.style.height = '500px'; }  // sized: absolute children alone give it no height, and the page clips
  ipcRenderer.on('run', (_, seq, js) => {
    let el = root;
    if (mode === 'a') { if (inst) inst.remove(); }
    else { el = document.createElement('div'); el.style.cssText = 'position:absolute;left:0;top:0;visibility:hidden'; root.appendChild(el); }
    const old = inst;
    let first = true, err = null;
    const shown = () => {
      if (mode === 'b') { el.style.visibility = 'visible'; if (old) old.remove(); [...root.children].filter(d => d !== el).forEach(d => d.remove()); }
      requestAnimationFrame(() => ipcRenderer.send('drawn', seq, Date.now() / 1000, err));
    };
    inst = new p5(p => {
      try { new Function('p', js)(p); } catch (e) { err = String(e); }
      const setup0 = p.setup, draw0 = p.draw;
      p.setup = () => { if (mode === 'b') p.pixelDensity(1); try { setup0 && setup0(); } catch (e) { err = String(e); } };
      p.draw = () => { try { draw0 && draw0(); } catch (e) { err = String(e); } };
      addStress(p);
      const d1 = p.draw;
      p.draw = () => { d1(); if (first) { first = false; requestAnimationFrame(shown); } };
    }, el);
  });
  setInterval(() => inst && ipcRenderer.send('fps', Math.round(inst.frameRate())), 1000);
});
