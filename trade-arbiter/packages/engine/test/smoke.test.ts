/**
 * Sanity check: the engine package exists, has a barrel, and can import
 * @trade-arbiter/core. Every later engine test builds on this loading path.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MODES } from '@trade-arbiter/core';

test('engine package can import @trade-arbiter/core', () => {
  assert.ok(MODES.includes('backtest_l1'));
});
