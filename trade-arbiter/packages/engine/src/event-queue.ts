/**
 * In-memory, single-producer/single-consumer queue. Ordering: ascending
 * `ts`, insertion-order tiebreaker for equal `ts`. A simple array with a
 * binary-search insert keeps the implementation dependency-free; the event
 * volume in v0.1 is well under the threshold where a heap would matter.
 *
 * Implements the `EventQueue` contract from core and adds `onDrain(cb)` as
 * an engine-internal extension so the bus can route each drained event to
 * its subscribers. The public `EventQueue` interface stays unchanged.
 */
import type { EngineEvent, EventQueue } from '@trade-arbiter/core';

interface Entry {
  ts: number;
  insertSeq: number;
  event: EngineEvent<unknown>;
}

export class InMemoryEventQueue implements EventQueue {
  private readonly entries: Entry[] = [];
  private insertSeq = 0;
  private running = false;
  private stopped = false;
  private drainHandler: ((ev: EngineEvent<unknown>) => void | Promise<void>) | null = null;

  enqueue(ev: EngineEvent<unknown>): void {
    const entry: Entry = { ts: ev.ts, insertSeq: this.insertSeq++, event: ev };
    // Binary search for insertion point keeping the array sorted by
    // (ts, insertSeq).
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const m = this.entries[mid];
      if (m === undefined) {
        throw new Error('InMemoryEventQueue: binary-search bounds violated');
      }
      if (m.ts < entry.ts || (m.ts === entry.ts && m.insertSeq < entry.insertSeq)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.entries.splice(lo, 0, entry);
  }

  onDrain(cb: (ev: EngineEvent<unknown>) => void | Promise<void>): void {
    this.drainHandler = cb;
  }

  async run(): Promise<void> {
    if (this.running) throw new Error('InMemoryEventQueue.run: already running');
    this.running = true;
    this.stopped = false;
    while (!this.stopped) {
      const next = this.entries.shift();
      if (next === undefined) {
        // Yield to the microtask queue, then re-check. If still empty and
        // not stopped, exit — caller is responsible for pre-enqueuing all
        // events in this v0.1 pull model.
        await Promise.resolve();
        if (this.stopped) break;
        if (this.entries.length === 0) break;
        continue;
      }
      if (this.drainHandler !== null) {
        await this.drainHandler(next.event);
      }
    }
    this.running = false;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  size(): number {
    return this.entries.length;
  }
}
