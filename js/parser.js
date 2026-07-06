// Expression parser + evaluator for the visualizer's mini language.
// Values are { k: 'num', v } or { k: 'mat', m }.

import { add, sub, scale, multiply, transpose, det, inverse, matPow, rrefSteps } from './matrix.js';

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

  const startsFactor = (tok) => tok && (tok.t === 'num' || tok.t === 'name' || tok.t === '(');

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
    if ('+-*/^(),'.includes(ch)) {
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
