import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventQueue, EventBus } from '../src/bus.js';
import type { EngineEvent } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

test('EventQueue interface implementable with stub', async () => {
  const buffer: EngineEvent<unknown>[] = [];
  let stopped = false;

  const queue: EventQueue = {
    enqueue: (ev) => { buffer.push(ev); },
    run: async () => { /* drain stub */ },
    stop: async () => { stopped = true; },
    size: () => buffer.length,
  };

  queue.enqueue({ eventId: 'e1', ctx, ts: 0, payload: { hello: 'world' } });
  queue.enqueue({ eventId: 'e2', ctx, ts: 1, payload: { hello: 'again' } });
  assert.equal(queue.size(), 2);
  await queue.run();
  await queue.stop();
  assert.equal(stopped, true);
});

test('EventBus interface implementable with synchronous fan-out stub', () => {
  const handlers = new Map<string, Array<(ev: EngineEvent<unknown>) => void>>();
  let publishCount = 0;

  const bus: EventBus = {
    subscribe: <T>(eventType: string, handler: (ev: EngineEvent<T>) => void | Promise<void>) => {
      const list = handlers.get(eventType) ?? [];
      list.push(handler as (ev: EngineEvent<unknown>) => void);
      handlers.set(eventType, list);
      return () => {
        const after = (handlers.get(eventType) ?? []).filter((h) => h !== handler);
        handlers.set(eventType, after);
      };
    },
    publish: <T>(eventType: string, ev: EngineEvent<T>) => {
      publishCount++;
      for (const h of handlers.get(eventType) ?? []) {
        h(ev as EngineEvent<unknown>);
      }
    },
  };

  let received = 0;
  const unsubscribe = bus.subscribe<{ n: number }>('tick', (ev) => {
    received += ev.payload.n;
  });
  bus.publish<{ n: number }>('tick', { eventId: 'e1', ctx, ts: 0, payload: { n: 1 } });
  bus.publish<{ n: number }>('tick', { eventId: 'e2', ctx, ts: 0, payload: { n: 2 } });
  unsubscribe();
  bus.publish<{ n: number }>('tick', { eventId: 'e3', ctx, ts: 0, payload: { n: 4 } });

  assert.equal(received, 3); // 1 + 2; the third event has no subscriber
  assert.equal(publishCount, 3);
});
