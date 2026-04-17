/**
 * Deterministic clock for backtest runs. Advances only when the engine
 * processes an event with a later `tsExchange`. Strategies and risk rules
 * read via the EngineClock interface; they never see system time.
 */
import type { EngineClock, Mode, Timestamp } from '@trade-arbiter/core';

export class BacktestClock implements EngineClock {
  readonly mode: Mode;
  private ts: Timestamp;

  constructor(mode: Mode, seedTs: Timestamp) {
    if (mode !== 'backtest_l1' && mode !== 'backtest_l2') {
      throw new Error(`BacktestClock cannot run in mode '${mode}'`);
    }
    this.mode = mode;
    this.ts = seedTs;
  }

  now(): Timestamp {
    return this.ts;
  }

  advance(ts: Timestamp): void {
    if (ts < this.ts) {
      throw new Error(
        `BacktestClock: refusing to move backwards from ${this.ts} to ${ts}`,
      );
    }
    this.ts = ts;
  }
}
