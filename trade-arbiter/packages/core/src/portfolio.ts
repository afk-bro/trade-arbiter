/**
 * Portfolio and position state contracts.
 * Section 4.6 of the design spec.
 */
import type { RunContext } from './context.js';
import type { OutcomeToken, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * One position. `qty` is signed: positive for long, negative for short.
 * For binary prediction markets `outcome` distinguishes YES from NO sides
 * of the same market; for non-binary venues `outcome` is omitted. Absence
 * (`undefined`) is the only sentinel for "non-binary"; there is no `null`
 * variant.
 */
export interface PositionState {
  readonly venue: Venue;
  readonly symbol: Symbol;
  readonly outcome?: OutcomeToken;
  readonly qty: number;
  readonly avgCost: number;
  readonly realizedPnl: number;
  readonly unrealizedPnl: number;
}

/**
 * Snapshot of portfolio state at a point in time.
 *
 * Strategies receive this via `StrategyContext.portfolio()` which returns
 * `Readonly<PortfolioState>`. The `positions` map is intentionally typed as
 * `ReadonlyMap` so consumers cannot mutate it through the snapshot. The
 * map key is `${venue}:${symbol}:${outcome ?? ''}`.
 */
export interface PortfolioState {
  readonly ctx: RunContext;
  readonly ts: Timestamp;
  readonly cashUsd: number;
  readonly positions: ReadonlyMap<string, PositionState>;
  readonly equity: number;
  readonly dayStartEquity: number;
}
