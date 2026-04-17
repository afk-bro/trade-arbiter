/**
 * InMemoryEventQueue: FIFO drain, ordering by ts with insertion-order
 * tiebreaker, stop() halts the drain loop.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { EngineEvent, RunContext } from '@trade-arbiter/core';
import { InMemoryEventQueue } from '../src/event-queue.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkEvent(eventId: string, ts: number, payload: unknown): EngineEvent<unknown> {
  return { eventId, ctx, ts, payload };
}

test('enqueue increases size', () => {
  const q = new InMemoryEventQueue();
  assert.equal(q.size(), 0);
  q.enqueue(mkEvent('a', 0, 'x'));
  assert.equal(q.size(), 1);
});

test('run() drains events in timestamp order; handler sees each once', async () => {
  const q = new InMemoryEventQueue();
  const seen: string[] = [];
  q.onDrain((ev) => {
    seen.push(ev.eventId);
  });
  q.enqueue(mkEvent('b', 10, null));
  q.enqueue(mkEvent('a', 5, null));
  q.enqueue(mkEvent('c', 15, null));
  await q.run();
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('equal timestamps fall back to insertion order', async () => {
  const q = new InMemoryEventQueue();
  const seen: string[] = [];
  q.onDrain((ev) => {
    seen.push(ev.eventId);
  });
  q.enqueue(mkEvent('first', 10, null));
  q.enqueue(mkEvent('second', 10, null));
  q.enqueue(mkEvent('third', 10, null));
  await q.run();
  assert.deepEqual(seen, ['first', 'second', 'third']);
});

test('stop() halts drain mid-stream when called from the handler', async () => {
  const q = new InMemoryEventQueue();
  let seen = 0;
  q.onDrain(async () => {
    seen += 1;
    await q.stop();
  });
  q.enqueue(mkEvent('a', 0, null));
  q.enqueue(mkEvent('b', 1, null));
  q.enqueue(mkEvent('c', 2, null));
  await q.run();
  assert.equal(seen, 1, 'handler should see only the first event before stop()');
});
