/**
 * OrderManager and OrderLineage contracts.
 * Section 4.12 of the design spec.
 *
 * The OrderManager sits between Risk and Execution on the submit path
 * and between Execution and Strategies on the feedback path. It is the
 * single source of truth for "what's in flight right now".
 */
import type {
  FillEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  OrderStatus,
} from './intents.js';
import type { Timestamp } from './primitives.js';

/**
 * Aggregated lineage of one intent: every approved request, every fill,
 * every lifecycle event, and the current rolled-up status.
 */
export interface OrderLineage {
  readonly intent: OrderIntent;
  readonly requests: ReadonlyArray<OrderRequest>;
  readonly fills: ReadonlyArray<FillEvent>;
  readonly events: ReadonlyArray<OrderEvent>;
  readonly status: OrderStatus;
  readonly remainingSize: number;
}

export interface OrderManager {
  /** Called when a risk-approved request enters the manager. */
  onIntent(intent: OrderIntent, request: OrderRequest): void;
  onFill(fill: FillEvent): void;
  onOrderEvent(ev: OrderEvent): void;
  getOpenOrders(): ReadonlyArray<OrderRequest>;
  getLineage(intentId: string): OrderLineage;
  /** Called by the orchestrator on a clock tick to expire stuck orders. */
  tickTimeouts(now: Timestamp): void;
}
