// Core linear algebra engine. Matrices are plain number[][]; vectors are n×1 matrices.

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
      steps.push({ type: 'swap', rows: [pivotRow, pivot], desc: `R${pivotRow + 1} ↔ R${pivot + 1}`, after: clone(m) });
    }
    const p = m[pivotRow][col];
    if (Math.abs(p - 1) > EPS) {
      for (let j = 0; j < cols; j++) m[pivotRow][j] /= p;
      tidyRow(m[pivotRow]);
      steps.push({ type: 'scale', rows: [pivotRow], desc: `R${pivotRow + 1} ← ${fmt(1 / p)}·R${pivotRow + 1}`, after: clone(m) });
    }
    for (let r = 0; r < rows; r++) {
      if (r === pivotRow) continue;
      const f = m[r][col];
      if (Math.abs(f) < EPS) continue;
      for (let j = 0; j < cols; j++) m[r][j] -= f * m[pivotRow][j];
      tidyRow(m[r]);
      const sign = f > 0 ? '−' : '+';
      steps.push({ type: 'add', rows: [r, pivotRow], desc: `R${r + 1} ← R${r + 1} ${sign} ${fmt(Math.abs(f))}·R${pivotRow + 1}`, after: clone(m) });
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
