import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  StrategySignalMeta,
  OrderIntent,
  OrderRequest,
  OrderStatus,
  OrderEvent,
  FillStatus,
  FillEvent,
} from '../src/intents.js';
import { ORDER_STATUSES, FILL_STATUSES } from '../src/intents.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};

test('ORDER_STATUSES enumerates the seven lifecycle states', () => {
  assert.deepEqual(
    [...ORDER_STATUSES].sort(),
    ['cancelled', 'expired', 'filled', 'open', 'partially_filled', 'pending', 'rejected'],
  );
});

test('FILL_STATUSES enumerates the five terminal/partial states', () => {
  assert.deepEqual(
    [...FILL_STATUSES].sort(),
    ['cancelled', 'expired', 'filled', 'partial', 'rejected'],
  );
});

test('OrderIntent compile shape with full optional fields', () => {
  const meta: StrategySignalMeta = { expectedEdge: 0.03, variance: 0.001, confidence: 0.7 };
  const intent: OrderIntent = {
    intentId: 'i1',
    ctx,
    tsCreated: 1,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    side: 'buy',
    sizeRequested: 5,
    priceLimit: 0.49,
    timeInForce: 'GTC',
    reason: 'reversal',
    tags: { signalMeta: meta, custom: 'anything' },
  };
  assert.equal(intent.tags?.signalMeta?.expectedEdge, 0.03);
});

test('OrderIntent compile shape with only required fields', () => {
  const intent: OrderIntent = {
    intentId: 'i2',
    ctx,
    tsCreated: 2,
    venue: 'binance',
    symbol: 'BTCUSDT',
    side: 'sell',
    sizeRequested: 0.1,
    timeInForce: 'IOC',
    reason: 'hedge',
  };
  assert.equal(intent.outcome, undefined);
});

test('OrderRequest extends OrderIntent with risk-decision lineage', () => {
  const req: OrderRequest = {
    intentId: 'i1',
    ctx,
    tsCreated: 1,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 5,
    timeInForce: 'IOC',
    reason: 'reversal',
    requestId: 'req1',
    sizeApproved: 3.2,
    riskDecisionId: 'd1',
    parentIntentId: 'i0',
  };
  assert.ok(req.sizeApproved < req.sizeRequested);
});

test('OrderEvent compile shape', () => {
  const ev: OrderEvent = {
    requestId: 'req1',
    intentId: 'i1',
    ctx,
    status: 'partially_filled',
    remainingSize: 1.2,
    ts: 100,
    reason: 'venue partial',
  };
  assert.equal(ev.status, 'partially_filled');
});

test('FillEvent compile shape with both timestamps', () => {
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'req1',
    ctx,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 100,
    tsReceived: 101,
    status: 'partial',
    filledSize: 2.0,
    remainingSize: 1.2,
    avgPrice: 0.48,
    feesPaid: 0.001,
  };
  assert.ok(fill.tsReceived > fill.tsExchange);
});

test('Status types accept every documented state', () => {
  const orderStates: OrderStatus[] = ['pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired'];
  const fillStates: FillStatus[] = ['partial', 'filled', 'rejected', 'cancelled', 'expired'];
  assert.equal(orderStates.length, 7);
  assert.equal(fillStates.length, 5);
});
