/**
 * EventQueue and EventBus contracts.
 * Section 4.11 of the design spec.
 *
 * The flow is: publish() hands the event to enqueue(); run() drains the
 * queue one event at a time, and on each pop the bus dispatches that event
 * to its subscribers. EventQueue owns ordering, EventBus owns routing.
 * No path from a subscriber back to another subscriber bypasses the queue.
 */
import type { EngineEvent } from './events.js';

export interface EventQueue {
  enqueue(ev: EngineEvent<unknown>): void;
  /** Drains the queue sequentially until stop() is called. */
  run(): Promise<void>;
  stop(): Promise<void>;
  size(): number;
}

export interface EventBus {
  subscribe<T>(
    eventType: string,
    handler: (ev: EngineEvent<T>) => void | Promise<void>,
  ): () => void;
  /** Enqueues onto the underlying EventQueue. */
  publish<T>(eventType: string, ev: EngineEvent<T>): void;
}
