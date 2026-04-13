import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionAdapter, DataFeed } from '../src/adapter.js';
import type { OrderRequest, OrderEvent, FillEvent } from '../src/intents.js';
import type { MarketEvent } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

test('ExecutionAdapter compile shape', async () => {
  const fillCallbacks: Array<(f: FillEvent) => void> = [];
  const orderCallbacks: Array<(o: OrderEvent) => void> = [];

  const adapter: ExecutionAdapter = {
    venue: 'polymarket',
    mode: 'paper',
    connect: async () => {},
    submit: async (req: OrderRequest) => ({ requestId: req.requestId }),
    cancel: async (_id: string) => {},
    onFill: (cb) => { fillCallbacks.push(cb); },
    onOrderEvent: (cb) => { orderCallbacks.push(cb); },
    disconnect: async () => {},
  };

  await adapter.connect();
  const ack = await adapter.submit({
    intentId: 'i1', ctx, tsCreated: 0,
    venue: 'polymarket', symbol: 'btc-up-15m',
    side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
    requestId: 'req1', sizeApproved: 5, riskDecisionId: 'd1',
  });
  assert.equal(ack.requestId, 'req1');
  assert.equal(adapter.venue, 'polymarket');
  assert.equal(fillCallbacks.length, 0); // no callbacks registered yet
  assert.equal(orderCallbacks.length, 0);
  await adapter.disconnect();
});

test('DataFeed compile shape (live, no seek)', async () => {
  const captured: MarketEvent[] = [];
  const feed: DataFeed = {
    venue: 'polymarket',
    mode: 'paper',
    subscribe: (_symbols, _types) => {},
    onEvent: (cb) => { void cb; void captured; },
    start: async () => {},
    stop: async () => {},
  };
  feed.subscribe(['btc-up-15m'], ['quote', 'trade']);
  await feed.start();
  assert.equal(feed.venue, 'polymarket');
  assert.equal(feed.seek, undefined);
  await feed.stop();
});

test('DataFeed compile shape (replay, with seek)', async () => {
  let seekedTo: number | null = null;
  const feed: DataFeed = {
    venue: 'polymarket',
    mode: 'backtest_l1',
    subscribe: () => {},
    onEvent: () => {},
    start: async () => {},
    stop: async () => {},
    seek: async (ts) => { seekedTo = ts; },
  };
  await feed.seek?.(12345);
  assert.equal(seekedTo, 12345);
});
