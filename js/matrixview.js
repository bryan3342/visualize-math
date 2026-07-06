// Matrix view: the actual matrices of the expression, with color-coded,
// step-by-step operation animations that play from start to finish.

import { dims, fmt, multiply } from './matrix.js';

const STEP_MS = 2800;
const SUB = ['₀', '₁', '₂', '₃'];

export class MatrixView {
  constructor(root) {
    this.root = root;
    this.frames = [];
    this.index = 0;
    this.timer = 0;
    this.playing = false;
    root.innerHTML = `
      <div class="mv-body">
        <div class="mv-main">
          <div class="mv-stage"></div>
          <div class="mv-caption"></div>
          <div class="mv-legend"></div>
        </div>
        <aside class="mv-timeline" hidden>
          <div class="mv-timeline-title">Steps</div>
          <ol class="mv-list"></ol>
        </aside>
      </div>
      <div class="mv-controls" hidden>
        <button data-act="first" title="Back to start">⏮</button>
        <button data-act="prev" title="Previous step">‹</button>
        <button data-act="play" title="Play / pause">▶</button>
        <button data-act="next" title="Next step">›</button>
        <button data-act="last" title="Jump to end">⏭</button>
        <span class="mv-counter"></span>
      </div>
      <div class="mv-empty">Run an expression to see the actual matrices with a color-coded, step-by-step breakdown.</div>`;
    this.stage = root.querySelector('.mv-stage');
    this.caption = root.querySelector('.mv-caption');
    this.legend = root.querySelector('.mv-legend');
    this.timeline = root.querySelector('.mv-timeline');
    this.listEl = root.querySelector('.mv-list');
    this.controlsEl = root.querySelector('.mv-controls');
    this.counter = root.querySelector('.mv-counter');
    this.emptyEl = root.querySelector('.mv-empty');
    this.playBtn = root.querySelector('[data-act="play"]');
    const on = (act, fn) => root.querySelector(`[data-act="${act}"]`).addEventListener('click', fn);
    on('first', () => this.go(0, true));
    on('prev', () => this.go(this.index - 1, true));
    on('next', () => this.go(this.index + 1, true));
    on('last', () => this.go(this.frames.length - 1, true));
    on('play', () => (this.playing ? this.pause() : this.play()));
  }

  clear() {
    this.pause();
    this.frames = [];
    this.stage.innerHTML = '';
    this.caption.innerHTML = '';
    this.legend.innerHTML = '';
    this.counter.textContent = '';
    this.emptyEl.hidden = false;
    this.controlsEl.hidden = true;
    this.timeline.hidden = true;
  }

  setFrames(frames, legendItems = []) {
    this.pause();
    this.frames = frames;
    this.emptyEl.hidden = true;
    const multi = frames.length > 1;
    this.controlsEl.hidden = !multi;
    this.timeline.hidden = !multi;
    this.legend.innerHTML = legendItems
      .map(({ cls, label }) => `<span class="legend-item"><i class="sw ${cls}"></i>${label}</span>`)
      .join('');
    this.listEl.innerHTML = frames
      .map((f, i) => `<li><button data-i="${i}"><span class="mv-num">${i + 1}</span>${f.short}</button></li>`)
      .join('');
    this.listEl.querySelectorAll('button').forEach((b) =>
      b.addEventListener('click', () => this.go(Number(b.dataset.i), true)),
    );
    this.go(0);
    if (multi) this.play();
  }

  go(i, manual = false) {
    if (!this.frames.length) return;
    if (manual) this.pause();
    this.index = Math.max(0, Math.min(this.frames.length - 1, i));
    const frame = this.frames[this.index];
    this.applyFrame(frame.html);
    this.caption.innerHTML = frame.caption ?? '';
    this.caption.animate([{ opacity: 0.15 }, { opacity: 1 }], { duration: 450, easing: 'ease-out' });
    this.counter.textContent = `${this.index + 1} / ${this.frames.length}`;
    this.listEl.querySelectorAll('li').forEach((li, j) => li.classList.toggle('active', j === this.index));
    const active = this.listEl.querySelector('li.active');
    if (active) active.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // Morph the existing tables in place when the frame shares the current structure,
  // so highlight colors glide via CSS transitions instead of the DOM being replaced.
  applyFrame(html) {
    const next = document.createElement('div');
    next.innerHTML = html;
    if (sameShape(this.stage, next)) morphInto(this.stage, next);
    else this.stage.innerHTML = html;
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

  // A single static frame: "here is the equation / result", no steps.
  showEquation(parts, caption = '') {
    this.setFrames([{ html: equationHtml(parts), caption, short: 'Result' }]);
  }

  showMatmul(A, B, C, nameA, nameB) {
    const [rows, inner] = dims(A);
    const cols = dims(B)[1];
    const frame = (row, col, filled) => equationHtml([
      { m: A, name: nameA, cellClass: (i) => (i === row ? 'hl-a' : '') },
      { op: '×' },
      { m: B, name: nameB, cellClass: (_, j) => (j === col ? 'hl-b' : '') },
      { op: '=' },
      {
        m: C,
        name: `${nameA}·${nameB}`,
        cellClass: (i, j) => (i === row && j === col ? 'hl-c' : ''),
        cellText: (i, j) => (i * cols + j < filled ? fmt(C[i][j]) : '·'),
      },
    ]);
    const frames = [{
      html: frame(-1, -1, 0),
      caption: `Each entry of <b>${nameA}·${nameB}</b> is a dot product: <i class="tm-a">row i of ${nameA}</i> · <i class="tm-b">column j of ${nameB}</i>.`,
      short: 'Start',
    }];
    let filled = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        filled++;
        const terms = [];
        for (let k = 0; k < inner; k++) {
          terms.push(`<i class="tm-a">(${fmt(A[i][k])})</i><i class="tm-b">(${fmt(B[k][j])})</i>`);
        }
        frames.push({
          html: frame(i, j, filled),
          caption: `entry (${i + 1}, ${j + 1}) = ${terms.join(' + ')} = <b class="tm-c">${fmt(C[i][j])}</b>`,
          short: `entry (${i + 1}, ${j + 1})`,
        });
      }
    }
    frames.push({
      html: frame(-1, -1, rows * cols),
      caption: `Done — all ${rows * cols} entries of <b>${nameA}·${nameB}</b> computed.`,
      short: 'Done',
    });
    this.setFrames(frames, [
      { cls: 'hl-a', label: `row of ${nameA}` },
      { cls: 'hl-b', label: `column of ${nameB}` },
      { cls: 'hl-c', label: 'entry being computed' },
    ]);
  }

  showElementwise(A, B, C, opChar, nameA, nameB) {
    const [rows, cols] = dims(A);
    const frame = (r, c, filled) => equationHtml([
      { m: A, name: nameA, cellClass: (i, j) => (i === r && j === c ? 'hl-a' : '') },
      { op: opChar },
      { m: B, name: nameB, cellClass: (i, j) => (i === r && j === c ? 'hl-b' : '') },
      { op: '=' },
      {
        m: C,
        name: 'result',
        cellClass: (i, j) => (i === r && j === c ? 'hl-c' : ''),
        cellText: (i, j) => (i * cols + j < filled ? fmt(C[i][j]) : '·'),
      },
    ]);
    const frames = [{
      html: frame(-1, -1, 0),
      caption: `Matrix ${opChar === '+' ? 'addition' : 'subtraction'} works entry by entry: matching positions combine.`,
      short: 'Start',
    }];
    let filled = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        filled++;
        frames.push({
          html: frame(i, j, filled),
          caption: `entry (${i + 1}, ${j + 1}): <i class="tm-a">${fmt(A[i][j])}</i> ${opChar} <i class="tm-b">${fmt(B[i][j])}</i> = <b class="tm-c">${fmt(C[i][j])}</b>`,
          short: `entry (${i + 1}, ${j + 1})`,
        });
      }
    }
    frames.push({ html: frame(-1, -1, rows * cols), caption: 'Done — every entry combined.', short: 'Done' });
    this.setFrames(frames, [
      { cls: 'hl-a', label: `entry of ${nameA}` },
      { cls: 'hl-b', label: `entry of ${nameB}` },
      { cls: 'hl-c', label: 'result entry' },
    ]);
  }

  showScalar(k, A, C, nameA) {
    const [rows, cols] = dims(A);
    const frame = (r, c, filled) => equationHtml([
      { scalar: k, cls: r >= 0 ? 'hl-a-text' : '' },
      { op: '×' },
      { m: A, name: nameA, cellClass: (i, j) => (i === r && j === c ? 'hl-b' : '') },
      { op: '=' },
      {
        m: C,
        name: 'result',
        cellClass: (i, j) => (i === r && j === c ? 'hl-c' : ''),
        cellText: (i, j) => (i * cols + j < filled ? fmt(C[i][j]) : '·'),
      },
    ]);
    const frames = [{
      html: frame(-1, -1, 0),
      caption: `Scalar multiplication scales <b>every</b> entry of ${nameA} by ${fmt(k)}.`,
      short: 'Start',
    }];
    let filled = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        filled++;
        frames.push({
          html: frame(i, j, filled),
          caption: `entry (${i + 1}, ${j + 1}): <i class="tm-a">${fmt(k)}</i> × <i class="tm-b">${fmt(A[i][j])}</i> = <b class="tm-c">${fmt(C[i][j])}</b>`,
          short: `entry (${i + 1}, ${j + 1})`,
        });
      }
    }
    frames.push({ html: frame(-1, -1, rows * cols), caption: 'Done — every entry scaled.', short: 'Done' });
    this.setFrames(frames, [
      { cls: 'hl-b', label: `entry of ${nameA}` },
      { cls: 'hl-c', label: 'scaled entry' },
    ]);
  }

  showTranspose(A, C, nameA) {
    const [rows, cols] = dims(A);
    // C[i][j] = A[j][i]; an A-cell (r,c) has fill-order index r*cols + c.
    const frame = (r, c, filled) => equationHtml([
      { m: A, name: nameA, cellClass: (i, j) => (i === r && j === c ? 'hl-a' : '') },
      { op: '→' },
      {
        m: C,
        name: `${nameA}ᵀ`,
        cellClass: (i, j) => (i === c && j === r ? 'hl-c' : ''),
        cellText: (i, j) => (j * cols + i < filled ? fmt(C[i][j]) : '·'),
      },
    ]);
    const frames = [{
      html: frame(-1, -1, 0),
      caption: `Transposing flips ${nameA} across its main diagonal: row i becomes column i.`,
      short: 'Start',
    }];
    let filled = 0;
    for (let i = 0; i < rows; i++) {
      for (let j = 0; j < cols; j++) {
        filled++;
        frames.push({
          html: frame(i, j, filled),
          caption: `<i class="tm-a">entry (${i + 1}, ${j + 1})</i> of ${nameA} moves to <b class="tm-c">entry (${j + 1}, ${i + 1})</b> of ${nameA}ᵀ${i === j ? ' — diagonal entries stay put' : ''}`,
          short: `(${i + 1},${j + 1}) → (${j + 1},${i + 1})`,
        });
      }
    }
    frames.push({ html: frame(-1, -1, rows * cols), caption: 'Done — rows and columns swapped.', short: 'Done' });
    this.setFrames(frames, [
      { cls: 'hl-a', label: `entry of ${nameA}` },
      { cls: 'hl-c', label: 'its new position' },
    ]);
  }

  showRowOps(original, steps, name) {
    const frames = [{
      html: equationHtml([{ m: original, name }]),
      caption: steps.length
        ? `Reduce <b>${name}</b> to reduced row-echelon form using the three elementary row operations: swap, scale, and add a multiple of one row to another.`
        : `<b>${name}</b> is already in reduced row-echelon form.`,
      short: 'Start',
    }];
    steps.forEach((s, idx) => {
      const cellClass = (i, j) => {
        const cls = [];
        if (s.type === 'add') {
          if (i === s.target) cls.push('hl-target');
          if (i === s.source) cls.push('hl-source');
        } else if (s.rows.includes(i)) {
          cls.push('hl-target');
        }
        if (i === s.pivotAt[0] && j === s.pivotAt[1]) cls.push('hl-pivot');
        return cls.join(' ');
      };
      frames.push({
        html: equationHtml([{ m: s.after, name: `after step ${idx + 1}` , cellClass }]),
        caption: `<b>${s.desc}</b> — ${explainRowOp(s)}`,
        short: s.desc,
      });
    });
    if (steps.length) {
      frames.push({
        html: equationHtml([{ m: steps[steps.length - 1].after, name: `rref(${name})` }]),
        caption: `Done — <b>${name}</b> is in reduced row-echelon form: every pivot is 1 and is the only nonzero entry in its column.`,
        short: 'Done',
      });
    }
    this.setFrames(frames, [
      { cls: 'hl-target', label: 'row being changed' },
      { cls: 'hl-source', label: 'pivot row used' },
      { cls: 'hl-pivot', label: 'pivot entry' },
    ]);
  }

  showEigen(m, e, name) {
    if (e.complex) {
      this.setFrames([{
        html: equationHtml([{ m, name }]),
        caption: `λ = ${fmt(e.re)} ± ${fmt(e.im)}i — <b>complex eigenvalues</b>: ${name} rotates every vector off its own span, so there are no real eigenvectors.`,
        short: 'Result',
      }]);
      return;
    }
    const list = e.vectors.map((v, i) =>
      `λ${SUB[i + 1]} = <b>${fmt(e.values[i])}</b> with eigenvector [${fmt(v[0])}, ${fmt(v[1])}]`).join(' · ');
    const note = e.allVectors
      ? ` — ${name} = λ·I, so every vector is an eigenvector.`
      : e.defective
        ? ' — repeated eigenvalue with a single eigenvector direction (defective matrix).'
        : '';
    const frames = [{
      html: equationHtml([{ m, name }]),
      caption: `${list}${note}`,
      short: 'Overview',
    }];
    e.vectors.forEach((v, i) => {
      const col = [[v[0]], [v[1]]];
      const Av = multiply(m, col);
      frames.push({
        html: equationHtml([
          { m, name },
          { op: '×' },
          { m: col, name: `v${SUB[i + 1]}`, cellClass: () => 'hl-b' },
          { op: '=' },
          { m: Av, name: `${name}·v${SUB[i + 1]}`, cellClass: () => 'hl-c' },
        ]),
        caption: `${name}·v${SUB[i + 1]} = [${fmt(Av[0][0])}, ${fmt(Av[1][0])}] = <b class="tm-c">${fmt(e.values[i])}</b> · [${fmt(v[0])}, ${fmt(v[1])}] — same direction, only the length scales by λ${SUB[i + 1]}.`,
        short: `check ${name}·v${SUB[i + 1]}`,
      });
    });
    this.setFrames(frames, [
      { cls: 'hl-b', label: 'eigenvector' },
      { cls: 'hl-c', label: `${name}·v — the scaled eigenvector` },
    ]);
  }

  showDet2(m, name, value) {
    const [[a, b], [c, d]] = m;
    const frame = (cellClass) => equationHtml([{ m, name: `det(${name})`, cellClass }]);
    this.setFrames([
      {
        html: frame(),
        caption: 'For a 2×2 matrix, det = a·d − b·c — the signed factor by which areas scale.',
        short: 'Start',
      },
      {
        html: frame((i, j) => (i === j ? 'hl-a' : '')),
        caption: `main diagonal: <i class="tm-a">a·d = (${fmt(a)})(${fmt(d)})</i> = ${fmt(a * d)}`,
        short: 'a·d',
      },
      {
        html: frame((i, j) => (i !== j ? 'hl-b' : '')),
        caption: `anti-diagonal: <i class="tm-b">b·c = (${fmt(b)})(${fmt(c)})</i> = ${fmt(b * c)}`,
        short: 'b·c',
      },
      {
        html: frame(),
        caption: `det(${name}) = ${fmt(a * d)} − ${fmt(b * c)} = <b class="tm-c">${fmt(value)}</b> — the unit square's area scales by |${fmt(value)}| (see the Graph tab).`,
        short: 'Done',
      },
    ], [
      { cls: 'hl-a', label: 'main diagonal (a·d)' },
      { cls: 'hl-b', label: 'anti-diagonal (b·c)' },
    ]);
  }
}

function tableHtml(m, cellClass = () => '', cellText = null) {
  const rows = m
    .map((row, i) =>
      `<tr>${row.map((x, j) => `<td class="${cellClass(i, j)}">${cellText ? cellText(i, j) : fmt(x)}</td>`).join('')}</tr>`)
    .join('');
  return `<table class="mat">${rows}</table>`;
}

export function equationHtml(parts) {
  const bits = parts.map((p) => {
    if (p.op !== undefined) return `<span class="mat-op">${p.op}</span>`;
    if (p.scalar !== undefined) {
      return `<div class="mat-block">${p.name ? `<div class="mat-name">${p.name}</div>` : ''}<div class="mv-scalar ${p.cls ?? ''}">${fmt(p.scalar)}</div></div>`;
    }
    return `<div class="mat-block">${p.name ? `<div class="mat-name">${p.name}</div>` : ''}${tableHtml(p.m, p.cellClass, p.cellText)}</div>`;
  });
  return `<div class="matmul">${bits.join('')}</div>`;
}

function sameShape(cur, next) {
  const shape = (root) => ({
    tables: [...root.querySelectorAll('table.mat')].map((t) => t.querySelectorAll('td').length),
    ops: root.querySelectorAll('.mat-op').length,
    names: root.querySelectorAll('.mat-name').length,
    scalars: root.querySelectorAll('.mv-scalar').length,
  });
  const a = shape(cur);
  const b = shape(next);
  return a.tables.length > 0
    && a.tables.length === b.tables.length
    && a.tables.every((n, i) => n === b.tables[i])
    && a.ops === b.ops && a.names === b.names && a.scalars === b.scalars;
}

function morphInto(cur, next) {
  const zip = (sel, fn) => {
    const a = cur.querySelectorAll(sel);
    const b = next.querySelectorAll(sel);
    a.forEach((el, i) => fn(el, b[i]));
  };
  zip('td', (el, to) => {
    if (el.className !== to.className) el.className = to.className;
    if (el.textContent !== to.textContent) {
      el.textContent = to.textContent;
      el.animate([{ opacity: 0.1 }, { opacity: 1 }], { duration: 500, easing: 'ease-out' });
    }
  });
  zip('.mat-name', (el, to) => { if (el.textContent !== to.textContent) el.textContent = to.textContent; });
  zip('.mat-op', (el, to) => { if (el.textContent !== to.textContent) el.textContent = to.textContent; });
  zip('.mv-scalar', (el, to) => {
    if (el.className !== to.className) el.className = to.className;
    if (el.textContent !== to.textContent) el.textContent = to.textContent;
  });
}

function explainRowOp(s) {
  if (s.type === 'swap') return `swap the rows so a nonzero pivot sits in row ${s.pivotAt[0] + 1}.`;
  if (s.type === 'scale') return `scale row ${s.rows[0] + 1} so the pivot in column ${s.pivotAt[1] + 1} becomes 1.`;
  return `add a multiple of pivot row ${s.source + 1} to row ${s.target + 1} to zero out its entry in column ${s.pivotAt[1] + 1}.`;
}
