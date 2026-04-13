import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger, Strategy, StrategyContext } from '../src/strategy.js';
import type { EngineClock, RunContext } from '../src/context.js';
import type { MarketEvent } from '../src/events.js';
import type { FillEvent, OrderEvent, OrderIntent } from '../src/intents.js';
import type { PortfolioState } from '../src/portfolio.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};
const clock: EngineClock = { mode: 'paper', now: () => 0 };
const portfolio: PortfolioState = {
  ctx, ts: 0, cashUsd: 1000, positions: new Map(), equity: 1000, dayStartEquity: 1000,
};

const noopLogger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
};

test('Logger compile shape', () => {
  noopLogger.info('hello', { key: 'value' });
  noopLogger.error('boom');
  assert.ok(true);
});

test('StrategyContext compile shape', () => {
  const emitted: OrderIntent[] = [];
  const sctx: StrategyContext = {
    clock,
    ctx,
    portfolio: () => portfolio,
    config: { entry_threshold: 0.47 },
    logger: noopLogger,
    emit: (intent) => emitted.push(intent),
  };
  sctx.emit({
    intentId: 'i1',
    ctx,
    tsCreated: 0,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 1,
    timeInForce: 'GTC',
    reason: 'test',
  });
  assert.equal(emitted.length, 1);
  assert.equal(sctx.portfolio().equity, 1000);
});

test('Strategy interface implementable with required + optional methods', () => {
  let initCalled = false;
  let marketCount = 0;
  let fillCount = 0;
  let orderCount = 0;
  let tickCount = 0;

  const strategy: Strategy = {
    id: 'noop-strategy',
    init: async () => { initCalled = true; },
    onMarketEvent: (_ev: MarketEvent) => { marketCount++; },
    onFillEvent: (_ev: FillEvent) => { fillCount++; },
    onOrderEvent: (_ev: OrderEvent) => { orderCount++; },
    onTick: (_ts) => { tickCount++; },
    shutdown: async () => { /* noop */ },
  };

  void strategy.init({} as StrategyContext);
  strategy.onMarketEvent({ type: 'quote', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bid: 0, ask: 0, bidSize: 0, askSize: 0 });
  strategy.onFillEvent({ fillId: 'f', intentId: 'i', requestId: 'r', ctx, venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, status: 'filled', filledSize: 0, remainingSize: 0, avgPrice: 0, feesPaid: 0 });
  strategy.onOrderEvent?.({ requestId: 'r', intentId: 'i', ctx, status: 'filled', remainingSize: 0, ts: 0 });
  strategy.onTick?.(0);

  // initCalled is set asynchronously; just assert the synchronous counters.
  void initCalled;
  assert.equal(marketCount, 1);
  assert.equal(fillCount, 1);
  assert.equal(orderCount, 1);
  assert.equal(tickCount, 1);
});

test('Strategy interface implementable without optional methods', () => {
  const minimal: Strategy = {
    id: 'minimal',
    init: async () => {},
    onMarketEvent: () => {},
    onFillEvent: () => {},
    shutdown: async () => {},
  };
  assert.equal(minimal.id, 'minimal');
  assert.equal(minimal.onOrderEvent, undefined);
  assert.equal(minimal.onTick, undefined);
});
