/**
 * DefaultRiskManager. Composes RiskRules in declaration order, short-circuits
 * on first rejection. `sizeApproved` for an accepted decision is the minimum
 * of `intent.sizeRequested` and every passing rule's returned `size`.
 *
 * Concrete rules (KillSwitchRule, HardCapsRule, LiveArmRule, etc.) live in
 * their own plans and plug in as a `ReadonlyArray<RiskRule>`.
 *
 * Plan 2's `onFill()` is intentionally a no-op. State updates
 * (`realizedPnlToday`, `consecutiveLosses`, exposure accounting) land with
 * the rules that consume them in Plan 7. The interface is wired now so
 * later plans don't re-plumb.
 */
import type {
  FillEvent,
  OrderIntent,
  PortfolioState,
  RiskDecision,
  RiskManager,
  RiskRule,
  RiskState,
  Timestamp,
} from '@trade-arbiter/core';
import type { IdGen } from './id-gen.js';

export class DefaultRiskManager implements RiskManager {
  constructor(
    private readonly rules: ReadonlyArray<RiskRule>,
    private readonly state: RiskState,
    private readonly ids: IdGen,
    private readonly now: () => Timestamp,
  ) {}

  check(intent: OrderIntent, portfolio: Readonly<PortfolioState>): RiskDecision {
    let approvedSize = intent.sizeRequested;
    for (const rule of this.rules) {
      const result = rule.check(intent, portfolio, this.state);
      if (!result.pass) {
        return {
          decisionId: this.ids.next(),
          ctx: intent.ctx,
          intentId: intent.intentId,
          approved: false,
          sizeApproved: 0,
          reason: result.reason,
          ts: this.now(),
        };
      }
      if (result.size < approvedSize) approvedSize = result.size;
    }
    return {
      decisionId: this.ids.next(),
      ctx: intent.ctx,
      intentId: intent.intentId,
      approved: true,
      sizeApproved: approvedSize,
      reason: 'ok',
      ts: this.now(),
    };
  }

  onFill(_fill: FillEvent): void {
    // Plan 7 wires state updates; intentional no-op here.
  }

  isKilled(): boolean {
    return this.state.killSwitch.active;
  }
}
