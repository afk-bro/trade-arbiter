import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderLineage, OrderManager } from '../src/order-manager.js';
import type { OrderIntent, OrderRequest, FillEvent, OrderEvent } from '../src/intents.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

const intent: OrderIntent = {
  intentId: 'i1', ctx, tsCreated: 0,
  venue: 'polymarket', symbol: 'btc-up-15m',
  side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
};

const request: OrderRequest = {
  ...intent,
  requestId: 'req1',
  sizeApproved: 5,
  riskDecisionId: 'd1',
};

test('OrderLineage compile shape', () => {
  const lineage: OrderLineage = {
    intent,
    requests: [request],
    fills: [],
    events: [],
    status: 'pending',
    remainingSize: 5,
  };
  assert.equal(lineage.requests.length, 1);
  assert.equal(lineage.status, 'pending');
});

test('OrderManager interface implementable with stub state', () => {
  const lineages = new Map<string, OrderLineage>();
  const open: OrderRequest[] = [];

  const manager: OrderManager = {
    onIntent: (i, r) => {
      lineages.set(i.intentId, {
        intent: i,
        requests: [r],
        fills: [],
        events: [],
        status: 'pending',
        remainingSize: r.sizeApproved,
      });
      open.push(r);
    },
    onFill: (f: FillEvent) => {
      const cur = lineages.get(f.intentId);
      if (cur) {
        const updated: OrderLineage = {
          ...cur,
          fills: [...cur.fills, f],
          remainingSize: f.remainingSize,
          status: f.status === 'filled' ? 'filled' : 'partially_filled',
        };
        lineages.set(f.intentId, updated);
      }
    },
    onOrderEvent: (e: OrderEvent) => {
      const cur = lineages.get(e.intentId);
      if (cur) {
        lineages.set(e.intentId, { ...cur, events: [...cur.events, e], status: e.status });
      }
    },
    getOpenOrders: () => open,
    getLineage: (id) => {
      const found = lineages.get(id);
      if (!found) throw new Error(`no lineage for ${id}`);
      return found;
    },
    tickTimeouts: (_now) => {},
  };

  manager.onIntent(intent, request);
  assert.equal(manager.getOpenOrders().length, 1);

  manager.onFill({
    fillId: 'f1', intentId: 'i1', requestId: 'req1', ctx,
    venue: 'polymarket', symbol: 'btc-up-15m',
    tsExchange: 1, tsReceived: 2,
    status: 'filled', filledSize: 5, remainingSize: 0,
    avgPrice: 0.48, feesPaid: 0.001,
  });

  const lineage = manager.getLineage('i1');
  assert.equal(lineage.fills.length, 1);
  assert.equal(lineage.status, 'filled');
  assert.equal(lineage.remainingSize, 0);

  manager.tickTimeouts(1000);
});
