import { parse, evaluate, flattenProduct, factorLabel } from './parser.js';
import { dims, fmt, rrefSteps, eigen2x2, identity, multiply } from './matrix.js';
import { Plane } from './plane.js';
import { StepsPanel } from './steps.js';
import { ObjectsPanel } from './ui.js';

const $ = (sel) => document.querySelector(sel);

let rerunTimer = 0;
const objects = new ObjectsPanel($('#objects'), () => {
  clearTimeout(rerunTimer);
  rerunTimer = setTimeout(rerun, 350);
});
const plane = new Plane(
  $('#plane'),
  {
    play: $('#plane-play'),
    restart: $('#plane-restart'),
    scrub: $('#plane-scrub'),
    speed: $('#plane-speed'),
    stageLabel: $('#plane-stage'),
  },
  $('#plane-message'),
);
const steps = new StepsPanel($('#steps'));

const exprInput = $('#expr');
const statusEl = $('#status');
const resultEl = $('#result');
let lastRun = '';

$('#run').addEventListener('click', run);
exprInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') run(); });
document.querySelectorAll('.chip').forEach((chip) =>
  chip.addEventListener('click', () => {
    exprInput.value = chip.textContent;
    run();
  }),
);

const tabs = document.querySelectorAll('.tab');
function selectTab(name) {
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#plane-wrap').hidden = name !== 'plane';
  $('#steps-wrap').hidden = name !== 'steps';
  if (name === 'plane') plane.resize();
}
tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

function run() {
  const src = exprInput.value.trim();
  if (src) runExpression(src);
}

function rerun() {
  if (lastRun) runExpression(lastRun, { silent: true });
}

function runExpression(src, { silent = false } = {}) {
  statusEl.textContent = '';
  try {
    lastRun = src;
    dispatch(src);
  } catch (err) {
    if (!silent) {
      statusEl.textContent = err.message;
      resultEl.innerHTML = '';
    }
  }
}

function dispatch(src) {
  const ast = parse(src);
  const env = objects.env();

  if (ast.t === 'call' && ast.fn === 'eig') {
    vizEigen(evaluate(ast.args[0], env), factorLabel(ast.args[0]) ?? 'the matrix', src);
    return;
  }
  if (ast.t === 'call' && ast.fn === 'rref') {
    vizRref(evaluate(ast.args[0], env), factorLabel(ast.args[0]) ?? 'the matrix', src);
    return;
  }

  const value = evaluate(ast, env);
  showResult(value, esc(src));

  const factors = readFactors(ast, env);
  let planeShown = false;
  let stepsShown = false;

  if (factors && factors.length === 2 && factors.every((f) => f.value.k === 'mat')
    && dims(factors[0].value.m)[1] === dims(factors[1].value.m)[0]) {
    steps.showMatmul(factors[0].value.m, factors[1].value.m, value.m, factors[0].label, factors[1].label);
    stepsShown = true;
  }

  if (value.k === 'mat') {
    const [r, c] = dims(value.m);
    if (r === 2 && c === 2) {
      plane.setScene({ stages: buildStages(factors) ?? [{ m: value.m, label: src }] });
      planeShown = true;
    } else if (r === 2 && c === 1) {
      plane.setScene(buildVectorScene(factors, value.m, src));
      planeShown = true;
    }
  } else if (ast.t === 'call' && ast.fn === 'det') {
    const arg = evaluate(ast.args[0], env);
    if (arg.k === 'mat' && arg.m.length === 2 && arg.m[0].length === 2) {
      plane.setScene({
        stages: [{ m: arg.m, label: `unit square area scales by |det| = ${fmt(Math.abs(value.v))}` }],
        showSquare: true,
      });
      planeShown = true;
    }
  }

  if (!planeShown) plane.clear('The geometric view shows 2×2 matrices and 2-vectors. This result is shown numerically on the left.');
  if (!stepsShown) steps.clear();
  selectTab(planeShown ? 'plane' : stepsShown ? 'steps' : 'plane');
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

// Right-to-left composition stages for a pure chain of 2×2 factors.
function buildStages(factors) {
  if (!factors || factors.length < 2) return null;
  if (!factors.every((f) => f.value.k === 'mat' && f.value.m.length === 2 && f.value.m[0].length === 2)) return null;
  const stages = [];
  let cum = identity(2);
  for (let i = factors.length - 1; i >= 0; i--) {
    cum = multiply(factors[i].value.m, cum);
    stages.push({ m: cum, label: `apply ${factors[i].label}` });
  }
  return stages;
}

function buildVectorScene(factors, resultVec, src) {
  if (factors && factors.length >= 2) {
    const last = factors[factors.length - 1];
    const matFactors = factors.slice(0, -1);
    const lastIsVec = last.value.k === 'mat' && last.value.m.length === 2 && last.value.m[0].length === 1;
    const allMats = matFactors.every((f) => f.value.k === 'mat' && f.value.m.length === 2 && f.value.m[0].length === 2);
    if (lastIsVec && allMats) {
      const stages = [];
      let cum = identity(2);
      for (let i = matFactors.length - 1; i >= 0; i--) {
        cum = multiply(matFactors[i].value.m, cum);
        stages.push({ m: cum, label: `apply ${matFactors[i].label}` });
      }
      return {
        stages,
        vectors: [{ v: [last.value.m[0][0], last.value.m[1][0]], ride: true, label: last.label }],
      };
    }
  }
  return {
    stages: [{ m: identity(2), label: '' }],
    vectors: [{ v: [resultVec[0][0], resultVec[1][0]], ride: false, label: src.length <= 24 ? src : '' }],
  };
}

function vizEigen(value, argLabel, src) {
  if (value.k !== 'mat') throw new Error('eig(…) expects a matrix');
  const [r, c] = dims(value.m);
  if (r !== c) throw new Error(`eig needs a square matrix (got ${r}×${c})`);
  if (r !== 2) throw new Error('The eigen visualization currently supports 2×2 matrices');
  const e = eigen2x2(value.m);
  steps.clear();
  if (e.complex) {
    resultEl.innerHTML = `<div class="result-title">${esc(src)}</div>
      <p>λ = ${fmt(e.re)} ± ${fmt(e.im)}i — complex eigenvalues.</p>
      <p class="muted">No real eigenvectors: ${esc(argLabel)} rotates every vector off its own span. Watch the grid — no line maps to itself.</p>`;
    plane.setScene({ stages: [{ m: value.m, label: `apply ${argLabel} — no real eigenvectors` }] });
  } else {
    const lines = e.values.slice(0, e.vectors.length).map((l, i) =>
      `<p>λ${sub(i + 1)} = <b>${fmt(l)}</b>, direction ${vecText(e.vectors[i])}</p>`).join('');
    const note = e.allVectors
      ? `<p class="muted">${esc(argLabel)} = λ·I — every vector is an eigenvector.</p>`
      : e.defective
        ? '<p class="muted">Repeated eigenvalue with only one independent eigenvector direction (defective matrix).</p>'
        : '';
    resultEl.innerHTML = `<div class="result-title">${esc(src)}</div>${lines}${note}`;
    plane.setScene({
      stages: [{ m: value.m, label: `apply ${argLabel} — eigenvectors stay on their span` }],
      eigen: {
        lines: e.vectors,
        arrows: e.vectors.map((v, i) => ({ v, value: e.values[i] })),
      },
    });
  }
  selectTab('plane');
}

function vizRref(value, argLabel, src) {
  if (value.k !== 'mat') throw new Error('rref(…) expects a matrix');
  const { result, steps: ops } = rrefSteps(value.m);
  showResult({ k: 'mat', m: result }, esc(src));
  steps.showRowOps(value.m, ops, esc(argLabel));
  plane.clear('Row reduction is a numeric animation — see the Steps tab.');
  selectTab('steps');
}

function showResult(value, title) {
  if (value.k === 'num') {
    resultEl.innerHTML = `<div class="result-title">${title}</div><p class="result-scalar">= ${fmt(value.v)}</p>`;
  } else {
    resultEl.innerHTML = `<div class="result-title">${title} =</div>${matrixHtml(value.m)}`;
  }
}

function matrixHtml(m) {
  const rows = m.map((row) => `<tr>${row.map((x) => `<td>${fmt(x)}</td>`).join('')}</tr>`).join('');
  return `<table class="mat small">${rows}</table>`;
}

function vecText([x, y]) {
  return `[${fmt(x)}, ${fmt(y)}]`;
}

function sub(n) {
  return ['₀', '₁', '₂', '₃'][n] ?? n;
}

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

objects.seed();
exprInput.value = 'eig(A)';
run();
