import { parse, evaluate, flattenProduct, factorLabel } from './parser.js';
import { dims, fmt, rrefSteps, eigen2x2, identity, multiply } from './matrix.js';
import { Plane } from './plane.js';
import { MatrixView, equationHtml } from './matrixview.js';
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
    zoomIn: $('#zoom-in'),
    zoomOut: $('#zoom-out'),
    zoomReset: $('#zoom-reset'),
  },
  $('#plane-message'),
);
const matrixView = new MatrixView($('#matrixview'));
const sandboxView = new MatrixView($('#wb-view'));
const symbolicViews = [matrixView, sandboxView];

const exprInput = $('#expr');
const statusEl = $('#status');
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

const tabs = document.querySelectorAll('.tab');
let currentTab = 'graph';
function selectTab(name) {
  currentTab = name;
  tabs.forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
  $('#graph-wrap').hidden = name !== 'graph';
  $('#matrix-wrap').hidden = name !== 'matrix';
  $('#sandbox-wrap').hidden = name !== 'sandbox';
  if (name === 'graph') plane.resize();
}
tabs.forEach((t) => t.addEventListener('click', () => selectTab(t.dataset.tab)));

/* ---------- sandbox live preview (fed by the main Expression box) ---------- */

const wbPreview = $('#wb-preview');

function updatePreview() {
  wbPreview.hidden = false;
  try {
    wbPreview.innerHTML = equationHtml(previewParts(parse(exprInput.value.trim()), objects.env()));
  } catch {
    wbPreview.innerHTML = '';
  }
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

/* ---------- expression running ---------- */

function run() {
  const src = exprInput.value.trim();
  if (src) runExpression(src, { autoTab: true });
}

function rerun() {
  if (lastRun) runExpression(lastRun, { silent: true, autoTab: false });
}

function runExpression(src, { silent = false, autoTab = true } = {}) {
  statusEl.textContent = '';
  try {
    lastRun = src;
    dispatch(src, autoTab);
    wbPreview.hidden = true; // the sandbox's Start frame now shows the equation
  } catch (err) {
    if (!silent) statusEl.textContent = err.message;
  }
}

function dispatch(src, autoTab) {
  const env = objects.env();
  const info = renderSymbolic(symbolicViews, src, env);

  let planeShown = false;
  if (info.kind === 'eig') {
    if (info.e.complex) {
      plane.setScene({ stages: [{ m: info.m, label: `apply ${info.argLabel} — no real eigenvectors` }] });
    } else {
      plane.setScene({
        stages: [{ m: info.m, label: `apply ${info.argLabel} — eigenvectors stay on their span` }],
        eigen: {
          lines: info.e.vectors,
          arrows: info.e.vectors.map((v, i) => ({ v, value: info.e.values[i] })),
        },
      });
    }
    planeShown = true;
  } else if (info.kind === 'expr') {
    const { ast, value, factors } = info;
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
  }

  if (!planeShown) {
    plane.clear(info.kind === 'rref'
      ? 'Row reduction is a numeric process — it plays step by step in the Matrix tab.'
      : 'The graph view shows 2×2 matrices and 2-vectors — toggle to the Matrix tab for this result.');
  }
  if (autoTab && currentTab !== 'sandbox') selectTab(planeShown ? 'graph' : 'matrix');
}

// Route an expression into every MatrixView (dark tab and whiteboard sandbox);
// returns what the graph view needs to build its scene.
function renderSymbolic(views, src, env) {
  const ast = parse(src);

  if (ast.t === 'call' && ast.fn === 'eig') {
    const value = evaluate(ast.args[0], env);
    if (value.k !== 'mat') throw new Error('eig(…) expects a matrix');
    const [r, c] = dims(value.m);
    if (r !== c) throw new Error(`eig needs a square matrix (got ${r}×${c})`);
    if (r !== 2) throw new Error('The eigen visualization currently supports 2×2 matrices');
    const argLabel = factorLabel(ast.args[0]) ?? 'the matrix';
    const e = eigen2x2(value.m);
    views.forEach((view) => view.showEigen(value.m, e, argLabel));
    return { kind: 'eig', m: value.m, e, argLabel };
  }

  if (ast.t === 'call' && ast.fn === 'rref') {
    const value = evaluate(ast.args[0], env);
    if (value.k !== 'mat') throw new Error('rref(…) expects a matrix');
    const argLabel = factorLabel(ast.args[0]) ?? 'M';
    const { steps: ops } = rrefSteps(value.m);
    views.forEach((view) => view.showRowOps(value.m, ops, esc(argLabel)));
    return { kind: 'rref' };
  }

  const value = evaluate(ast, env);
  const factors = readFactors(ast, env);
  views.forEach((view) => buildSymbolicView(view, ast, env, value, factors, esc(src)));
  return { kind: 'expr', ast, value, factors };
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
    view.showEquation(parts, `<code>${srcT}</code> composes right to left — watch it stage by stage in the Graph tab.`);
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

function esc(s) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

objects.seed();
exprInput.value = 'A*B';
run();
