import { expect, test } from 'bun:test';
import {
  multiply, det, inverse, rrefSteps, eigen2x2, matPow, transpose,
  parse, evaluate, flattenProduct,
} from '../js/app.js';

const A = [[2, 1], [1, 2]];
const env = new Map([
  ['A', A],
  ['B', [[0, -1], [1, 0]]],
  ['v', [[2], [1]]],
]);

test('multiply', () => {
  expect(multiply(A, [[0, -1], [1, 0]])).toEqual([[1, -2], [2, -1]]);
  expect(() => multiply([[1, 2]], [[1, 2]])).toThrow(/Cannot multiply/);
});

test('transpose', () => {
  expect(transpose([[1, 2, 3], [4, 5, 6]])).toEqual([[1, 4], [2, 5], [3, 6]]);
});

test('det and inverse', () => {
  expect(det(A)).toBeCloseTo(3);
  const prod = multiply(A, inverse(A));
  expect(prod[0][0]).toBeCloseTo(1);
  expect(prod[0][1]).toBeCloseTo(0);
  expect(prod[1][0]).toBeCloseTo(0);
  expect(prod[1][1]).toBeCloseTo(1);
  expect(() => inverse([[1, 2], [2, 4]])).toThrow(/singular/);
});

test('matPow', () => {
  expect(matPow([[0, -1], [1, 0]], 4)).toEqual([[1, 0], [0, 1]]);
  const inv = matPow(A, -1);
  expect(multiply(A, inv)[0][0]).toBeCloseTo(1);
});

test('rrefSteps reduces and records elementary operations', () => {
  const { result, steps } = rrefSteps([[1, 2, -1], [2, 4, 1], [3, 6, 0]]);
  expect(result).toEqual([[1, 2, 0], [0, 0, 1], [0, 0, 0]]);
  expect(steps.length).toBeGreaterThan(0);
  expect(steps.every((s) => ['swap', 'scale', 'add'].includes(s.type))).toBe(true);
  expect(steps.every((s) => Array.isArray(s.pivotAt) && s.pivotAt.length === 2)).toBe(true);
  expect(steps.filter((s) => s.type === 'add').every((s) => Number.isInteger(s.target) && Number.isInteger(s.source))).toBe(true);
  expect(steps[steps.length - 1].after).toEqual(result);
});

test('eigen2x2 real case', () => {
  const e = eigen2x2(A);
  expect(e.complex).toBe(false);
  expect(e.values[0]).toBeCloseTo(3);
  expect(e.values[1]).toBeCloseTo(1);
  expect(e.vectors[0][1] / e.vectors[0][0]).toBeCloseTo(1);
  expect(e.vectors[1][1] / e.vectors[1][0]).toBeCloseTo(-1);
});

test('eigen2x2 rotation is complex', () => {
  const e = eigen2x2([[0, -1], [1, 0]]);
  expect(e.complex).toBe(true);
  expect(e.im).toBeCloseTo(1);
});

test('eigen2x2 shear is defective', () => {
  const e = eigen2x2([[1, 1], [0, 1]]);
  expect(e.defective).toBe(true);
  expect(e.vectors.length).toBe(1);
});

test('eigen2x2 scalar multiple of identity', () => {
  const e = eigen2x2([[3, 0], [0, 3]]);
  expect(e.allVectors).toBe(true);
  expect(e.vectors.length).toBe(2);
});

test('parser evaluates expressions', () => {
  expect(evaluate(parse('2*3 + 1'), env).v).toBe(7);
  expect(evaluate(parse('det(A)'), env).v).toBeCloseTo(3);
  expect(evaluate(parse('2A'), env).m).toEqual([[4, 2], [2, 4]]);
  expect(evaluate(parse('A*v'), env).m).toEqual([[5], [4]]);
  expect(evaluate(parse('B^4'), env).m).toEqual([[1, 0], [0, 1]]);
  expect(evaluate(parse('trans(A) - A'), env).m).toEqual([[0, 0], [0, 0]]);
  expect(evaluate(parse('rref(A)'), env).m).toEqual([[1, 0], [0, 1]]);
  const m = evaluate(parse('inv(A)*A'), env).m;
  expect(m[0][0]).toBeCloseTo(1);
  expect(m[1][0]).toBeCloseTo(0);
  const inv = evaluate(parse('A^-1'), env).m;
  expect(multiply(A, inv)[0][0]).toBeCloseTo(1);
});

test('parser rejects invalid input', () => {
  expect(() => evaluate(parse('A + v'), env)).toThrow();
  expect(() => evaluate(parse('v*A'), env)).toThrow(/Cannot multiply/);
  expect(() => evaluate(parse('eig(A) + 1'), env)).toThrow(/visualization/);
  expect(() => evaluate(parse('X'), env)).toThrow(/Unknown name/);
  expect(() => parse('A +')).toThrow();
  expect(() => parse('A $ B')).toThrow(/Unexpected character/);
});

test('matrix literals parse with correct orientation', () => {
  expect(evaluate(parse('[1 2]'), env).m).toEqual([[1, 2]]);
  expect(evaluate(parse('[1; 2]'), env).m).toEqual([[1], [2]]);
  expect(evaluate(parse('[1 2; 3 4] * [5; 6]'), env).m).toEqual([[17], [39]]);
  expect(evaluate(parse('[1, -2]'), env).m).toEqual([[1, -2]]);
  expect(evaluate(parse('[1 -2]'), env).m).toEqual([[1, -2]]);
  expect(evaluate(parse('2[1 0]'), env).m).toEqual([[2, 0]]);
  expect(evaluate(parse('[1 2] + [3 4]'), env).m).toEqual([[4, 6]]);
  expect(evaluate(parse('[2^2 1]'), env).m).toEqual([[4, 1]]);
});

test('matrix literals reject invalid input', () => {
  expect(() => parse('[1 2; 3]')).toThrow(/same length/);
  expect(() => parse('[1 2')).toThrow(/Missing/);
  expect(() => parse('[]')).toThrow(/empty row/);
  expect(() => evaluate(parse('[A]'), env)).toThrow(/numbers/);
  expect(() => evaluate(parse('[1 0] * [1 0]'), env)).toThrow(/Cannot multiply/);
});

test('flattenProduct detects pure product chains', () => {
  expect(flattenProduct(parse('A*B*v')).length).toBe(3);
  expect(flattenProduct(parse('A+B'))).toBeNull();
  expect(flattenProduct(parse('det(A)'))).toBeNull();
});
