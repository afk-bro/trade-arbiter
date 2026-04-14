import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  RiskCheck,
  RiskRule,
  RiskDecision,
  RiskState,
  KillSwitchState,
  RiskManager,
} from '../src/risk.js';
import type { OrderIntent } from '../src/intents.js';
import type { PortfolioState } from '../src/portfolio.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

const intent: OrderIntent = {
  intentId: 'i1', ctx, tsCreated: 0,
  venue: 'polymarket', symbol: 'btc-up-15m',
  side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
};

const portfolio: PortfolioState = {
  ctx, ts: 0, cashUsd: 1000, positions: new Map(), equity: 1000, dayStartEquity: 1000,
};

const killState: KillSwitchState = {
  active: false,
  triggeredBy: null,
  reason: '',
  triggeredAt: null,
};

const riskState: RiskState = {
  killSwitch: killState,
  dayStartTs: 0,
  realizedPnlToday: 0,
  consecutiveLosses: 0,
  circuitBreakerTrippedAt: null,
  strategyExposureUsd: new Map(),
  venueExposureUsd: new Map(),
};

test('RiskCheck compile shape with passing result', () => {
  const check: RiskCheck = { pass: true, size: 5, reason: 'ok' };
  assert.equal(check.size, 5);
});

test('RiskCheck compile shape with rejecting result', () => {
  const check: RiskCheck = { pass: false, size: 0, reason: 'kill_switch' };
  assert.equal(check.size, 0);
});

test('RiskRule implementable as pure function', () => {
  const rule: RiskRule = {
    id: 'max-order-size',
    check: (i, _pf, _state) => ({
      pass: i.sizeRequested <= 10,
      size: Math.min(i.sizeRequested, 10),
      reason: i.sizeRequested <= 10 ? 'ok' : 'capped',
    }),
  };
  const result = rule.check(intent, portfolio, riskState);
  assert.equal(result.pass, true);
  assert.equal(result.size, 5);
});

test('RiskDecision compile shape', () => {
  const decision: RiskDecision = {
    decisionId: 'd1',
    ctx,
    intentId: 'i1',
    approved: true,
    sizeApproved: 5,
    reason: 'ok',
    ts: 1,
  };
  assert.equal(decision.approved, true);
});

test('RiskState compile shape with populated exposure maps', () => {
  const populated: RiskState = {
    ...riskState,
    strategyExposureUsd: new Map([['hedged-btc-15m', 250]]),
    venueExposureUsd: new Map([['polymarket', 250]]),
  };
  assert.equal(populated.strategyExposureUsd.get('hedged-btc-15m'), 250);
  assert.equal(populated.venueExposureUsd.get('polymarket'), 250);
});

test('KillSwitchState compile shape — tripped', () => {
  const tripped: KillSwitchState = {
    active: true,
    triggeredBy: 'risk_rule',
    reason: 'daily_loss_exceeded',
    triggeredAt: 1234,
  };
  assert.ok(tripped.active);
  assert.equal(tripped.triggeredBy, 'risk_rule');
});

test('RiskManager interface implementable', () => {
  let killed = false;
  const manager: RiskManager = {
    check: (i, _pf): RiskDecision => ({
      decisionId: `d-${i.intentId}`,
      ctx: i.ctx,
      intentId: i.intentId,
      approved: !killed,
      sizeApproved: killed ? 0 : i.sizeRequested,
      reason: killed ? 'kill_switch' : 'ok',
      ts: 0,
    }),
    onFill: (_f) => {},
    isKilled: () => killed,
  };
  const ok = manager.check(intent, portfolio);
  assert.equal(ok.approved, true);
  killed = true;
  const blocked = manager.check(intent, portfolio);
  assert.equal(blocked.approved, false);
  assert.equal(blocked.sizeApproved, 0);
  assert.equal(manager.isKilled(), true);
});
