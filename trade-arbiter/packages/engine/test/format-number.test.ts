/**
 * Tests for the deterministic number formatter. Covers the Plan 2 spec
 * "Determinism contract > Floating-point formatting" requirements:
 * integers render without a decimal point; floats use 12 decimal places
 * with no exponent; negative zero collapses to positive zero; NaN and
 * Infinity throw.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatNumber } from '../src/format-number.js';

test('integer renders without a decimal point', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1), '1');
  assert.equal(formatNumber(-42), '-42');
  assert.equal(formatNumber(1_000_000), '1000000');
});

test('finite float renders with 12 decimal places', () => {
  assert.equal(formatNumber(1.5), '1.500000000000');
  assert.equal(formatNumber(-0.25), '-0.250000000000');
  assert.equal(formatNumber(1.234567890123456), '1.234567890123');
});

test('no exponent notation even for very small values', () => {
  const small = 1e-10;
  const formatted = formatNumber(small);
  assert.equal(formatted.includes('e'), false);
  assert.equal(formatted.includes('E'), false);
});

test('negative zero renders as positive zero', () => {
  assert.equal(formatNumber(-0), '0');
});

test('NaN and Infinity throw', () => {
  assert.throws(() => formatNumber(NaN), /finite/);
  assert.throws(() => formatNumber(Infinity), /finite/);
  assert.throws(() => formatNumber(-Infinity), /finite/);
});
