/**
 * DefaultOrderManager tracks intent → request → fill lineage. Open orders
 * are any request not yet terminally filled or cancelled.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  FillEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  RunContext,
} from '@trade-arbiter/core';
import { DefaultOrderManager } from '../src/order-manager.js';

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

const request: OrderRequest = {
  ...intent,
  requestId: 'r1',
  sizeApproved: 1,
  riskDecisionId: 'd1',
};

test('getOpenOrders starts empty', () => {
  const om = new DefaultOrderManager();
  assert.equal(om.getOpenOrders().length, 0);
});

test('onIntent adds a request to open orders', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  assert.equal(om.getOpenOrders().length, 1);
  assert.equal(om.getOpenOrders()[0]?.requestId, 'r1');
});

test('getLineage reflects intent + requests + fills + events', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const lin = om.getLineage('i1');
  assert.equal(lin.intent.intentId, 'i1');
  assert.equal(lin.requests.length, 1);
  assert.equal(lin.fills.length, 0);
  assert.equal(lin.events.length, 0);
  assert.equal(lin.status, 'pending');
  assert.equal(lin.remainingSize, 1);
});

test('terminal fill removes request from open orders', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 2,
    tsReceived: 2,
    status: 'filled',
    filledSize: 1,
    remainingSize: 0,
    avgPrice: 100,
    feesPaid: 0,
  };
  om.onFill(fill);
  assert.equal(om.getOpenOrders().length, 0);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'filled');
  assert.equal(lin.remainingSize, 0);
  assert.equal(lin.fills.length, 1);
});

test('partial fill keeps request open with reduced remaining size', () => {
  const om = new DefaultOrderManager();
  const req5: OrderRequest = { ...request, sizeApproved: 5 };
  om.onIntent(intent, req5);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 2,
    tsReceived: 2,
    status: 'partial',
    filledSize: 2,
    remainingSize: 3,
    avgPrice: 100,
    feesPaid: 0,
  };
  om.onFill(fill);
  assert.equal(om.getOpenOrders().length, 1);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'partially_filled');
  assert.equal(lin.remainingSize, 3);
});

test('OrderEvent updates status without fill', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const ev: OrderEvent = {
    requestId: 'r1',
    intentId: 'i1',
    ctx,
    status: 'cancelled',
    remainingSize: 1,
    ts: 3,
  };
  om.onOrderEvent(ev);
  assert.equal(om.getOpenOrders().length, 0);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'cancelled');
});

test('tickTimeouts is a no-op in Plan 2', () => {
  const om = new DefaultOrderManager();
  assert.doesNotThrow(() => om.tickTimeouts(1000));
});
