/**
 * Base scalar types and runtime constants shared by every contract.
 * Section 4.1 of the design spec.
 */

/** Engine-wide canonical timestamp: epoch milliseconds. */
export type Timestamp = number;

/** ULID assigned per run. */
export type RunId = string;

/** Stable identifier for a strategy instance, e.g. `hedged-btc-15m`. */
export type StrategyId = string;

/** sha256 of the resolved YAML config, computed at load. */
export type ConfigHash = string;

/**
 * Venue-native instrument symbol. Opaque string.
 *
 * NOTE: this name shadows the global `Symbol` constructor when imported
 * unqualified. Downstream packages should alias on import:
 * `import type { Symbol as InstrumentSymbol } from '@trade-arbiter/core';`
 */
export type Symbol = string;

/** Execution mode of a run. Strategies are blind to this — see Rule 1. */
export type Mode = 'backtest_l1' | 'backtest_l2' | 'paper' | 'live';

/** Venues supported across v1 and v2. */
export type Venue = 'polymarket' | 'kalshi' | 'binance' | 'hyperliquid';

/** Order side. */
export type Side = 'buy' | 'sell';

/**
 * Outcome token for binary prediction markets.
 *
 * Fields typed as `outcome?: OutcomeToken` use ABSENCE (`undefined`) as the
 * single sentinel for non-binary venues (futures, perps). There is no `null`
 * variant — that would introduce two indistinguishable representations of
 * "no outcome".
 */
export type OutcomeToken = 'YES' | 'NO';

/**
 * Runtime list of every Mode in declaration order. Used by config validators
 * and by tests that want to enumerate modes.
 */
export const MODES = [
  'backtest_l1',
  'backtest_l2',
  'paper',
  'live',
] as const satisfies readonly Mode[];

/**
 * Runtime list of every Venue. Order is not load-bearing.
 */
export const VENUES = [
  'polymarket',
  'kalshi',
  'binance',
  'hyperliquid',
] as const satisfies readonly Venue[];
