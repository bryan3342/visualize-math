// Geometric view: animated 2D grid transforms, basis vectors, eigen rays, det area.

import { fmt } from './matrix.js';

const I2 = [[1, 0], [0, 1]];
const LEG_MS = 3000;
const BASE_UNIT = 56;

const C = {
  gridFaint: 'rgba(148, 163, 184, 0.12)',
  axisFaint: 'rgba(148, 163, 184, 0.35)',
  grid: 'rgba(96, 165, 250, 0.45)',
  axis: 'rgba(147, 197, 253, 0.9)',
  iHat: '#34d399',
  jHat: '#f87171',
  vector: '#fbbf24',
  eigen: '#c084fc',
  square: 'rgba(52, 211, 153, 0.16)',
  squareEdge: 'rgba(52, 211, 153, 0.6)',
  text: '#e5e7eb',
  subtext: '#94a3b8',
};

const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a, b, t) => a + (b - a) * t;
const lerpMat = (a, b, t) => [
  [lerp(a[0][0], b[0][0], t), lerp(a[0][1], b[0][1], t)],
  [lerp(a[1][0], b[1][0], t), lerp(a[1][1], b[1][1], t)],
];

export class Plane {
  constructor(canvas, controls, messageEl) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.controls = controls;
    this.messageEl = messageEl;
    this.scene = null;
    this.progress = 1;
    this.playing = false;
    this.speed = 1;
    this.unit = BASE_UNIT;
    this.raf = 0;
    this.lastTs = 0;

    new ResizeObserver(() => this.resize()).observe(canvas.parentElement);
    controls.play.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    controls.restart.addEventListener('click', () => { this.progress = 0; this.play(); });
    controls.scrub.addEventListener('input', () => {
      this.pause();
      this.progress = controls.scrub.value / 1000;
      this.render();
    });
    controls.speed.addEventListener('change', () => { this.speed = Number(controls.speed.value); });
    if (controls.zoomIn) controls.zoomIn.addEventListener('click', () => this.zoomBy(1.25));
    if (controls.zoomOut) controls.zoomOut.addEventListener('click', () => this.zoomBy(1 / 1.25));
    if (controls.zoomReset) controls.zoomReset.addEventListener('click', () => { this.unit = BASE_UNIT; this.render(); });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      this.zoomBy(Math.exp(-e.deltaY * 0.0012));
    }, { passive: false });
    this.resize();
  }

  // scene: { stages: [{ m, label }], vectors: [{ v: [x,y], ride, label }], eigen, showSquare, showBasis }
  setScene(scene) {
    this.scene = scene;
    this.messageEl.hidden = true;
    this.progress = 0;
    this.play();
  }

  clear(message) {
    this.scene = null;
    this.pause();
    this.messageEl.textContent = message ?? '';
    this.messageEl.hidden = false;
    this.controls.stageLabel.textContent = '';
    this.render();
  }

  play() {
    if (!this.scene) return;
    if (this.progress >= 1) this.progress = 0;
    this.playing = true;
    this.controls.play.textContent = '⏸';
    this.lastTs = 0;
    cancelAnimationFrame(this.raf);
    const tick = (ts) => {
      if (!this.playing) return;
      if (this.lastTs) {
        const total = this.scene.stages.length * LEG_MS;
        this.progress = Math.min(1, this.progress + ((ts - this.lastTs) * this.speed) / total);
      }
      this.lastTs = ts;
      this.render();
      if (this.progress >= 1) { this.pause(); return; }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    this.controls.play.textContent = '▶';
  }

  zoomBy(f) {
    this.unit = Math.min(220, Math.max(10, this.unit * f));
    this.render();
  }

  resize() {
    const parent = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    if (!w || !h) return;
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.render();
  }

  currentMatrix() {
    const stages = this.scene.stages;
    const s = this.progress * stages.length;
    const i = Math.min(Math.floor(s), stages.length - 1);
    const u = ease(Math.min(1, s - i));
    const from = i === 0 ? I2 : stages[i - 1].m;
    return { m: lerpMat(from, stages[i].m, u), stage: i };
  }

  render() {
    const ctx = this.ctx;
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (!w || !h) return;
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const cy = h / 2;
    const u = this.unit;
    const toScreen = ([x, y]) => [cx + x * u, cy - y * u];

    const scene = this.scene;
    const { m: M, stage } = scene ? this.currentMatrix() : { m: I2, stage: 0 };
    const apply = ([x, y]) => [M[0][0] * x + M[0][1] * y, M[1][0] * x + M[1][1] * y];
    const N = Math.min(80, Math.ceil(Math.max(w, h) / (2 * u)) + 6);

    ctx.lineWidth = 1;
    for (let k = -N; k <= N; k++) {
      ctx.strokeStyle = k === 0 ? C.axisFaint : C.gridFaint;
      line(ctx, toScreen([k, -N]), toScreen([k, N]));
      line(ctx, toScreen([-N, k]), toScreen([N, k]));
    }

    if (!scene) return;

    if (scene.showSquare) {
      const pts = [[0, 0], [1, 0], [1, 1], [0, 1]].map((p) => toScreen(apply(p)));
      ctx.beginPath();
      pts.forEach((p, i) => (i ? ctx.lineTo(...p) : ctx.moveTo(...p)));
      ctx.closePath();
      ctx.fillStyle = C.square;
      ctx.fill();
      ctx.strokeStyle = C.squareEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    for (let k = -N; k <= N; k++) {
      ctx.strokeStyle = k === 0 ? C.axis : C.grid;
      ctx.lineWidth = k === 0 ? 1.5 : 1;
      line(ctx, toScreen(apply([k, -N])), toScreen(apply([k, N])));
      line(ctx, toScreen(apply([-N, k])), toScreen(apply([N, k])));
    }

    if (scene.eigen) {
      ctx.setLineDash([6, 6]);
      ctx.strokeStyle = C.eigen;
      ctx.lineWidth = 1.5;
      for (const dir of scene.eigen.lines) {
        const d = normalize(dir);
        line(ctx, toScreen([d[0] * -N, d[1] * -N]), toScreen([d[0] * N, d[1] * N]));
      }
      ctx.setLineDash([]);
      for (const { v, value } of scene.eigen.arrows) {
        const tip = apply(normalize(v));
        arrow(ctx, toScreen([0, 0]), toScreen(tip), C.eigen, 3);
        label(ctx, toScreen(tip), `λ = ${fmt(value)}`, C.eigen);
      }
    }

    if (scene.showBasis !== false) {
      const iTip = apply([1, 0]);
      const jTip = apply([0, 1]);
      arrow(ctx, toScreen([0, 0]), toScreen(iTip), C.iHat, 3);
      arrow(ctx, toScreen([0, 0]), toScreen(jTip), C.jHat, 3);
      label(ctx, toScreen(iTip), 'î', C.iHat);
      label(ctx, toScreen(jTip), 'ĵ', C.jHat);
    }

    for (const { v, ride, label: name } of scene.vectors ?? []) {
      const tip = ride ? apply(v) : v;
      arrow(ctx, toScreen([0, 0]), toScreen(tip), C.vector, 3);
      label(ctx, toScreen(tip), name ?? '', C.vector);
    }

    this.drawReadout(M);
    const s = scene.stages[stage];
    this.controls.stageLabel.textContent =
      scene.stages.length > 1 ? `Step ${stage + 1}/${scene.stages.length}: ${s.label}` : (s.label ?? '');
    this.controls.scrub.value = Math.round(this.progress * 1000);
  }

  drawReadout(M) {
    const ctx = this.ctx;
    const pad = (n) => fmt(n).padStart(7);
    ctx.font = '13px ui-monospace, SFMono-Regular, Menlo, monospace';
    ctx.fillStyle = C.text;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(`⎡${pad(M[0][0])} ${pad(M[0][1])} ⎤`, 14, 14);
    ctx.fillText(`⎣${pad(M[1][0])} ${pad(M[1][1])} ⎦`, 14, 31);
    const d = M[0][0] * M[1][1] - M[0][1] * M[1][0];
    ctx.fillStyle = C.subtext;
    ctx.fillText(`det = ${fmt(d)}`, 14, 52);
  }
}

function line(ctx, [x0, y0], [x1, y1]) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

function arrow(ctx, [x0, y0], [x1, y1], color, width) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy);
  if (len < 2) return;
  const head = Math.min(11, len / 2);
  const ang = Math.atan2(dy, dx);
  const bx = x1 - head * Math.cos(ang);
  const by = y1 - head * Math.sin(ang);
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  line(ctx, [x0, y0], [bx, by]);
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx + (head / 2.2) * Math.cos(ang + Math.PI / 2), by + (head / 2.2) * Math.sin(ang + Math.PI / 2));
  ctx.lineTo(bx + (head / 2.2) * Math.cos(ang - Math.PI / 2), by + (head / 2.2) * Math.sin(ang - Math.PI / 2));
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function label(ctx, [x, y], text, color) {
  if (!text) return;
  ctx.font = '600 13px Inter, system-ui, sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(text, x + 6, y - 6);
}

function normalize([x, y]) {
  const len = Math.hypot(x, y) || 1;
  return [x / len, y / len];
}
