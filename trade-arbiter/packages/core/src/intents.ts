/**
 * Strategy intent → risk-approved request → execution lifecycle → fill.
 * Section 4.5 of the design spec.
 */
import type { RunContext } from './context.js';
import type { OutcomeToken, Side, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * Optional metadata attached to an intent that the risk layer (specifically
 * KellySizingRule) can consume. Strategies that have an analytical edge model
 * fill this in; strategies that do not, omit it.
 */
export interface StrategySignalMeta {
  /** Expected price edge in venue units, e.g. 0.03 = 3c on a $1 binary. */
  readonly expectedEdge?: number;
  readonly variance?: number;
  /** Confidence in [0, 1]. */
  readonly confidence?: number;
}

/**
 * The only thing a strategy can emit. Carries enough information for the
 * risk layer to evaluate it and for the order manager to track its lineage.
 */
export interface OrderIntent {
  /** Strategy-generated; idempotent so retries do not duplicate. */
  readonly intentId: string;
  readonly ctx: RunContext;
  readonly tsCreated: Timestamp;
  readonly venue: Venue;
  readonly symbol: Symbol;
  /** Required for binary prediction markets, omitted for non-binary venues. */
  readonly outcome?: OutcomeToken;
  readonly side: Side;
  readonly sizeRequested: number;
  /** Limit price; omit for market orders. */
  readonly priceLimit?: number;
  readonly timeInForce: 'GTC' | 'IOC' | 'FOK' | 'FAK';
  /** Free-text reason emitted by the strategy; ends up in audit rows. */
  readonly reason: string;
  /** Strategy-defined tags. `signalMeta` is the only key the engine reads. */
  readonly tags?: {
    readonly signalMeta?: StrategySignalMeta;
    readonly [key: string]: unknown;
  };
}

/**
 * An OrderIntent that the risk manager has approved (possibly with a reduced
 * size) and that the OrderManager has assigned a `requestId` to. The
 * `requestId` is the engine's canonical identifier for the rest of the
 * order's lifecycle — venues that need their own native id maintain a
 * mapping internally.
 */
export interface OrderRequest extends OrderIntent {
  /** ULID assigned by the OrderManager before submission. */
  readonly requestId: string;
  readonly sizeApproved: number;
  readonly riskDecisionId: string;
  /** Lineage pointer for splits / hedges / slices. */
  readonly parentIntentId?: string;
}

/** Order lifecycle states. */
export type OrderStatus =
  | 'pending'
  | 'open'
  | 'partially_filled'
  | 'filled'
  | 'cancelled'
  | 'rejected'
  | 'expired';

export const ORDER_STATUSES = [
  'pending',
  'open',
  'partially_filled',
  'filled',
  'cancelled',
  'rejected',
  'expired',
] as const satisfies readonly OrderStatus[];

/**
 * Lifecycle transition emitted by an execution adapter. Distinct from a
 * FillEvent: an OrderEvent records *status*, a FillEvent records *quantity*.
 * Most fills produce both.
 */
export interface OrderEvent {
  readonly requestId: string;
  readonly intentId: string;
  readonly ctx: RunContext;
  readonly status: OrderStatus;
  readonly remainingSize: number;
  readonly ts: Timestamp;
  readonly reason?: string;
}

export type FillStatus = 'partial' | 'filled' | 'rejected' | 'cancelled' | 'expired';

export const FILL_STATUSES = [
  'partial',
  'filled',
  'rejected',
  'cancelled',
  'expired',
] as const satisfies readonly FillStatus[];

/**
 * Quantity-bearing fill record. Always carries both the engine-side
 * `tsReceived` and the venue-side `tsExchange` for ordering.
 */
export interface FillEvent {
  readonly fillId: string;
  readonly intentId: string;
  readonly requestId: string;
  readonly ctx: RunContext;
  readonly venue: Venue;
  readonly symbol: Symbol;
  readonly tsExchange: Timestamp;
  readonly tsReceived: Timestamp;
  readonly status: FillStatus;
  readonly filledSize: number;
  readonly remainingSize: number;
  readonly avgPrice: number;
  readonly feesPaid: number;
  readonly reason?: string;
}
