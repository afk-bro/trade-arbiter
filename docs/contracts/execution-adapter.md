# Execution Adapter Contract

- **Status:** draft
- **Owner:** <unassigned>
- **Last updated:** 2026-04-13
- **Source of truth:** <!-- link to `packages/core/src/adapters.ts` once it lands in Plan 4 -->

## Purpose

The Execution Adapter is the boundary between the engine and any venue that can fill an order. The engine produces validated `Order` objects and hands them off; the adapter is responsible for translating those into venue API calls and surfacing the results back as events. **Every venue gets its own adapter** (Polymarket, Kalshi, Binance, Hyperliquid, paper). The engine never imports a venue SDK directly — it only knows the contract.

This is the swap point that makes simulation, paper trading, and live trading interchangeable: the engine doesn't change when you flip from paper to live, only the adapter behind the contract does.

## Interface

<!--
Final shape will be locked in Plan 4 when the first adapter lands. Working sketch:

```ts
interface ExecutionAdapter {
  submitOrder(order: Order): Promise<ExecutionResult>;
  cancelOrder(orderId: OrderId): Promise<void>;
}
```

- `submitOrder` — accepts a fully-validated `Order` (already passed risk),
  returns an `ExecutionResult` describing acceptance or rejection.
  Subsequent fills arrive as `OrderEvent`s on the bus, not as a return value.
- `cancelOrder` — best-effort cancel by `orderId`. Returns when the venue
  has acknowledged the cancel request, not when the order is provably gone.
-->

## Guarantees

<!--
Working list — tighten as Plan 4 lands.

- `submitOrder` must return an `ExecutionResult` within X ms or throw
  `AdapterTimeoutError`. (X to be set per-venue based on observed p99.)
- Partial fills must be surfaced as multiple `OrderEvent.Fill` events
  with the same `orderId` and monotonic `timestamp`.
- Idempotency: the same `clientOrderId` submitted twice within the same
  process lifetime must produce **one** venue order. This protects
  against retries after network blips.
- Order events for a given `orderId` must arrive in causal order:
  Accepted → (PartialFill*) → (Filled | Cancelled | Rejected | Expired).
- The adapter must never silently drop an event. If it cannot deliver,
  it must raise to the engine and trip the kill switch.
-->

## Error handling

<!--
- **Rejection at submit time** — venue refused the order (insufficient
  funds, bad symbol, market closed). `ExecutionResult.status = 'rejected'`
  with a venue-specific reason. The engine treats this as terminal for
  that order; no retry.
- **Network errors at submit time** — adapter retries with exponential
  backoff up to N times, then throws `AdapterUnavailableError`. The
  caller (engine) decides whether to fail the order or keep trying.
- **Cancellation race** — if the order fills before the cancel reaches
  the venue, the adapter must surface the fill as normal. The cancel
  request silently no-ops.
- **Adapter crash recovery** — on restart, the adapter must reconcile
  open orders with the venue before accepting new ones. It must not
  blindly resubmit cached orders.
-->

## Lifecycle

<!--
- Constructed with venue credentials, a clock, and a reference to the
  event bus.
- `start()` opens any persistent connections (websockets, auth tokens)
  and begins streaming order events.
- `stop()` cancels all open orders if configured to, then closes
  connections. In-flight `submitOrder` calls must either complete or
  reject before `stop()` resolves.
- One adapter instance per (venue, account). Multiple instances of the
  same venue with different accounts are supported.
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
- Idempotency: duplicate `clientOrderId` produces one order
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
