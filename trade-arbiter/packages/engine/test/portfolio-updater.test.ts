/**
 * PortfolioUpdater. Given FillEvents (with explicit side) and a last-quote
 * provider, maintains PortfolioState and emits a PnlEvent per fill.
 * Realized PnL formula:
 *   closing fill: realizedDelta = (fillPrice − avgEntry) × closingSize × closingSign − feesPaid
 *   opening fill: realizedDelta = −feesPaid; avgCost updates via weighted average
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { FillEvent, RunContext } from '@trade-arbiter/core';
import { PortfolioUpdater } from '../src/portfolio-updater.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkFill(over: Partial<FillEvent>): FillEvent {
  return {
    fillId: 'f',
    intentId: 'i',
    requestId: 'r',
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
    ...over,
  };
}

test('opening long fill sets avgEntry; realizedDelta is -feesPaid (0 if no fee)', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const pnl = pu.onFillDirected(mkFill({ filledSize: 2, avgPrice: 100 }), 'buy');
  assert.equal(pnl.realizedDelta, 0);
  assert.equal(pnl.realizedCumulative, 0);
  assert.equal(pnl.currency, 'USDC');
});

test('adding to long position updates avgEntry (weighted average)', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFillDirected(mkFill({ filledSize: 2, avgPrice: 100 }), 'buy');
  pu.onFillDirected(mkFill({ fillId: 'f2', filledSize: 2, avgPrice: 110 }), 'buy');
  const p = pu.getPortfolio(2);
  const pos = p.positions.get('hyperliquid:HYPE-PERP:');
  assert.equal(pos?.qty, 4);
  assert.equal(pos?.avgCost, 105);
});

test('explicit sell closes a long and booked PnL matches formula', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFillDirected(mkFill({ filledSize: 2, avgPrice: 100 }), 'buy');
  const sell = mkFill({
    fillId: 'close',
    filledSize: 1,
    avgPrice: 110,
    feesPaid: 0.25,
    remainingSize: 0,
  });
  const pnl = pu.onFillDirected(sell, 'sell');
  assert.equal(pnl.realizedDelta, (110 - 100) * 1 - 0.25);
  const p = pu.getPortfolio(1);
  assert.equal(p.positions.get('hyperliquid:HYPE-PERP:')?.qty, 1);
});

test('cumulative realized tracks the running total', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFillDirected(mkFill({ filledSize: 1, avgPrice: 100 }), 'buy');
  const a = pu.onFillDirected(mkFill({ fillId: 'sell1', filledSize: 1, avgPrice: 105, feesPaid: 0 }), 'sell');
  pu.onFillDirected(mkFill({ fillId: 'buy2', filledSize: 1, avgPrice: 200 }), 'buy');
  const b = pu.onFillDirected(mkFill({ fillId: 'sell2', filledSize: 1, avgPrice: 190, feesPaid: 0 }), 'sell');
  assert.equal(a.realizedCumulative, 5);
  assert.equal(b.realizedCumulative, -5);
});

test('zero-size fill does nothing', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.updateMark('hyperliquid:HYPE-PERP:', 999);
  const pnl = pu.onFill(mkFill({ filledSize: 0, status: 'cancelled', remainingSize: 0 }));
  assert.equal(pnl.unrealizedMark, 0);
  assert.equal(pnl.realizedDelta, 0);
});
