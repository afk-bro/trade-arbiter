/**
 * Strategy contracts. Strategies are pure logic — no I/O, no DB, no clock.
 * Section 4.7 of the design spec.
 */
import type { EngineClock, RunContext } from './context.js';
import type { MarketEvent } from './events.js';
import type { FillEvent, OrderEvent, OrderIntent } from './intents.js';
import type { PortfolioState } from './portfolio.js';
import type { StrategyId, Timestamp } from './primitives.js';

/**
 * Minimal structured logger. Each method takes a message and optional
 * key-value metadata. Implementations may forward to pino, console, or a
 * test recorder. Strategies receive a Logger via StrategyContext.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Everything the strategy gets at init time. The clock is the only legal
 * source of timestamps inside strategy code; the portfolio is pull-based
 * and immutable; emit() is the only way to produce intents.
 */
export interface StrategyContext {
  readonly clock: EngineClock;
  readonly ctx: RunContext;
  /** Pull-based, immutable snapshot. */
  portfolio(): Readonly<PortfolioState>;
  /** Validated against the strategy-specific zod schema before init. */
  readonly config: unknown;
  readonly logger: Logger;
  /** Submits an intent to the risk layer. Synchronous; no return value. */
  emit(intent: OrderIntent): void;
}

/**
 * The interface every strategy plug-in implements. `onOrderEvent` and
 * `onTick` are optional — simple strategies omit them.
 */
export interface Strategy {
  readonly id: StrategyId;
  init(sctx: StrategyContext): Promise<void>;
  onMarketEvent(event: MarketEvent): void;
  onFillEvent(event: FillEvent): void;
  onOrderEvent?(event: OrderEvent): void;
  /** Paces on the engine clock, not wall time. */
  onTick?(ts: Timestamp): void;
  shutdown(): Promise<void>;
}
