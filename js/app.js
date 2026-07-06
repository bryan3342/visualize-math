/* ============================================================================
 * visualize-math — single-file app.
 * One file so GitHub Pages can never serve version-skewed modules; index.html
 * loads it with a ?v= query that must be bumped on each deploy.
 * Sections: engine · parser · matrix view · objects panel · app wiring.
 * ========================================================================== */

/* ================================ engine ================================= */
/* Matrices are plain number[][]; vectors are n×1 matrices. */

export const EPS = 1e-9;

export function dims(m) {
  return [m.length, m[0].length];
}

export function clone(m) {
  return m.map((row) => row.slice());
}

export function identity(n) {
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  );
}

function assertSquare(m, what) {
  const [r, c] = dims(m);
  if (r !== c) throw new Error(`${what} needs a square matrix (got ${r}×${c})`);
}

function assertSameDims(a, b, what) {
  const [ar, ac] = dims(a);
  const [br, bc] = dims(b);
  if (ar !== br || ac !== bc) throw new Error(`Cannot ${what} a ${ar}×${ac} and a ${br}×${bc}`);
}

export function add(a, b) {
  assertSameDims(a, b, 'add');
  return a.map((row, i) => row.map((x, j) => x + b[i][j]));
}

export function sub(a, b) {
  assertSameDims(a, b, 'subtract');
  return a.map((row, i) => row.map((x, j) => x - b[i][j]));
}

export function scale(m, k) {
  return m.map((row) => row.map((x) => x * k));
}

export function multiply(a, b) {
  const [ar, ac] = dims(a);
  const [br, bc] = dims(b);
  if (ac !== br) {
    throw new Error(`Cannot multiply a ${ar}×${ac} by a ${br}×${bc}: inner dimensions must match`);
  }
  const out = [];
  for (let i = 0; i < ar; i++) {
    const row = [];
    for (let j = 0; j < bc; j++) {
      let s = 0;
      for (let k = 0; k < ac; k++) s += a[i][k] * b[k][j];
      row.push(s);
    }
    out.push(row);
  }
  return out;
}

export function transpose(m) {
  const [r, c] = dims(m);
  return Array.from({ length: c }, (_, j) => Array.from({ length: r }, (_, i) => m[i][j]));
}

export function det(m) {
  assertSquare(m, 'det');
  const n = m.length;
  const a = clone(m);
  let result = 1;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[pivot][col])) pivot = r;
    if (Math.abs(a[pivot][col]) < EPS) return 0;
    if (pivot !== col) {
      [a[pivot], a[col]] = [a[col], a[pivot]];
      result = -result;
    }
    result *= a[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = a[r][col] / a[col][col];
      for (let j = col; j < n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return result;
}

export function inverse(m) {
  assertSquare(m, 'inv');
  const n = m.length;
  const I = identity(n);
  const a = m.map((row, i) => [...row, ...I[i]]);
  for (let col = 0; col < n; col++) {
    let best = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(a[r][col]) > Math.abs(a[best][col])) best = r;
    if (Math.abs(a[best][col]) < EPS) throw new Error('Matrix is singular — it has no inverse');
    [a[best], a[col]] = [a[col], a[best]];
    const p = a[col][col];
    for (let j = 0; j < 2 * n; j++) a[col][j] /= p;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = a[r][col];
      if (Math.abs(f) < EPS) continue;
      for (let j = 0; j < 2 * n; j++) a[r][j] -= f * a[col][j];
    }
  }
  return a.map((row) => row.slice(n));
}

export function matPow(m, p) {
  assertSquare(m, '^');
  if (!Number.isInteger(p)) throw new Error('Matrix exponents must be integers');
  if (p < 0) return matPow(inverse(m), -p);
  let out = identity(m.length);
  for (let i = 0; i < p; i++) out = multiply(out, m);
  return out;
}

// Reduce to RREF, recording every elementary row operation with a snapshot.
export function rrefSteps(input) {
  const m = clone(input);
  const [rows, cols] = dims(m);
  const steps = [];
  let pivotRow = 0;
  for (let col = 0; col < cols && pivotRow < rows; col++) {
    let pivot = -1;
    for (let r = pivotRow; r < rows; r++) {
      if (Math.abs(m[r][col]) > EPS) { pivot = r; break; }
    }
    if (pivot === -1) continue;
    if (pivot !== pivotRow) {
      [m[pivot], m[pivotRow]] = [m[pivotRow], m[pivot]];
      steps.push({ type: 'swap', rows: [pivotRow, pivot], pivotAt: [pivotRow, col], desc: `R${pivotRow + 1} ↔ R${pivot + 1}`, after: clone(m) });
    }
    const p = m[pivotRow][col];
    if (Math.abs(p - 1) > EPS) {
      for (let j = 0; j < cols; j++) m[pivotRow][j] /= p;
      tidyRow(m[pivotRow]);
      steps.push({ type: 'scale', rows: [pivotRow], pivotAt: [pivotRow, col], desc: `R${pivotRow + 1} ← ${fmt(1 / p)}·R${pivotRow + 1}`, after: clone(m) });
    }
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const f = m[r][col];
      if (Math.abs(f) < EPS) continue;
      for (let j = 0; j < cols; j++) m[r][j] -= f * m[pivotRow][j];
      tidyRow(m[r]);
      const sign = f > 0 ? '−' : '+';
      steps.push({ type: 'add', rows: [r, pivotRow], target: r, source: pivotRow, pivotAt: [pivotRow, col], desc: `R${r + 1} ← R${r + 1} ${sign} ${fmt(Math.abs(f))}·R${pivotRow + 1}`, after: clone(m) });
    }
    pivotRow++;
  }
  return { result: m, steps };
}

function tidyRow(row) {
  for (let j = 0; j < row.length; j++) {
    if (Math.abs(row[j]) < EPS) row[j] = 0;
  }
}

// Eigenvalues/eigenvectors of a 2×2 via the characteristic polynomial.
export function eigen2x2(m) {
  const [[a, b], [c, d]] = m;
  const tr = a + d;
  const dt = a * d - b * c;
  const disc = tr * tr - 4 * dt;
  if (disc < -EPS) {
    return { complex: true, re: tr / 2, im: Math.sqrt(-disc) / 2 };
  }
  const s = Math.sqrt(Math.max(disc, 0));
  const l1 = (tr + s) / 2;
  const l2 = (tr - s) / 2;
  const vecFor = (l) => {
    if (Math.abs(b) > EPS) return [b, l - a];
    if (Math.abs(c) > EPS) return [l - d, c];
    return Math.abs(a - l) < EPS ? [1, 0] : [0, 1];
  };
  if (Math.abs(l1 - l2) < EPS) {
    const scalarMultipleOfI = Math.abs(b) < EPS && Math.abs(c) < EPS && Math.abs(a - d) < EPS;
    if (scalarMultipleOfI) {
      return { complex: false, values: [l1, l2], vectors: [[1, 0], [0, 1]], repeated: true, allVectors: true };
    }
    return { complex: false, values: [l1, l2], vectors: [vecFor(l1)], repeated: true, defective: true };
  }
  return { complex: false, values: [l1, l2], vectors: [vecFor(l1), vecFor(l2)], repeated: false };
}

export function fmt(n) {
  if (!Number.isFinite(n)) return String(n);
  if (Math.abs(n) < EPS) return '0';
  return String(parseFloat(n.toFixed(4)));
}

/* ================================ parser ================================= */
/* Values are { k: 'num', v } or { k: 'mat', m }. */

const FUNCTIONS = new Set(['det', 'inv', 'trans', 'rref', 'eig']);

export function parse(src) {
  const toks = tokenize(src);
  let pos = 0;
  const peek = () => toks[pos];
  const next = () => toks[pos++];
  const expect = (t) => {
    const tok = next();
    if (!tok || tok.t !== t) throw new Error(`Expected '${t}'${tok ? ` but found '${tok.v ?? tok.t}'` : ''}`);
    return tok;
  };

  const startsFactor = (tok) => tok && (tok.t === 'num' || tok.t === 'name' || tok.t === '(' || tok.t === '[');

  function parseExpr() {
    let node = parseTerm();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = next().t;
      node = { t: 'bin', op, l: node, r: parseTerm() };
    }
    return node;
  }

  function parseTerm() {
    let node = parseUnary();
    while (peek() && (peek().t === '*' || peek().t === '/' || startsFactor(peek()))) {
      const op = peek().t === '*' || peek().t === '/' ? next().t : '*';
      node = { t: 'bin', op, l: node, r: parseUnary() };
    }
    return node;
  }

  function parseUnary() {
    if (peek() && peek().t === '-') {
      next();
      return { t: 'neg', e: parseUnary() };
    }
    return parsePow();
  }

  function parsePow() {
    const base = parseAtom();
    if (peek() && peek().t === '^') {
      next();
      return { t: 'bin', op: '^', l: base, r: parseUnary() };
    }
    return base;
  }

  function parseAtom() {
    const tok = next();
    if (!tok) throw new Error('Unexpected end of expression');
    if (tok.t === 'num') return { t: 'num', v: tok.v };
    if (tok.t === 'name') {
      if (FUNCTIONS.has(tok.v) && peek() && peek().t === '(') {
        next();
        const arg = parseExpr();
        expect(')');
        return { t: 'call', fn: tok.v, args: [arg] };
      }
      return { t: 'name', id: tok.v };
    }
    if (tok.t === '(') {
      const node = parseExpr();
      expect(')');
      return node;
    }
    if (tok.t === '[') {
      // MATLAB-style literal: spaces/commas between entries, ';' between rows.
      const rows = [[]];
      for (;;) {
        const p = peek();
        if (!p) throw new Error("Missing ']' to close the matrix");
        if (p.t === ']') { next(); break; }
        if (p.t === ';') { next(); rows.push([]); continue; }
        if (p.t === ',') { next(); continue; }
        rows[rows.length - 1].push(parseUnary());
      }
      if (rows.length > 1 && rows[rows.length - 1].length === 0) rows.pop();
      if (rows.some((r) => r.length === 0)) throw new Error('Matrix literal has an empty row');
      if (rows.some((r) => r.length !== rows[0].length)) throw new Error('Matrix literal rows must all have the same length');
      return { t: 'lit', rows };
    }
    throw new Error(`Unexpected '${tok.v ?? tok.t}'`);
  }

  const ast = parseExpr();
  if (pos < toks.length) {
    const tok = toks[pos];
    throw new Error(`Unexpected '${tok.v ?? tok.t}' after the expression`);
  }
  return ast;
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (/\s/.test(ch)) { i++; continue; }
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      const text = src.slice(i, j);
      const v = Number(text);
      if (!Number.isFinite(v)) throw new Error(`Invalid number '${text}'`);
      toks.push({ t: 'num', v });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      toks.push({ t: 'name', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/^()[];,'.includes(ch)) {
      toks.push({ t: ch });
      i++;
      continue;
    }
    throw new Error(`Unexpected character '${ch}'`);
  }
  return toks;
}

export function evaluate(ast, env) {
  switch (ast.t) {
    case 'num':
      return { k: 'num', v: ast.v };
    case 'name': {
      const m = env.get(ast.id);
      if (!m) throw new Error(`Unknown name '${ast.id}' — define it in the left panel`);
      return { k: 'mat', m };
    }
    case 'neg': {
      const val = evaluate(ast.e, env);
      return val.k === 'num' ? { k: 'num', v: -val.v } : { k: 'mat', m: scale(val.m, -1) };
    }
    case 'lit': {
      const m = ast.rows.map((row) => row.map((el) => {
        const v = evaluate(el, env);
        if (v.k !== 'num') throw new Error('Matrix literal entries must be numbers');
        return v.v;
      }));
      return { k: 'mat', m };
    }
    case 'bin':
      return evalBin(ast, env);
    case 'call':
      return evalCall(ast, env);
    default:
      throw new Error('Malformed expression');
  }
}

function evalBin(ast, env) {
  if (ast.op === '^') {
    const base = evaluate(ast.l, env);
    const exp = evaluate(ast.r, env);
    if (exp.k !== 'num') throw new Error('Exponents must be scalars');
    if (base.k === 'num') return { k: 'num', v: base.v ** exp.v };
    return { k: 'mat', m: matPow(base.m, exp.v) };
  }
  const L = evaluate(ast.l, env);
  const R = evaluate(ast.r, env);
  switch (ast.op) {
    case '+':
    case '-': {
      if (L.k === 'num' && R.k === 'num') return { k: 'num', v: ast.op === '+' ? L.v + R.v : L.v - R.v };
      if (L.k === 'mat' && R.k === 'mat') return { k: 'mat', m: ast.op === '+' ? add(L.m, R.m) : sub(L.m, R.m) };
      throw new Error(`Cannot ${ast.op === '+' ? 'add' : 'subtract'} a scalar and a matrix`);
    }
    case '*': {
      if (L.k === 'num' && R.k === 'num') return { k: 'num', v: L.v * R.v };
      if (L.k === 'num') return { k: 'mat', m: scale(R.m, L.v) };
      if (R.k === 'num') return { k: 'mat', m: scale(L.m, R.v) };
      return { k: 'mat', m: multiply(L.m, R.m) };
    }
    case '/': {
      if (R.k !== 'num') throw new Error('Can only divide by a scalar');
      if (Math.abs(R.v) < 1e-12) throw new Error('Division by zero');
      return L.k === 'num' ? { k: 'num', v: L.v / R.v } : { k: 'mat', m: scale(L.m, 1 / R.v) };
    }
    default:
      throw new Error(`Unknown operator '${ast.op}'`);
  }
}

function evalCall(ast, env) {
  if (ast.fn === 'eig') {
    throw new Error('eig(…) is a visualization — run it as the whole expression, e.g. eig(A)');
  }
  const arg = evaluate(ast.args[0], env);
  if (arg.k !== 'mat') throw new Error(`${ast.fn}(…) expects a matrix`);
  switch (ast.fn) {
    case 'det': return { k: 'num', v: det(arg.m) };
    case 'inv': return { k: 'mat', m: inverse(arg.m) };
    case 'trans': return { k: 'mat', m: transpose(arg.m) };
    case 'rref': return { k: 'mat', m: rrefSteps(arg.m).result };
    default: throw new Error(`Unknown function '${ast.fn}'`);
  }
}

// The flat factor list when the whole expression is a pure '*' chain, else null.
export function flattenProduct(ast) {
  if (!(ast.t === 'bin' && ast.op === '*')) return null;
  const factors = [];
  (function walk(node) {
    if (node.t === 'bin' && node.op === '*') { walk(node.l); walk(node.r); }
    else factors.push(node);
  })(ast);
  return factors;
}

export function factorLabel(node) {
  if (node.t === 'name') return node.id;
  if (node.t === 'num') return String(node.v);
  if (node.t === 'call') {
    const arg = node.args[0];
    return `${node.fn}(${arg.t === 'name' ? arg.id : '…'})`;
  }
  return null;
}

/* ============================== matrix view ============================== */
/* Color-coded, step-by-step operation animations that play start to finish. */

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
      <div class="mv-empty">Define objects on the left, type an expression, and press Go — the steps play out here.</div>`;
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
        html: equationHtml([{ m: s.after, name: `after step ${idx + 1}`, cellClass }]),
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
        caption: `det(${name}) = ${fmt(a * d)} − ${fmt(b * c)} = <b class="tm-c">${fmt(value)}</b> — areas scale by a factor of |${fmt(value)}|.`,
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

/* ============================= objects panel ============================= */

const MATRIX_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'K', 'L', 'M', 'N', 'P', 'Q', 'R', 'S'];
const VECTOR_NAMES = ['v', 'w', 'u', 'p', 'q', 'r', 's', 't'];

export class ObjectsPanel {
  constructor(root, onChange) {
    this.root = root;
    this.onChange = onChange;
    this.objects = [];
    root.innerHTML = `
      <div class="objects-list"></div>
      <div class="objects-add">
        <div class="add-row">
          <button class="add-matrix">+ Matrix</button>
          <select class="add-rows">${sizeOpts(1, 6, 2)}</select><span class="dim-sep">×</span><select class="add-cols">${sizeOpts(1, 6, 2)}</select>
        </div>
        <div class="add-row">
          <button class="add-vector">+ Vector</button>
          <select class="add-dim">${sizeOpts(2, 6, 2)}</select><span class="dim-sep">entries</span>
        </div>
      </div>`;
    this.list = root.querySelector('.objects-list');
    root.querySelector('.add-matrix').addEventListener('click', () => {
      this.add('matrix', Number(root.querySelector('.add-rows').value), Number(root.querySelector('.add-cols').value));
    });
    root.querySelector('.add-vector').addEventListener('click', () => {
      this.add('vector', Number(root.querySelector('.add-dim').value), 1);
    });
  }

  seed() {
    this.objects.push(
      { name: 'A', data: [[2, 1], [1, 2]] },
      { name: 'B', data: [[0, -1], [1, 0]] },
      { name: 'v', data: [[2], [1]] },
      { name: 'M', data: [[1, 2, -1], [2, 4, 1], [3, 6, 0]] },
    );
    this.render();
  }

  all() { return this.objects; }

  add(kind, rows, cols) {
    const pool = kind === 'matrix' ? MATRIX_NAMES : VECTOR_NAMES;
    const used = new Set(this.objects.map((o) => o.name));
    const name = pool.find((n) => !used.has(n));
    if (!name) return;
    const data = Array.from({ length: rows }, (_, i) =>
      Array.from({ length: cols }, (_, j) => (i === j ? 1 : 0)),
    );
    this.objects.push({ name, data });
    this.render();
    this.onChange();
  }

  remove(name) {
    this.objects = this.objects.filter((o) => o.name !== name);
    this.render();
    this.onChange();
  }

  env() {
    return new Map(this.objects.map((o) => [o.name, o.data]));
  }

  render() {
    this.list.innerHTML = '';
    for (const obj of this.objects) {
      const rows = obj.data.length;
      const cols = obj.data[0].length;
      const card = document.createElement('div');
      card.className = 'object-card';
      card.innerHTML = `
        <div class="object-head">
          <span class="object-name">${obj.name}</span>
          <span class="object-dims">${cols === 1 ? `ℝ${sup(rows)}` : `${rows}×${cols}`}</span>
          <button class="object-del" title="Delete ${obj.name}">×</button>
        </div>
        <div class="object-grid" style="grid-template-columns: repeat(${cols}, 1fr)"></div>`;
      const grid = card.querySelector('.object-grid');
      obj.data.forEach((row, i) =>
        row.forEach((val, j) => {
          const input = document.createElement('input');
          input.type = 'text';
          input.inputMode = 'decimal';
          input.value = formatEntry(val);
          input.addEventListener('input', () => {
            const parsed = parseEntry(input.value);
            input.classList.toggle('invalid', parsed === null);
            if (parsed !== null) {
              obj.data[i][j] = parsed;
              this.onChange();
            }
          });
          grid.appendChild(input);
        }),
      );
      card.querySelector('.object-del').addEventListener('click', () => this.remove(obj.name));
      this.list.appendChild(card);
    }
  }
}

function parseEntry(text) {
  const t = text.trim();
  if (!t) return null;
  const frac = t.match(/^(-?\d+(?:\.\d+)?)\s*\/\s*(-?\d+(?:\.\d+)?)$/);
  if (frac) {
    const den = Number(frac[2]);
    return den === 0 ? null : Number(frac[1]) / den;
  }
  const v = Number(t);
  return Number.isFinite(v) ? v : null;
}

function formatEntry(v) {
  return String(parseFloat(v.toFixed(4)));
}

function sizeOpts(min, max, selected) {
  let out = '';
  for (let n = min; n <= max; n++) out += `<option ${n === selected ? 'selected' : ''}>${n}</option>`;
  return out;
}

function sup(n) {
  return { 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶' }[n] ?? `^${n}`;
}

/* ================================== app ================================== */

function initApp() {
  const $ = (sel) => document.querySelector(sel);

  let rerunTimer = 0;
  const objects = new ObjectsPanel($('#objects'), onObjectsChange);
  const board = new MatrixView($('#wb-view'));
  const exprInput = $('#expr');
  const statusEl = $('#status');
  const wbPreview = $('#wb-preview');
  const wbObjects = $('#wb-objects');
  let lastRun = '';

  $('#run').addEventListener('click', run);
  exprInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
  exprInput.addEventListener('input', updatePreview);
  document.querySelectorAll('.op-item').forEach((item) =>
    item.addEventListener('click', () => {
      exprInput.value = item.dataset.expr;
      run();
    }),
  );

  function onObjectsChange() {
    renderShelf();
    if (!wbPreview.hidden) updatePreview();
    clearTimeout(rerunTimer);
    rerunTimer = setTimeout(() => {
      if (lastRun) runExpression(lastRun, { silent: true });
    }, 350);
  }

  // Every defined object, rendered as an actual matrix on the whiteboard.
  function renderShelf() {
    const parts = objects.all().map((o) => ({ m: o.data, name: o.name }));
    wbObjects.innerHTML = parts.length
      ? `<div class="shelf-label">Objects</div>${equationHtml(parts)}`
      : '';
  }

  function updatePreview() {
    wbPreview.hidden = false;
    try {
      wbPreview.innerHTML = `<div class="shelf-label">Expression</div>${equationHtml(previewParts(parse(exprInput.value.trim()), objects.env()))}`;
    } catch {
      wbPreview.innerHTML = '';
    }
  }

  function run() {
    const src = exprInput.value.trim();
    if (src) runExpression(src, {});
  }

  function runExpression(src, { silent = false } = {}) {
    statusEl.textContent = '';
    try {
      lastRun = src;
      renderSymbolic(board, src, objects.env());
      wbPreview.hidden = true; // the animation's Start frame shows the equation
    } catch (err) {
      if (!silent) statusEl.textContent = err.message;
    }
  }

  function renderSymbolic(view, src, env) {
    const ast = parse(src);

    if (ast.t === 'call' && ast.fn === 'eig') {
      const value = evaluate(ast.args[0], env);
      if (value.k !== 'mat') throw new Error('eig(…) expects a matrix');
      const [r, c] = dims(value.m);
      if (r !== c) throw new Error(`eig needs a square matrix (got ${r}×${c})`);
      if (r !== 2) throw new Error('The eigen visualization currently supports 2×2 matrices');
      view.showEigen(value.m, eigen2x2(value.m), factorLabel(ast.args[0]) ?? 'the matrix');
      return;
    }

    if (ast.t === 'call' && ast.fn === 'rref') {
      const value = evaluate(ast.args[0], env);
      if (value.k !== 'mat') throw new Error('rref(…) expects a matrix');
      const { steps } = rrefSteps(value.m);
      view.showRowOps(value.m, steps, esc(factorLabel(ast.args[0]) ?? 'M'));
      return;
    }

    const value = evaluate(ast, env);
    const factors = readFactors(ast, env);
    buildSymbolicView(view, ast, env, value, factors, esc(src));
  }

  // Pick the richest symbolic breakdown the top-level form supports.
  function buildSymbolicView(view, ast, env, value, factors, srcT) {
    if (factors && factors.length === 2 && value.k === 'mat') {
      const [f1, f2] = factors;
      if (f1.value.k === 'mat' && f2.value.k === 'mat' && dims(f1.value.m)[1] === dims(f2.value.m)[0]) {
        view.showMatmul(f1.value.m, f2.value.m, value.m, f1.label, f2.label);
        return;
      }
      const num = f1.value.k === 'num' ? f1 : f2.value.k === 'num' ? f2 : null;
      const mat = num === f1 ? f2 : f1;
      if (num && mat.value.k === 'mat') {
        view.showScalar(num.value.v, mat.value.m, value.m, mat.label);
        return;
      }
    }
    if (ast.t === 'bin' && (ast.op === '+' || ast.op === '-') && value.k === 'mat') {
      const L = evaluate(ast.l, env);
      const R = evaluate(ast.r, env);
      if (L.k === 'mat' && R.k === 'mat') {
        view.showElementwise(
          L.m, R.m, value.m,
          ast.op === '+' ? '+' : '−',
          factorLabel(ast.l) ?? 'left', factorLabel(ast.r) ?? 'right',
        );
        return;
      }
    }
    if (ast.t === 'call' && ast.fn === 'trans') {
      const arg = evaluate(ast.args[0], env);
      if (arg.k === 'mat') {
        view.showTranspose(arg.m, value.m, factorLabel(ast.args[0]) ?? 'A');
        return;
      }
    }
    if (ast.t === 'call' && ast.fn === 'det') {
      const arg = evaluate(ast.args[0], env);
      if (arg.k === 'mat' && arg.m.length === 2 && arg.m[0].length === 2) {
        view.showDet2(arg.m, factorLabel(ast.args[0]) ?? 'A', value.v);
        return;
      }
    }
    if (factors && factors.length > 2 && value.k === 'mat') {
      const parts = [];
      factors.forEach((f, i) => {
        if (i) parts.push({ op: '×' });
        parts.push(f.value.k === 'num' ? { scalar: f.value.v } : { m: f.value.m, name: f.label });
      });
      parts.push({ op: '=' }, { m: value.m, name: 'result' });
      view.showEquation(parts, `<code>${srcT}</code> — products compose right to left.`);
      return;
    }
    view.showEquation(
      value.k === 'num' ? [{ scalar: value.v, name: `${srcT} =` }] : [{ m: value.m, name: `${srcT} =` }],
    );
  }

  function readFactors(ast, env) {
    const nodes = flattenProduct(ast);
    if (!nodes) return null;
    return nodes.map((node, i) => ({
      node,
      value: evaluate(node, env),
      label: factorLabel(node) ?? `M${i + 1}`,
    }));
  }

  // Render each top-level operand the way it was typed, without computing the result.
  function previewParts(ast, env) {
    switch (ast.t) {
      case 'num': return [{ scalar: ast.v }];
      case 'lit':
      case 'name': {
        const v = evaluate(ast, env);
        return [{ m: v.m, name: ast.t === 'name' ? ast.id : '' }];
      }
      case 'neg': return [{ op: '−' }, ...previewParts(ast.e, env)];
      case 'bin': {
        if (ast.op === '^') return [...previewParts(ast.l, env), { op: `^${expText(ast.r)}` }];
        const sym = { '*': '×', '/': '÷', '+': '+', '-': '−' }[ast.op];
        return [...previewParts(ast.l, env), { op: sym }, ...previewParts(ast.r, env)];
      }
      case 'call': return [{ op: `${ast.fn}(` }, ...previewParts(ast.args[0], env), { op: ')' }];
      default: return [{ op: '…' }];
    }
  }

  function expText(node) {
    if (node.t === 'num') return fmt(node.v);
    if (node.t === 'neg' && node.e.t === 'num') return `-${fmt(node.e.v)}`;
    return '…';
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  objects.seed();
  renderShelf();
  exprInput.value = 'A*B';
  run();
}

if (typeof document !== 'undefined' && document.getElementById('wb-view')) initApp();
