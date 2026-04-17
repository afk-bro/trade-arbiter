/**
 * BacktestClock advances only via explicit advance(ts). now() returns the
 * most recently advanced timestamp. Clock never goes backwards.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BacktestClock } from '../src/backtest-clock.js';

test('clock starts at its seed timestamp', () => {
  const c = new BacktestClock('backtest_l1', 1_700_000_000_000);
  assert.equal(c.now(), 1_700_000_000_000);
});

test('advance() moves the clock forward', () => {
  const c = new BacktestClock('backtest_l1', 0);
  c.advance(100);
  assert.equal(c.now(), 100);
  c.advance(250);
  assert.equal(c.now(), 250);
});

test('advance() to equal timestamp is a no-op (idempotent)', () => {
  const c = new BacktestClock('backtest_l1', 100);
  c.advance(100);
  assert.equal(c.now(), 100);
});

test('advance() to earlier timestamp throws', () => {
  const c = new BacktestClock('backtest_l1', 100);
  assert.throws(() => c.advance(50), /backwards/);
});

test('mode is exposed', () => {
  const c = new BacktestClock('backtest_l2', 0);
  assert.equal(c.mode, 'backtest_l2');
});

test('constructing with paper/live mode throws', () => {
  assert.throws(() => new BacktestClock('paper', 0), /BacktestClock/);
  assert.throws(() => new BacktestClock('live', 0), /BacktestClock/);
});
