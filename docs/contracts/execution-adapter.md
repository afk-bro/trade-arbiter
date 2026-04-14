# Execution Adapter Contract

- **Status:** draft
- **Owner:** <unassigned>
- **Last updated:** 2026-04-13
- **Source of truth:** [`trade-arbiter/packages/core/src/adapter.ts`](../../trade-arbiter/packages/core/src/adapter.ts) — interface shipped in Plan 1; first implementation lands in Plan 4

## Purpose

The Execution Adapter is the boundary between the engine and any venue that can fill an order. The engine produces validated `OrderRequest`s and hands them off; the adapter is responsible for translating those into venue API calls and surfacing the results back as `FillEvent`s and `OrderEvent`s through registered callbacks. **Every venue gets its own adapter** (Polymarket, Kalshi, Binance, Hyperliquid, paper). The engine never imports a venue SDK directly — it only knows the contract.

This is the swap point that makes simulation, paper trading, and live trading interchangeable: the engine doesn't change when you flip from paper to live, only the adapter behind the contract does.

## Interface

The interface type itself shipped in Plan 1. The signature below is copied from `packages/core/src/adapter.ts` — when the source changes, update this block to match.

```ts
interface ExecutionAdapter {
  readonly venue: Venue;
  readonly mode: Mode;
  connect(): Promise<void>;
  submit(req: OrderRequest): Promise<{ requestId: string }>;
  cancel(requestId: string): Promise<void>;
  onFill(cb: (fill: FillEvent) => void): void;
  onOrderEvent(cb: (ev: OrderEvent) => void): void;
  disconnect(): Promise<void>;
}
```

- `venue` / `mode` — identity fields. One adapter instance is bound to one (venue, mode) pair.
- `connect()` — open any persistent connections (websocket, auth, session). Must complete before `submit()` is called.
- `submit(req)` — accept a fully-validated `OrderRequest` (already passed risk). The promise resolves once the request is in flight (handed off to the venue or the simulator's internal book), giving callers an ergonomic await point. The resolved `requestId` is the engine-assigned id, echoed back.
- `cancel(requestId)` — best-effort cancel by engine-assigned `requestId`. Live adapters maintain their own `engineRequestId → venueOrderId` mapping internally. Returns when the venue has acknowledged the cancel request, not when the order is provably gone.
- `onFill(cb)` / `onOrderEvent(cb)` — register callbacks for streamed fill and order-state events. Adapters surface fills and state transitions through these callbacks; the engine forwards them onto the bus.
- `disconnect()` — close connections cleanly. In-flight `submit()` calls must either complete or reject before this resolves.

**`requestId` ownership:** assigned by the OrderManager *before* `submit()` is called. The adapter accepts and echoes it back. Live adapters that need a venue-native id maintain their own `engineRequestId → venueOrderId` mapping internally but always surface the engine's `requestId` on `FillEvent` and `OrderEvent`.

## Guarantees

Working list — tighten as Plan 4 lands the first implementation.

- `submit()` must resolve or reject within X ms. (X to be set per-venue based on observed p99.) A hung `submit()` is a kill-switch event.
- Partial fills must be surfaced as multiple `FillEvent`s on the `onFill` callback with the same `requestId` and monotonic `timestamp`.
- **Idempotency:** the same `requestId` submitted twice within the same process lifetime must produce **one** venue order. This protects against retries after network blips.
- Events for a given `requestId` must arrive in causal order: Accepted → (PartialFill*) → (Filled | Cancelled | Rejected | Expired).
- The adapter must never silently drop a fill or order event. If a callback throws, the adapter must raise to the engine and trip the kill switch — fills are not allowed to disappear.

## Error handling

<!--
- **Rejection at submit time** — venue refused the order (insufficient
  funds, bad symbol, market closed). The `submit()` promise rejects with
  a venue-tagged error, OR the adapter resolves `submit()` and emits a
  `Rejected` `OrderEvent` on the `onOrderEvent` callback. Pick one and
  document it; do not allow both shapes.
- **Network errors at submit time** — adapter retries with exponential
  backoff up to N times, then rejects `submit()` with
  `AdapterUnavailableError`. The caller (engine) decides whether to
  fail the order or keep trying.
- **Cancellation race** — if the order fills before the cancel reaches
  the venue, the adapter must surface the fill as normal. The cancel
  request silently no-ops.
- **Adapter crash recovery** — on restart, the adapter must reconcile
  open orders with the venue (during `connect()`) before accepting new
  ones. It must not blindly resubmit cached orders.
-->

## Lifecycle

<!--
- Constructed with venue credentials and a clock. The engine wires up
  fill/event delivery via `onFill()` / `onOrderEvent()` after construction;
  the adapter does not hold a direct reference to the bus.
- `connect()` opens persistent connections (websockets, auth tokens)
  and begins streaming order events. Must be called before `submit()`.
- `disconnect()` cancels all open orders if configured to, then closes
  connections. In-flight `submit()` calls must either complete or reject
  before `disconnect()` resolves.
- One adapter instance per (venue, mode) — and per account when an
  account dimension exists. Multiple instances of the same venue with
  different accounts are supported.
-->

## Implementations

<!--
- `paper` — in-process simulator. Reference implementation. (Plan 4)
- `polymarket` — TBD
- `kalshi` — TBD
- `binance` — TBD
- `hyperliquid` — TBD
-->

## Testability

<!--
The contract test suite lives at `packages/core/test/contracts/execution-adapter.contract.test.ts`
(planned). Every adapter implementation imports the suite and runs it
against itself. The suite covers:

- Happy path: submit → accepted → fill → terminal event
- Idempotency: duplicate `requestId` produces one order
- Partial fill ordering
- Cancel before fill, cancel after fill (race)
- Reject at submit
- Network unavailable retry behavior
- Reconciliation on restart

The paper adapter is the reference implementation that the suite is
authored against.
-->

## Related

<!--
- [../architecture.md](../architecture.md) — where the adapter sits in the system
- ADRs about idempotency and reconciliation strategy (TBD)
- Plan 4: First venue adapter (paper)
-->

## Change log

- 2026-04-13 — initial draft (skeleton only, no implementation yet)
