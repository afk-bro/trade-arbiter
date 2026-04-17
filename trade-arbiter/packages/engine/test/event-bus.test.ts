/**
 * InMemoryEventBus dispatches events to per-type subscribers. Publication
 * enqueues onto the wrapped queue; delivery happens on drain.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { EngineEvent, RunContext } from '@trade-arbiter/core';
import { InMemoryEventBus } from '../src/event-bus.js';
import { InMemoryEventQueue } from '../src/event-queue.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkEvent<T>(eventId: string, ts: number, payload: T): EngineEvent<T> {
  return { eventId, ctx, ts, payload };
}

test('subscribers receive events of their type', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const received: unknown[] = [];
  bus.subscribe<string>('market', (ev) => {
    received.push(ev.payload);
  });
  bus.publish('market', mkEvent('a', 0, 'hello'));
  await q.run();
  assert.deepEqual(received, ['hello']);
});

test('unsubscribe stops delivery', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const received: unknown[] = [];
  const off = bus.subscribe<string>('market', (ev) => {
    received.push(ev.payload);
  });
  off();
  bus.publish('market', mkEvent('a', 0, 'ignored'));
  await q.run();
  assert.deepEqual(received, []);
});

test('subscribers receiving the wrong type are not invoked', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const marketSeen: unknown[] = [];
  const fillSeen: unknown[] = [];
  bus.subscribe<string>('market', (ev) => {
    marketSeen.push(ev.payload);
  });
  bus.subscribe<string>('fill', (ev) => {
    fillSeen.push(ev.payload);
  });
  bus.publish('market', mkEvent('a', 0, 'm'));
  bus.publish('fill', mkEvent('b', 1, 'f'));
  await q.run();
  assert.deepEqual(marketSeen, ['m']);
  assert.deepEqual(fillSeen, ['f']);
});

test('multiple subscribers on same type both receive in subscription order', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const order: string[] = [];
  bus.subscribe<string>('market', () => { order.push('A'); });
  bus.subscribe<string>('market', () => { order.push('B'); });
  bus.publish('market', mkEvent('a', 0, 'm'));
  await q.run();
  assert.deepEqual(order, ['A', 'B']);
});
