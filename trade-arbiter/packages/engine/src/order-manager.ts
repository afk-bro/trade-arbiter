/**
 * DefaultOrderManager. Keeps an intent-keyed map of OrderLineage and an
 * open-orders view derived from the lineage status. Timeouts are a Plan 7
 * concern — `tickTimeouts()` is a no-op here.
 *
 * This manager does NOT generate requestIds. The engine orchestrator does
 * that before calling `onIntent()`, keeping rule-approval and ID assignment
 * adjacent (both read from the same per-run IdGen).
 */
import type {
  FillEvent,
  OrderEvent,
  OrderIntent,
  OrderLineage,
  OrderManager,
  OrderRequest,
  OrderStatus,
  Timestamp,
} from '@trade-arbiter/core';

interface MutableLineage {
  intent: OrderIntent;
  requests: OrderRequest[];
  fills: FillEvent[];
  events: OrderEvent[];
  status: OrderStatus;
  remainingSize: number;
}

const TERMINAL_STATUSES: ReadonlySet<OrderStatus> = new Set<OrderStatus>([
  'filled',
  'cancelled',
  'rejected',
  'expired',
]);

export class DefaultOrderManager implements OrderManager {
  private readonly byIntent = new Map<string, MutableLineage>();
  private readonly byRequest = new Map<string, string>();

  onIntent(intent: OrderIntent, request: OrderRequest): void {
    const existing = this.byIntent.get(intent.intentId);
    if (existing !== undefined) {
      existing.requests.push(request);
      this.byRequest.set(request.requestId, intent.intentId);
      return;
    }
    this.byIntent.set(intent.intentId, {
      intent,
      requests: [request],
      fills: [],
      events: [],
      status: 'pending',
      remainingSize: request.sizeApproved,
    });
    this.byRequest.set(request.requestId, intent.intentId);
  }

  onFill(fill: FillEvent): void {
    const intentId = this.byRequest.get(fill.requestId);
    if (intentId === undefined) return;
    const lin = this.byIntent.get(intentId);
    if (lin === undefined) return;
    lin.fills.push(fill);
    lin.remainingSize = fill.remainingSize;
    lin.status = fill.status === 'filled' ? 'filled'
      : fill.status === 'partial' ? 'partially_filled'
      : fill.status === 'rejected' ? 'rejected'
      : fill.status === 'cancelled' ? 'cancelled'
      : 'expired';
  }

  onOrderEvent(ev: OrderEvent): void {
    const intentId = this.byRequest.get(ev.requestId);
    if (intentId === undefined) return;
    const lin = this.byIntent.get(intentId);
    if (lin === undefined) return;
    lin.events.push(ev);
    lin.status = ev.status;
    lin.remainingSize = ev.remainingSize;
  }

  getOpenOrders(): ReadonlyArray<OrderRequest> {
    const out: OrderRequest[] = [];
    for (const lin of this.byIntent.values()) {
      if (TERMINAL_STATUSES.has(lin.status)) continue;
      for (const req of lin.requests) out.push(req);
    }
    return out;
  }

  getLineage(intentId: string): OrderLineage {
    const lin = this.byIntent.get(intentId);
    if (lin === undefined) {
      throw new Error(`DefaultOrderManager.getLineage: no intent '${intentId}'`);
    }
    return {
      intent: lin.intent,
      requests: lin.requests.slice(),
      fills: lin.fills.slice(),
      events: lin.events.slice(),
      status: lin.status,
      remainingSize: lin.remainingSize,
    };
  }

  tickTimeouts(_now: Timestamp): void {
    // Plan 7 adds timeout policy; intentional no-op here.
  }
}
