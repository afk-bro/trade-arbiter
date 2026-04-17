/**
 * Pub/sub wrapper over InMemoryEventQueue. Tracks subscribers per event-type
 * string. Event-type strings are the engine's canonical topic names —
 * chosen by the engine orchestrator (e.g., 'market', 'intent', 'fill',
 * 'pnl', 'snapshot'). Free-form to avoid coupling the contract to a
 * specific enum; iteration order is insertion order.
 */
import type { EngineEvent, EventBus } from '@trade-arbiter/core';
import type { InMemoryEventQueue } from './event-queue.js';

type Handler = (ev: EngineEvent<unknown>) => void | Promise<void>;

export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Handler[]>();
  private readonly envelopeType = new WeakMap<EngineEvent<unknown>, string>();
  private readonly queue: InMemoryEventQueue;

  constructor(queue: InMemoryEventQueue) {
    this.queue = queue;
    queue.onDrain(async (ev) => {
      const type = this.envelopeType.get(ev);
      if (type === undefined) return;
      const handlers = this.subscribers.get(type);
      if (handlers === undefined) return;
      for (const h of handlers) {
        await h(ev);
      }
    });
  }

  subscribe<T>(
    eventType: string,
    handler: (ev: EngineEvent<T>) => void | Promise<void>,
  ): () => void {
    const list = this.subscribers.get(eventType) ?? [];
    list.push(handler as Handler);
    this.subscribers.set(eventType, list);
    return () => {
      const current = this.subscribers.get(eventType);
      if (current === undefined) return;
      const idx = current.indexOf(handler as Handler);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  publish<T>(eventType: string, ev: EngineEvent<T>): void {
    this.envelopeType.set(ev as EngineEvent<unknown>, eventType);
    this.queue.enqueue(ev as EngineEvent<unknown>);
  }
}
