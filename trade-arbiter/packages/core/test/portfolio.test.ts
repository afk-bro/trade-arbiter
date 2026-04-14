import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PositionState, PortfolioState } from '../src/portfolio.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};

test('PositionState compile shape with binary outcome', () => {
  const pos: PositionState = {
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    qty: 5,
    avgCost: 0.48,
    realizedPnl: 0,
    unrealizedPnl: 0.05,
  };
  assert.equal(pos.outcome, 'YES');
});

test('PositionState compile shape without outcome (futures)', () => {
  const pos: PositionState = {
    venue: 'binance',
    symbol: 'BTCUSDT',
    qty: -0.1,
    avgCost: 65000,
    realizedPnl: 12.5,
    unrealizedPnl: -3.2,
  };
  assert.ok(pos.qty < 0); // signed quantity
});

test('PortfolioState compile shape with empty positions', () => {
  const pf: PortfolioState = {
    ctx,
    ts: 0,
    cashUsd: 1000,
    positions: new Map(),
    equity: 1000,
    dayStartEquity: 1000,
  };
  assert.equal(pf.positions.size, 0);
  assert.equal(pf.equity, pf.dayStartEquity);
});

test('PortfolioState positions are keyed by venue:symbol:outcome', () => {
  const positions = new Map<string, PositionState>();
  positions.set('polymarket:btc-up-15m:YES', {
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    qty: 5, avgCost: 0.48, realizedPnl: 0, unrealizedPnl: 0,
  });
  const pf: PortfolioState = {
    ctx,
    ts: 100,
    cashUsd: 997.6,
    positions,
    equity: 1000,
    dayStartEquity: 1000,
  };
  assert.equal(pf.positions.get('polymarket:btc-up-15m:YES')?.qty, 5);
});
