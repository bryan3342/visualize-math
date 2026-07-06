// Numeric step-by-step view: matrix-multiplication cells and elementary row operations.

import { dims, fmt } from './matrix.js';

const STEP_MS = 1500;

export class StepsPanel {
  constructor(root) {
    this.root = root;
    this.frames = [];
    this.index = 0;
    this.timer = 0;
    this.playing = false;
    root.innerHTML = `
      <div class="steps-stage"></div>
      <div class="steps-caption"></div>
      <div class="steps-controls">
        <button data-act="prev" title="Previous step">‹</button>
        <button data-act="play" title="Play / pause">▶</button>
        <button data-act="next" title="Next step">›</button>
        <span class="steps-counter"></span>
      </div>
      <div class="steps-empty">Numeric steps appear here for products like <code>A*B</code> and for <code>rref(…)</code>.</div>`;
    this.stage = root.querySelector('.steps-stage');
    this.caption = root.querySelector('.steps-caption');
    this.counter = root.querySelector('.steps-counter');
    this.controlsEl = root.querySelector('.steps-controls');
    this.emptyEl = root.querySelector('.steps-empty');
    this.playBtn = root.querySelector('[data-act="play"]');
    root.querySelector('[data-act="prev"]').addEventListener('click', () => this.go(this.index - 1, true));
    root.querySelector('[data-act="next"]').addEventListener('click', () => this.go(this.index + 1, true));
    this.playBtn.addEventListener('click', () => (this.playing ? this.pause() : this.play()));
    this.clear();
  }

  clear() {
    this.pause();
    this.frames = [];
    this.stage.innerHTML = '';
    this.caption.textContent = '';
    this.counter.textContent = '';
    this.emptyEl.hidden = false;
    this.controlsEl.hidden = true;
  }

  setFrames(frames) {
    this.pause();
    this.frames = frames;
    this.emptyEl.hidden = true;
    this.controlsEl.hidden = false;
    this.go(0);
    this.play();
  }

  go(i, manual = false) {
    if (!this.frames.length) return;
    if (manual) this.pause();
    this.index = Math.max(0, Math.min(this.frames.length - 1, i));
    const frame = this.frames[this.index];
    this.stage.innerHTML = frame.html;
    this.caption.innerHTML = frame.caption ?? '';
    this.counter.textContent = `${this.index + 1} / ${this.frames.length}`;
  }

  play() {
    if (this.frames.length < 2) return;
    if (this.index >= this.frames.length - 1) this.go(0);
    this.playing = true;
    this.playBtn.textContent = '⏸';
    clearInterval(this.timer);
    this.timer = setInterval(() => {
      if (this.index >= this.frames.length - 1) { this.pause(); return; }
      this.go(this.index + 1);
    }, STEP_MS);
  }

  pause() {
    this.playing = false;
    this.playBtn.textContent = '▶';
    clearInterval(this.timer);
  }

  showMatmul(A, B, C, nameA, nameB) {
    const [rows, inner] = dims(A);
    const cols = dims(B)[1];
    const frames = [{
      html: matmulHtml(A, B, C, nameA, nameB, { row: -1, col: -1, filled: 0 }),
      caption: `Each entry of the product is a dot product: <b>row of ${nameA}</b> · <b>column of ${nameB}</b>.`,
    }];
    let filled = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        filled++;
        const terms = [];
        for (let k = 0; k < inner; k++) terms.push(`(${fmt(A[i][k])})(${fmt(B[k][j])})`);
        frames.push({
          html: matmulHtml(A, B, C, nameA, nameB, { row: i, col: j, filled }),
          caption: `<b>entry (${i + 1}, ${j + 1})</b> = ${terms.join(' + ')} = <b>${fmt(C[i][j])}</b>`,
        });
      }
    }
    this.setFrames(frames);
  }

  showRowOps(original, steps, name) {
    const frames = [{
      html: rowOpsHtml(original, [], name),
      caption: steps.length
        ? `Reducing <b>${name}</b> to reduced row-echelon form with elementary row operations.`
        : `<b>${name}</b> is already in reduced row-echelon form.`,
    }];
    steps.forEach((s, idx) => {
      frames.push({
        html: rowOpsHtml(s.after, s.rows, ''),
        caption: `<b>Step ${idx + 1} of ${steps.length}:</b> ${s.desc}`,
      });
    });
    this.setFrames(frames);
  }
}

function tableHtml(m, cellClass = () => '', cellText = null) {
  const rows = m
    .map((row, i) =>
      `<tr>${row.map((x, j) => `<td class="${cellClass(i, j)}">${cellText ? cellText(i, j) : fmt(x)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="mat">${rows}</table>`;
}

function matmulHtml(A, B, C, nameA, nameB, { row, col, filled }) {
  const cols = C[0].length;
  const a = tableHtml(A, (i) => (i === row ? 'hl-row' : ''));
  const b = tableHtml(B, (_, j) => (j === col ? 'hl-col' : ''));
  const c = tableHtml(
    C,
    (i, j) => (i === row && j === col ? 'hl-cell' : ''),
    (i, j) => (i * cols + j < filled ? fmt(C[i][j]) : '·'),
  );
  return `<div class="matmul">
    <div class="mat-block"><div class="mat-name">${nameA}</div>${a}</div>
    <span class="mat-op">×</span>
    <div class="mat-block"><div class="mat-name">${nameB}</div>${b}</div>
    <span class="mat-op">=</span>
    <div class="mat-block"><div class="mat-name">${nameA}·${nameB}</div>${c}</div>
  </div>`;
}

function rowOpsHtml(m, hlRows, name) {
  const t = tableHtml(m, (i) => (hlRows.includes(i) ? 'hl-row' : ''));
  return `<div class="matmul"><div class="mat-block">${name ? `<div class="mat-name">${name}</div>` : ''}${t}</div></div>`;
}
