/**
 * PortfolioUpdater applies fills to a running PortfolioState and emits a
 * PnlEvent per fill. Tracks per-instrument position (qty, avgCost),
 * realized PnL (cumulative), and the last-seen mark price for unrealized
 * PnL.
 *
 * Mark source in Plan 2: caller updates via updateMark(key, price) whenever
 * a QuoteEvent (mid) or TradeEvent (price) is seen. If no mark is known
 * for an open position, unrealizedPnl contribution is 0 for that leg.
 *
 * Realized PnL formula (spec section "PnL semantics (v0.1)"):
 *   closing fill: realizedDelta = (fillPrice − avgEntry) × closingSize × closingSign − feesPaid
 *   opening fill: realizedDelta = −feesPaid (fees realize immediately)
 *
 * Out of scope (spec): slippage, partial-fill realism, funding, borrow costs.
 */
import type {
  FillEvent,
  PnlEvent,
  PortfolioState,
  PositionState,
  Side,
  Symbol as InstrumentSymbol,
  Timestamp,
  Venue,
} from '@trade-arbiter/core';

function key(venue: Venue, symbol: InstrumentSymbol): string {
  return `${venue}:${symbol}:`;
}

interface MutablePosition {
  venue: Venue;
  symbol: InstrumentSymbol;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  markPrice: number | null;
}

// Ctx used when getPortfolio is called outside the orchestrator. The
// orchestrator rebinds ctx via structural spread before publishing.
const PLACEHOLDER_CTX = {
  runId: '00000000000000000000000000',
  strategyId: 'unbound',
  configHash: 'unbound',
  mode: 'backtest_l1',
} as const;

export class PortfolioUpdater {
  private readonly positions = new Map<string, MutablePosition>();
  private realizedCumulative = 0;
  private cash: number;
  private readonly initialCash: number;
  private readonly currency: string;

  constructor(initialCash: number, currency: string) {
    this.cash = initialCash;
    this.initialCash = initialCash;
    this.currency = currency;
  }

  updateMark(positionKey: string, price: number): void {
    const pos = this.positions.get(positionKey);
    if (pos === undefined) return;
    pos.markPrice = price;
  }

  onFill(fill: FillEvent): PnlEvent {
    return this.onFillDirected(fill, 'buy');
  }

  onFillDirected(fill: FillEvent, side: Side): PnlEvent {
    const pk = key(fill.venue, fill.symbol);
    if (fill.filledSize <= 0) {
      return this.makePnlEvent(fill, 0, pk);
    }

    const pos = this.positions.get(pk) ?? {
      venue: fill.venue,
      symbol: fill.symbol,
      qty: 0,
      avgCost: 0,
      realizedPnl: 0,
      markPrice: null,
    };
    const signedFillQty = side === 'buy' ? fill.filledSize : -fill.filledSize;
    const sameDirection = pos.qty === 0 || Math.sign(pos.qty) === Math.sign(signedFillQty);

    let realizedDelta = fill.feesPaid === 0 ? 0 : -fill.feesPaid;

    if (sameDirection) {
      const newQty = pos.qty + signedFillQty;
      const newAvgCost = newQty === 0
        ? 0
        : (pos.qty * pos.avgCost + signedFillQty * fill.avgPrice) / newQty;
      pos.qty = newQty;
      pos.avgCost = newAvgCost;
    } else {
      const closingSize = Math.min(Math.abs(signedFillQty), Math.abs(pos.qty));
      const closingSign = pos.qty > 0 ? 1 : -1;
      realizedDelta += (fill.avgPrice - pos.avgCost) * closingSize * closingSign;
      const remainingOpposite = Math.abs(signedFillQty) - closingSize;
      if (remainingOpposite > 0) {
        // Position flips through zero: new position opens at fill price.
        pos.qty = Math.sign(signedFillQty) * remainingOpposite;
        pos.avgCost = fill.avgPrice;
      } else {
        pos.qty = pos.qty + signedFillQty;
        if (pos.qty === 0) pos.avgCost = 0;
      }
    }

    pos.realizedPnl += realizedDelta;
    this.realizedCumulative += realizedDelta;
    this.cash += realizedDelta;
    this.positions.set(pk, pos);

    return this.makePnlEvent(fill, realizedDelta, pk);
  }

  getPortfolio(ts: Timestamp): PortfolioState {
    const out = new Map<string, PositionState>();
    let unrealizedTotal = 0;
    for (const [k, p] of this.positions) {
      const unreal = p.markPrice !== null ? (p.markPrice - p.avgCost) * p.qty : 0;
      unrealizedTotal += unreal;
      out.set(k, {
        venue: p.venue,
        symbol: p.symbol,
        qty: p.qty,
        avgCost: p.avgCost,
        realizedPnl: p.realizedPnl,
        unrealizedPnl: unreal,
      });
    }
    return {
      ctx: PLACEHOLDER_CTX,
      ts,
      cashUsd: this.cash,
      positions: out,
      equity: this.cash + unrealizedTotal,
      dayStartEquity: this.initialCash,
    };
  }

  currentRealizedCumulative(): number {
    return this.realizedCumulative;
  }

  snapshotPositionsForPnlSnapshot(): ReadonlyArray<{
    symbol: InstrumentSymbol;
    qty: number;
    avgEntry: number;
    markPrice: number;
  }> {
    const out: Array<{ symbol: InstrumentSymbol; qty: number; avgEntry: number; markPrice: number }> = [];
    for (const p of this.positions.values()) {
      if (p.qty === 0) continue;
      out.push({
        symbol: p.symbol,
        qty: p.qty,
        avgEntry: p.avgCost,
        markPrice: p.markPrice ?? p.avgCost,
      });
    }
    return out;
  }

  totalUnrealized(): number {
    let total = 0;
    for (const p of this.positions.values()) {
      if (p.markPrice === null) continue;
      total += (p.markPrice - p.avgCost) * p.qty;
    }
    return total;
  }

  getCurrency(): string {
    return this.currency;
  }

  private makePnlEvent(fill: FillEvent, realizedDelta: number, pk: string): PnlEvent {
    const pos = this.positions.get(pk);
    const unrealized = (pos !== undefined && pos.markPrice !== null)
      ? (pos.markPrice - pos.avgCost) * pos.qty
      : 0;
    return {
      type: 'pnl',
      strategyId: fill.ctx.strategyId,
      symbol: fill.symbol,
      realizedDelta,
      realizedCumulative: this.realizedCumulative,
      unrealizedMark: unrealized,
      currency: this.currency,
      triggeredBy: 'fill',
    };
  }
}
