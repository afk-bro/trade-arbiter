/**
 * Risk manager, rule, decision, and state contracts.
 * Section 4.10 of the design spec.
 *
 * Concrete rule implementations (KillSwitchRule, LiveArmRule, BalanceRule,
 * HardCapsRule, DailyLossRule, CircuitBreakerRule, KellySizingRule,
 * MaxOrderSizeRule) live in the engine package and are added in Plan 2.
 * The fixed rule ordering is also enforced in engine, not core.
 */
import type { RunContext } from './context.js';
import type { FillEvent, OrderIntent } from './intents.js';
import type { PortfolioState } from './portfolio.js';
import type { StrategyId, Timestamp, Venue } from './primitives.js';

/**
 * One rule's verdict on one intent. `size` is always explicit (0 if rejected),
 * `reason` is always present so the persisted audit row never has a null reason.
 */
export interface RiskCheck {
  readonly pass: boolean;
  readonly size: number;
  readonly reason: string;
}

/**
 * A single risk rule. Rules are pure functions of (intent, portfolio, state).
 * They do not mutate anything — the RiskManager composes them and produces
 * a single RiskDecision.
 */
export interface RiskRule {
  readonly id: string;
  check(
    intent: OrderIntent,
    portfolio: Readonly<PortfolioState>,
    state: Readonly<RiskState>,
  ): RiskCheck;
}

/**
 * The persisted output of a single rule pipeline run. One row per intent,
 * regardless of how many rules ran. `reason` is the first-rejecting rule's
 * reason, or `'ok'` if every rule passed.
 */
export interface RiskDecision {
  readonly decisionId: string;
  readonly ctx: RunContext;
  readonly intentId: string;
  readonly approved: boolean;
  readonly sizeApproved: number;
  readonly reason: string;
  readonly ts: Timestamp;
}

/**
 * Engine-wide kill-switch state. Mutated only by the KillSwitchController
 * (introduced in Plan 6). Once active, RiskManager.check() rejects every
 * intent regardless of the rest of the pipeline.
 */
export interface KillSwitchState {
  active: boolean;
  triggeredBy: 'user' | 'risk_rule' | 'system_error' | null;
  reason: string;
  triggeredAt: Timestamp | null;
}

/**
 * Aggregate risk state passed to every rule. Owned by the RiskManager;
 * rules read it but never write to it.
 */
export interface RiskState {
  killSwitch: KillSwitchState;
  /** When the current trading day began. */
  dayStartTs: Timestamp;
  /** Running realized P&L since dayStartTs. */
  realizedPnlToday: number;
  /** Resets to 0 on any winning trade. */
  consecutiveLosses: number;
  circuitBreakerTrippedAt: Timestamp | null;
  /** Strategy → open position value in USD. */
  strategyExposureUsd: ReadonlyMap<StrategyId, number>;
  /** Venue → total exposure in USD. */
  venueExposureUsd: ReadonlyMap<Venue, number>;
}

/**
 * The risk manager composes all rules in fixed order, short-circuits on
 * first rejection, and persists the resulting RiskDecision. It also owns
 * the RiskState updates triggered by fills.
 */
export interface RiskManager {
  check(intent: OrderIntent, portfolio: Readonly<PortfolioState>): RiskDecision;
  onFill(fill: FillEvent): void;
  isKilled(): boolean;
}
