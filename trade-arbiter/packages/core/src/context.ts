/**
 * Run identification and clock contracts.
 * Sections 4.1 and 4.2 of the design spec.
 */
import type { ConfigHash, Mode, RunId, StrategyId, Timestamp } from './primitives.js';

/**
 * Identifies the run a given event/intent/decision belongs to. Every event
 * envelope and every persisted row carries one of these.
 */
export interface RunContext {
  readonly runId: RunId;
  readonly strategyId: StrategyId;
  readonly configHash: ConfigHash;
  readonly mode: Mode;
}

/**
 * Time authority for the engine. WallClock in paper/live, BacktestClock in
 * replay. Strategies receive the clock via StrategyContext and MUST NOT call
 * `Date.now()` or `new Date()` directly — see Rule 4 (deterministic event loop).
 */
export interface EngineClock {
  readonly mode: Mode;
  now(): Timestamp;
}
