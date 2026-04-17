/**
 * Tests for the mode-dependent ID generator. Backtest modes use a seeded
 * monotonic counter rendered as a 26-char ULID-shaped string. Paper/live
 * modes will use real ULIDs, but Plan 2 only needs the dispatch — the
 * paper/live branch throws a clear 'not implemented in Plan 2' error.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createIdGen } from '../src/id-gen.js';

test('backtest counter starts at 1 and increments monotonically', () => {
  const gen = createIdGen('backtest_l1');
  assert.equal(gen.next(), '00000000000000000000000001');
  assert.equal(gen.next(), '00000000000000000000000002');
  assert.equal(gen.next(), '00000000000000000000000003');
});

test('backtest_l2 uses the same counter scheme', () => {
  const gen = createIdGen('backtest_l2');
  assert.equal(gen.next(), '00000000000000000000000001');
});

test('two backtest generators produce identical sequences', () => {
  const a = createIdGen('backtest_l1');
  const b = createIdGen('backtest_l1');
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test('counter id is always 26 chars long', () => {
  const gen = createIdGen('backtest_l1');
  for (let i = 0; i < 10; i++) {
    assert.equal(gen.next().length, 26);
  }
});

test('paper mode throws "not implemented in Plan 2"', () => {
  const gen = createIdGen('paper');
  assert.throws(() => gen.next(), /Plan 2/);
});

test('live mode throws "not implemented in Plan 2"', () => {
  const gen = createIdGen('live');
  assert.throws(() => gen.next(), /Plan 2/);
});
