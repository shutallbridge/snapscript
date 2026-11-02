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

window.addEventListener('DOMContentLoaded', () => {
  const el = document.getElementById('c');
  ipcRenderer.on('run', (_, seq, js) => {
    if (inst) inst.remove();
    let first = true, err = null;
    inst = new p5(p => {
      try { new Function('p', js)(p); } catch (e) { err = String(e); }
      const setup0 = p.setup, draw0 = p.draw;
      p.setup = () => { try { setup0 && setup0(); } catch (e) { err = String(e); } if (!p._renderer || !p.canvas) p.createCanvas(500, 500); };
      p.draw = () => {
        try { draw0 && draw0(); } catch (e) { err = String(e); }
        if (first) { first = false; requestAnimationFrame(() => ipcRenderer.send('drawn', seq, Date.now() / 1000, err)); }
      };
      addStress(p);
      const d1 = p.draw;
      p.draw = () => { d1(); if (first) { first = false; requestAnimationFrame(() => ipcRenderer.send('drawn', seq, Date.now() / 1000, err)); } };
    }, el);
  });
  setInterval(() => inst && ipcRenderer.send('fps', Math.round(inst.frameRate())), 1000);
});
