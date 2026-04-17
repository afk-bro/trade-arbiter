/**
 * DefaultRiskManager composes rules in declaration order, short-circuits on
 * first rejection, and emits a RiskDecision carrying the first-rejecting
 * reason (or 'ok' if all pass). Pure function of its inputs — no I/O.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  FillEvent,
  OrderIntent,
  PortfolioState,
  RiskRule,
  RiskState,
  RunContext,
} from '@trade-arbiter/core';
import { DefaultRiskManager } from '../src/risk-manager.js';
import { createIdGen } from '../src/id-gen.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

const intent: OrderIntent = {
  intentId: 'i1',
  ctx,
  tsCreated: 1,
  venue: 'hyperliquid',
  symbol: 'HYPE-PERP',
  side: 'buy',
  sizeRequested: 1,
  timeInForce: 'GTC',
  reason: 'test',
};

const portfolio: PortfolioState = {
  ctx,
  ts: 1,
  cashUsd: 1000,
  positions: new Map(),
  equity: 1000,
  dayStartEquity: 1000,
};

function makeRiskState(): RiskState {
  return {
    killSwitch: { active: false, triggeredBy: null, reason: '', triggeredAt: null },
    dayStartTs: 0,
    realizedPnlToday: 0,
    consecutiveLosses: 0,
    circuitBreakerTrippedAt: null,
    strategyExposureUsd: new Map(),
    venueExposureUsd: new Map(),
  };
}

test('empty rule list accepts every intent', () => {
  const rm = new DefaultRiskManager([], makeRiskState(), createIdGen('backtest_l1'), () => 42);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, true);
  assert.equal(d.sizeApproved, intent.sizeRequested);
  assert.equal(d.reason, 'ok');
  assert.equal(d.ts, 42);
});

test('passing rules chain to full approval', () => {
  const rule: RiskRule = {
    id: 'always-ok',
    check: () => ({ pass: true, size: 1, reason: 'fine' }),
  };
  const rm = new DefaultRiskManager([rule], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, true);
});

test('first rejecting rule wins; later rules are not called', () => {
  let secondCalls = 0;
  const first: RiskRule = {
    id: 'reject',
    check: () => ({ pass: false, size: 0, reason: 'no' }),
  };
  const second: RiskRule = {
    id: 'counter',
    check: () => { secondCalls += 1; return { pass: true, size: 1, reason: 'ok' }; },
  };
  const rm = new DefaultRiskManager([first, second], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, false);
  assert.equal(d.reason, 'no');
  assert.equal(d.sizeApproved, 0);
  assert.equal(secondCalls, 0);
});

test('approved size is the minimum across passing rules', () => {
  const r1: RiskRule = { id: 'cap5', check: () => ({ pass: true, size: 5, reason: 'cap5' }) };
  const r2: RiskRule = { id: 'cap2', check: () => ({ pass: true, size: 2, reason: 'cap2' }) };
  const rm = new DefaultRiskManager([r1, r2], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check({ ...intent, sizeRequested: 10 }, portfolio);
  assert.equal(d.approved, true);
  assert.equal(d.sizeApproved, 2);
});

test('isKilled() reflects the owned RiskState', () => {
  const state: RiskState = {
    ...makeRiskState(),
    killSwitch: { active: true, triggeredBy: 'user', reason: 'stop', triggeredAt: 1 },
  };
  const rm = new DefaultRiskManager([], state, createIdGen('backtest_l1'), () => 1);
  assert.equal(rm.isKilled(), true);
});

test('onFill is a no-op in Plan 2 (interface stable)', () => {
  const rm = new DefaultRiskManager([], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 1,
    tsReceived: 1,
    status: 'filled',
    filledSize: 1,
    remainingSize: 0,
    avgPrice: 100,
    feesPaid: 0,
  };
  assert.doesNotThrow(() => rm.onFill(fill));
});
