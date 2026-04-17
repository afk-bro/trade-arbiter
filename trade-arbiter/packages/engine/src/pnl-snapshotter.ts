/**
 * Clock-driven PnL snapshot emitter. Caller invokes `maybeEmit(now)` whenever
 * the engine clock advances; returns a PnlSnapshot if the elapsed time since
 * last emit is >= intervalMs, else null. Internal state: just the last
 * emitted timestamp. No timers, no wall-clock reads.
 */
import type { PnlSnapshot, StrategyId, Timestamp } from '@trade-arbiter/core';
import type { PortfolioUpdater } from './portfolio-updater.js';

export class PnlSnapshotter {
  private lastEmittedTs: Timestamp;

  constructor(
    private readonly portfolio: PortfolioUpdater,
    private readonly strategyId: StrategyId,
    private readonly intervalMs: number,
    startTs: Timestamp,
  ) {
    this.lastEmittedTs = startTs;
  }

  maybeEmit(now: Timestamp): PnlSnapshot | null {
    if (now - this.lastEmittedTs < this.intervalMs) return null;
    this.lastEmittedTs = now;
    return {
      type: 'pnl_snapshot',
      strategyId: this.strategyId,
      positions: this.portfolio.snapshotPositionsForPnlSnapshot(),
      realizedCumulative: this.portfolio.currentRealizedCumulative(),
      unrealizedTotal: this.portfolio.totalUnrealized(),
      currency: this.portfolio.getCurrency(),
    };
  }
}
