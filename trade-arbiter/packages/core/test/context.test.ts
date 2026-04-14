import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunContext, EngineClock } from '../src/context.js';

test('RunContext compile shape', () => {
  const ctx: RunContext = {
    runId: 'r1',
    strategyId: 's1',
    configHash: 'h1',
    mode: 'backtest_l1',
  };
  void ctx;
});

test('EngineClock compile shape with paper-mode wall clock', () => {
  let nowValue = 1000;
  const clock: EngineClock = {
    mode: 'paper',
    now: () => nowValue,
  };
  assert.equal(clock.now(), 1000);
  nowValue = 2000;
  assert.equal(clock.now(), 2000);
});

test('EngineClock compile shape with backtest clock', () => {
  const clock: EngineClock = {
    mode: 'backtest_l1',
    now: () => 0,
  };
  assert.equal(clock.mode, 'backtest_l1');
});
