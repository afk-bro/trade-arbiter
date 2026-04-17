# Roadmap Revision + Backtest Vertical Slice — Design

- **Date:** 2026-04-17
- **Status:** proposed
- **Author:** afk-bro (with Claude)
- **Related:**
  - [`../../polymarket-bot-comparison.md`](../../polymarket-bot-comparison.md) — the comparison that surfaced the 8 improvements this design integrates
  - [`2026-04-12-trade-arbiter-design.md`](2026-04-12-trade-arbiter-design.md) — foundational design spec (Section 4 contract surface)
  - [`../../roadmap.md`](../../roadmap.md) — the roadmap this design rewrites
  - [`../../prd/0001-core-contracts-and-monorepo-scaffold.md`](../../prd/0001-core-contracts-and-monorepo-scaffold.md) — Plan 1 retro PRD

## Problem

The polymarket-bot comparison (2026-04-16) surfaced eight improvements worth
integrating into trade-arbiter. Those improvements span three different layers:
contract-surface additions (market lifecycle, settlement, PnL events), plan
sequencing (ship a concrete strategy sooner), and runtime concerns (WebSocket
resilience, audit logging, rate limiting, simulation-safe defaults). Slotting
them in one by one through the existing roadmap would produce 12+ small plans
with no coherent first milestone.

Separately, the operator wants confidence that the foundations are in place
before the roadmap broadens. Plan 1 shipped pure type contracts; nothing yet
proves they wire up into a runnable engine. A single well-defined milestone —
"green end-to-end backtest" — would validate the foundations and give every
later plan a known-good baseline to extend.

This design does two things:

1. **Rewrites the roadmap** to sequence the 8 improvements into the plans that
   naturally own them, rather than inserting new plans for each.
2. **Defines the vertical slice** (Plans 2 and 3) that reaches the
   backtest-green milestone, including the contract additions, component
   shapes, data flow, and acceptance criteria.

## Goals

- **G1.** Every improvement from the comparison doc lands in a specific plan.
  Nothing is dropped silently.
- **G2.** A green end-to-end backtest (milestone **v0.1**) is reachable in
  exactly two plans from today (Plans 2 + 3). No other plan gates it.
- **G3.** Plan 1's shipped contract surface stays intact. Contract additions
  (Plan 2) are purely additive — no rename, no removal, no shape change to any
  existing export.
- **G4.** The vertical slice is venue-agnostic in implementation (uses a
  synthetic data generator), so the first real venue adapter (Plan 5,
  Hyperliquid) builds on a proven engine instead of designing the engine
  against adapter complexity.
- **G5.** The re-planned roadmap preserves every existing architectural
  commitment from [`overview.md`](../../overview.md): backtest→paper→live
  parity, unbypassable risk layer, deterministic replayable event loop,
  operator trust before live capital, multi-venue/multi-strategy from day one.

## Non-goals

- **Not re-deciding venue scope.** Polymarket, Kalshi, Binance, and Hyperliquid
  all remain in the long-term plan. This design just sequences Hyperliquid
  first among the live venues.
- **Not specifying risk policy.** Plan 3 uses a single `AllowAllRule` stub.
  Real risk rules (position limits, daily loss limits, `LiveArmRule`,
  `CircuitBreakerRule`) get their own plan(s) after the vertical slice proves
  the pipeline.
- **Not designing the live-trading surface.** Live arming, kill switch wiring,
  admin transport, and dashboard are explicitly later plans. v0.1 is backtest
  only.
- **Not re-deriving the Section 4 contracts.** The foundational design spec
  stays authoritative for primitives, events, intents, portfolio, strategy,
  adapter, risk, bus, and order-manager shapes. This design only *adds* to
  that surface.

## Re-planned roadmap

| # | Title | Status | Absorbs (from comparison) | Milestone |
|---|-------|--------|---------------------------|-----------|
| 1 | Core contracts and scaffold | shipped | — | — |
| 2 | Engine runtime + observability | queued | #6 audit log, #7 PnL events | — |
| 3 | Synthetic backtest vertical slice | queued | #1 ship strategy sooner | **v0.1 — green backtest** |
| 4 | First real strategy (MA crossover) | queued | — | — |
| 5 | Hyperliquid recorded-data adapter | queued | #4 WebSocket resilience, #8 rate limits/retries | — |
| 6 | Persistence (SQLite + Parquet) | queued | — | v0.2 — replayable runs |
| 7 | Admin service + kill switch + safe defaults | queued | #5 simulation-first defaults | — |
| 8 | Prediction-market contract extensions | queued | #2 market lifecycle, #3 settlement | — |
| 9 | Live arming | queued | — | v0.3 — live trading gated |
| 10 | Python analytics sidecar | queued | — | v1.0 |

### Changes vs. the old roadmap

- **Old Plan 3 ("first strategy") is split.** Plan 3 now covers the trivial
  pipeline-exerciser strategy (the backtest proof). The first *real* strategy
  (MA crossover) is Plan 4. The split keeps signal clean when something
  breaks: Plan 3 failures mean the pipeline is wrong; Plan 4 failures mean the
  strategy is wrong.
- **Old Plan 4 ("first venue adapter — paper") is replaced.** The backtest
  execution adapter ships in Plan 3. The first real venue adapter
  (Hyperliquid) is Plan 5. The distinction between "paper" and "backtest"
  collapses into the `Mode` type that already exists in core contracts
  (`backtest_l1` vs `paper` vs `live`) — one adapter can serve both by
  reading `RunContext.mode`.
- **Old Plan 5 (persistence) moves to new Plan 6.** Plan 2 ships a JSONL
  audit log (cheap, zero-dependency). Plan 6 upgrades that to SQLite +
  Parquet. This lets the vertical slice be fully observable without taking on
  a database dependency.
- **Plan 8 is net-new.** Prediction-market contract extensions (lifecycle,
  settlement) intentionally come *after* the crypto slice is proven. Designing
  these against a running engine is lower-risk than designing them against
  pure types.
- **Old Plan 6 (admin) becomes Plan 7**, and absorbs the simulation-safe
  config defaults.

### How each comparison-doc improvement lands

| # | Improvement | Plan that owns it | Rationale |
|---|-------------|-------------------|-----------|
| 1 | Ship strategy sooner | Plan 3 | Whole point of the vertical slice |
| 2 | Market lifecycle events | Plan 8 | Only matters once a prediction-market venue is next |
| 3 | Token redemption / settlement | Plan 8 | Same — crypto doesn't need it |
| 4 | WebSocket resilience | Plan 5 | First plan that has a WebSocket |
| 5 | Simulation-first defaults | Plan 3 (CLI default) + Plan 7 (full admin surface) | Cheapest possible safe default lands with the CLI in Plan 3. The broader admin/arming surface is Plan 7. |
| 6 | Append-only audit log | Plan 2 | Needed to observe backtest results |
| 7 | PnL tracking / events | Plan 2 | Needed to measure backtest results |
| 8 | Rate limiting / retries | Plan 5 | First plan that makes real API calls |

## Plan 2 shape — Engine runtime + observability

### Goal

A runnable engine you can hand a `Strategy`, `ExecutionAdapter`, `DataFeed`,
and list of `RiskRule`s, and get a deterministic sequence of events out. No
actual strategies, adapters, or rules live here — only the scaffolding they
plug into.

### In scope

- **`EventQueue`** — single-producer, single-consumer ordered queue of
  `EngineEvent<T>`. Deterministic tie-breaking on equal `ts` (sequence number
  as secondary key).
- **`EventBus`** — pub/sub wrapper over the queue. Subscribers read; only the
  engine writes. Topic routing by payload discriminator.
- **Dispatcher loop** — drains the queue, routes payloads to the right
  subscribers (Strategy receives MarketEvents, Portfolio + Strategy receive
  FillEvents, etc.).
- **Clock** — injected, not `Date.now()`. Deterministic in backtest (advanced
  by event `tsExchange`), real in live.
- **`RiskManager` implementation** — composes a `ReadonlyArray<RiskRule>` in
  fixed order, emits `RiskDecision`, gates `OrderIntent → OrderRequest`. No
  concrete rules ship in Plan 2 — just the pipeline runner.
- **`OrderManager` implementation** — assigns `requestId` (ULID), tracks
  intent → request → fill lineage, owns the open-orders table.
- **Portfolio updater** — consumes `FillEvent`, emits updated portfolio state,
  emits `PnlEvent` on each fill.
- **PnL snapshot ticker** — emits `PnlSnapshot` at configurable engine-clock
  intervals (advanced by event timestamps, not wall clock).
- **JSONL audit log** — one append-only file per run. Every bus event, every
  risk decision, every fill. Plan 6 later ingests this into SQLite + Parquet.

### Contract additions to `@trade-arbiter/core`

Purely additive. Plan 1's compile-check tests gain new entries;
`public-surface.test.ts` gains new imports. No rename, no removal, no shape
change to existing exports.

```ts
// events.ts — new interfaces (not variants of the MarketEvent union)
export interface PnlEvent {
  readonly type: 'pnl';
  readonly strategyId: StrategyId;
  readonly symbol: Symbol;
  readonly realizedDelta: number;       // this fill's realized PnL
  readonly realizedCumulative: number;  // run-to-date realized
  readonly unrealizedMark: number;      // mark-to-market of open positions
  readonly currency: string;            // ISO-4217 or venue-native (e.g., 'USDC')
  readonly triggeredBy: 'fill' | 'snapshot';
}

export interface PnlSnapshot {
  readonly type: 'pnl_snapshot';
  readonly strategyId: StrategyId;
  readonly positions: ReadonlyArray<{
    readonly symbol: Symbol;
    readonly qty: number;
    readonly avgEntry: number;
    readonly markPrice: number;
  }>;
  readonly realizedCumulative: number;
  readonly unrealizedTotal: number;
  readonly currency: string;
}

// audit.ts — new file
export type AuditKind =
  | 'market' | 'intent' | 'decision' | 'request' | 'order' | 'fill' | 'pnl' | 'snapshot';

export interface AuditRecord<K extends AuditKind = AuditKind, P = unknown> {
  readonly eventId: string;
  readonly ts: Timestamp;
  readonly runId: RunId;
  readonly kind: K;
  readonly payload: P;
}
```

### Out of scope (explicit)

- Persistence beyond JSONL — deferred to Plan 6.
- Any concrete risk rule, strategy, or adapter — deferred to Plan 3+.
- Kill switch *wiring* — deferred to Plan 7. The `KillSwitchState` type is
  already in core so the engine can read it if wired later.
- Dashboard or admin surface — deferred to Plan 7.
- Config schema validation library — deferred to Plan 7. Plan 2 uses a
  minimal typed loader that fails loudly.

### Acceptance criteria

1. **[must]** A test in `packages/engine` constructs the engine with a fake
   `DataFeed`, fake `Strategy`, fake `ExecutionAdapter`, and empty rule list,
   pushes 10 `MarketEvent`s in, and observes a deterministic sequence of bus
   events out.
2. **[must]** Two runs over the same recorded inputs produce byte-identical
   JSONL audit logs.
3. **[must]** `PnlEvent` fires on every `FillEvent`.
4. **[must]** `PnlSnapshot` fires on the configured engine-clock interval.
5. **[must]** Contract additions (`PnlEvent`, `PnlSnapshot`, `AuditRecord`,
   `AuditKind`) are exported from `@trade-arbiter/core` and covered by
   `public-surface.test.ts` and compile-check tests.
6. **[must]** The engine satisfies the Determinism contract below: ID
   generation is counter-based in backtest modes; JSONL serialization uses
   sorted keys, LF, no extraneous whitespace; floats are formatted by the
   engine's fixed formatter. Each requirement has a dedicated unit test.
7. **[must]** `npm run ci` at the workspace root exits 0.
8. **[should]** Engine package has zero runtime dependencies beyond
   `@trade-arbiter/core`.

## Plan 3 shape — Synthetic backtest vertical slice

### Goal

The first green end-to-end backtest. Prove the engine runs
strategy → risk → OMS → adapter → fill → portfolio → PnL loop deterministically
against synthetic data. This is milestone **v0.1**.

### Components delivered

Each is a workspace package under `packages/`.

| Package | Role |
|---------|------|
| `@trade-arbiter/synth-feed` | `DataFeed` implementation that yields a deterministic `MarketEvent` stream from a seeded RNG. Config: seed, event count, symbol, starting price, drift, volatility. |
| `@trade-arbiter/backtest-adapter` | `ExecutionAdapter` implementation. Fills `OrderRequest`s against the most recent `QuoteEvent` (instantly, at mid for market orders; no slippage model in v1). Emits `OrderEvent` (accepted) then `FillEvent` synchronously. |
| `@trade-arbiter/strat-pipeline-test` | The trivial strategy. On the Nth `MarketEvent` (config: `openEventIdx`), emit a buy `OrderIntent` for 1 unit. On the Mth (config: `closeEventIdx`), emit a sell for 1 unit. Zero other logic. |
| `@trade-arbiter/cli` | A minimal `tsx` entrypoint: `npm run backtest -- --config foo.yaml`. Loads config, computes `ConfigHash`, constructs the engine wiring, runs to completion, prints final PnL + path to JSONL log. |

Plus: `packages/engine/test/integration/backtest.test.ts` — integration test
that runs the whole stack in-process and asserts the exact sequence of bus
events + final portfolio state. This is the determinism gate.

### Risk rule set

One stub rule: `AllowAllRule`. It passes every intent through. Real rules
(position limit, daily loss limit, kill switch, `LiveArmRule`,
`CircuitBreakerRule`) come in their own plans. This keeps Plan 3 focused on
wiring, not policy.

### Config shape (YAML)

```yaml
run:
  mode: backtest_l1
  strategyId: pipeline-test-001
feed:
  kind: synth
  seed: 42
  events: 1000
  symbol: HYPE-PERP
strategy:
  openEventIdx: 100
  closeEventIdx: 900
```

### Safe defaults (CLI contract)

- **Default mode is `backtest_l1`.** If a config file omits `run.mode`, or
  if the CLI is invoked without a config file and with no flags, the engine
  runs in `backtest_l1`. Any other mode — `backtest_l2`, `paper`, `live` —
  must be selected by an explicit config entry or explicit flag. There is no
  code path where a missing/malformed config advances past `backtest_l1`.
- **No implicit `paper` or `live` arming.** The CLI refuses to start in
  `paper` or `live` mode without both (a) an explicit mode declaration in
  the resolved config, and (b) in Plan 7+, the `arm_live` gate flipped.
  Plan 3 only needs to enforce (a); (b) is Plan 7's job. But the default
  path must never silently select a non-backtest mode.
- **Rationale.** This is the cheapest possible slice of improvement #5
  (simulation-first defaults) from the comparison doc, locked in at the
  CLI's entry point. It costs ~5 lines in Plan 3 and closes a footgun that
  every later plan would otherwise need to redefend.

### Integration fixtures

Two fixtures ship with Plan 3:

1. **`fixtures/minimal.yaml`** — one round trip: open at event 100, close
   at event 900. Exercises the smallest possible path through the pipeline.
2. **`fixtures/round-trips.yaml`** — two round trips: open at 100 / close
   at 300, then open at 500 / close at 800. Exercises cumulative PnL,
   portfolio state transitions through zero, and a clean end state.

Both fixtures run against the same synthetic feed (seed 42, 1000 events).

### Acceptance criteria

1. **[must]** `npm run backtest -- --config fixtures/minimal.yaml` exits 0
   and prints a non-zero final PnL.
2. **[must]** Two invocations (same fixture) produce byte-identical JSONL
   audit logs (checked via `diff`).
3. **[must]** The `minimal.yaml` integration test asserts exactly 1
   `OrderIntent`, 1 `OrderRequest`, 1 `RiskDecision` (accept), 1
   `OrderEvent` (accepted), 1 `FillEvent`, 2 `PnlEvent`s (open + close),
   ≥1 `PnlSnapshot`.
4. **[must]** The `round-trips.yaml` integration test asserts 2
   `OrderIntent`s opening + 2 closing (4 total), 4 `FillEvent`s, asserts
   cumulative `realizedCumulative` on the final `PnlEvent` equals the sum of
   the two round-trip realized deltas, and asserts the `OrderManager` open
   orders table is empty at run end.
5. **[must]** Swapping the seed changes PnL — confirms RNG determinism, not
   a hardcoded path.
6. **[must]** Running the CLI with no config and no flags starts a
   `backtest_l1` run. Running with a config that has no `run.mode`
   likewise starts `backtest_l1`. Running with `mode: paper` or `mode: live`
   fails the config load in Plan 3 (Plan 7 relaxes this once the arming
   surface exists).
7. **[should]** The JSONL log for `minimal.yaml` at seed 42 is checked into
   the repo as a fixture; CI diffs against it to catch accidental
   determinism regressions. Golden-file brittleness is a known tradeoff;
   the diff on regen is the signal.

### Out of scope (explicit)

- Any real market data — deferred to Plan 5 (Hyperliquid adapter).
- Slippage / partial fills / orderbook walking — deferred to Plan 4 or later,
  driven by what the MA crossover strategy actually needs.
- Config schema library (Zod or similar) — deferred to Plan 7.

## Data flow (end-to-end vertical slice)

```
                  [seeded RNG → synth-feed]
                             │
                             ▼
                       MarketEvent ──► EventQueue
                                          │
                                          ▼
                                      EventBus ─────────┐
                                          │             │
                                          ▼             ▼
                                     Strategy      Portfolio
                                          │             ▲
                                  OrderIntent           │
                                          │             │
                                          ▼             │
                                    RiskManager         │
                                     (rules[])          │
                                          │             │
                               RiskDecision (accept)    │
                                          │             │
                                          ▼             │
                                     OrderManager       │
                                          │             │
                                  OrderRequest          │
                                          │             │
                                          ▼             │
                                  backtest-adapter      │
                                          │             │
                             OrderEvent + FillEvent ────┤
                                          │             │
                                          ▼             │
                                     EventBus ──► Strategy (opt)
                                          │             │
                                          ▼             ▼
                                     PnlEvent ◄─── Portfolio
                                          │
                                          ▼
                                   JSONL audit log
```

Every arrow is a typed event on the bus. Strategy and Portfolio read from the
bus; only RiskManager, OrderManager, and the adapter write. The JSONL writer
is a pure subscriber — it logs everything and can be disabled without
affecting behavior.

## Determinism contract (Plans 2 + 3)

Byte-identical JSONL log diffs are only meaningful if the engine pins down
every source of non-determinism. The slice locks these:

- **ID generation in backtest mode.** `eventId`, `intentId`, `requestId`,
  and `RunId` are all ULIDs in the design spec. In `backtest_l1` and
  `backtest_l2` modes, the engine generates them from a counter seeded at
  run start, not from the system clock + randomness. The counter is a
  plain monotonic integer rendered as a ULID-shaped string (e.g.,
  `00000000000000000000000042`). Live and paper modes use real ULIDs.
  This is a mode-dependent behavior in the engine, not the contract — the
  `RunId`/`ConfigHash` types stay opaque strings.
- **JSONL serialization.** Every audit line is:
  - UTF-8 encoded, LF line ending (no CRLF), one record per line, no
    trailing comma, no pretty printing.
  - Object keys serialized in a stable, sorted order (alphabetical by key
    name at every nesting level). This eliminates JSON.stringify
    implementation variance.
  - No optional whitespace around `:` or `,`.
- **Floating-point formatting.** All numbers serialized in JSONL go through
  a fixed formatter — decimal notation, no exponents, 12 digits after the
  decimal point, trailing zeros preserved (e.g., `1.234567890000`).
  Integers render without a decimal point. This trades terseness for
  diffability. The formatter lives in `packages/engine` and is unit-tested
  against edge cases (0, negative zero, very small, very large).
- **Clock.** The injected clock advances strictly by event `tsExchange` in
  backtest modes. The engine never reads wall-clock time during a backtest
  run.
- **RNG.** The synthetic feed's RNG is a pure function of the configured
  seed + an internal step counter. No system entropy source.
- **Iteration order.** Any `Map` or `Set` iteration that affects output
  ordering uses insertion order explicitly (JavaScript's default for `Map`
  and `Set`), and the order of insertion is itself deterministic (driven
  by event stream).

Any future change that introduces a source of non-determinism (e.g., a
parallel dispatcher worker, a native binding that randomizes output) must
either (a) not affect the JSONL log, or (b) be gated behind a config flag
that is off by default in backtest modes.

## PnL semantics (v0.1)

The v0.1 slice uses the simplest possible PnL model. Later plans replace
pieces of this as realism requires.

- **Mark source for unrealized PnL.** The mid of the most recent
  `QuoteEvent` for the instrument. If no quote has been seen yet, mark =
  last `TradeEvent` price. If neither, unrealized = 0 (no position can
  exist before any market data has been seen in the backtest adapter).
- **Realized PnL on a fill.** For a closing fill (reducing absolute
  position), `realizedDelta = (fill_price − avg_entry) × filled_qty × sign`
  where `sign` is +1 for long-closing-via-sell and −1 for
  short-closing-via-buy. For an opening fill (increasing absolute
  position), `realizedDelta = 0` and the average entry updates.
- **Fees.** `FillEvent.feesPaid` already exists in core. In v0.1 the
  backtest adapter sets `feesPaid = 0` — zero-fee execution. PnL
  accounting respects the field, so when a later plan introduces a fee
  model nothing in the engine needs to change.
- **Currency.** The portfolio and PnL events all carry a currency string.
  v0.1 uses a single per-run currency (`USDC` for Hyperliquid perps). No
  cross-currency conversion in v0.1.
- **Out of scope for the slice (explicit).**
  - **Execution quality modeling** — slippage, queue position, partial
    fills, maker-vs-taker fee differentials, latency penalties. The
    backtest adapter in Plan 3 fills at the most recent quote's mid,
    instantly and in full. A realistic execution model is a later plan,
    informed by whichever strategy first needs it (probably Plan 4's MA
    crossover or Plan 5's first real adapter run).
  - **Funding payments, borrow costs, staking yield.** Perp funding on
    Hyperliquid is real but not in v0.1 — the `funding` `MarketEventType`
    discriminator is already reserved in core for this.
  - **Multi-leg atomicity** — any intent sequence that only makes sense
    as a unit. v0.1's trivial strategy emits single-leg intents.

## Error handling posture (Plans 2 + 3)

- **Boundary validation only.** Config load validates shape and fails the
  run. Adapter ingress validates `MarketEvent` fields. Everything internal to
  the engine trusts the types.
- **Fail loud on contract violations.** If a strategy emits an intent with
  `qty <= 0`, risk rejects it with a `RiskDecision` of kind `reject` and the
  engine keeps running. If the engine itself sees a malformed event, it
  throws — backtest determinism depends on no silent recovery.
- **No retries in Plans 2/3.** Retries belong to adapter implementations
  (Plan 5+). The backtest adapter has nothing to retry — fills are
  synchronous.

## Testing strategy (Plans 2 + 3 combined)

- **Unit tests per engine component** — `EventQueue` ordering, `RiskManager`
  rule composition, `OrderManager` lineage, Portfolio accounting.
- **Compile-check tests for the contract additions** — each new type gets a
  literal construction test, matching the pattern from Plan 1.
- **Integration test** runs Plan 3's full stack in-process and asserts the
  exact event sequence.
- **Golden-file test `[should]`** diffs the JSONL audit against a
  checked-in fixture for seed 42.
- **Determinism test** — run twice with same seed, assert `diff` of the JSONL
  logs is empty; run with different seeds, assert logs differ.

## Risks

| # | Risk | Mitigation | Owner |
|---|------|------------|-------|
| R1 | The engine package grows beyond "scaffolding" and starts making policy decisions (e.g., baking in a default risk rule). | Keep `packages/engine` strictly about wiring. Every policy-like behavior goes in its own package that plugs in via a contract. Reviewer discipline. | Plan 2 reviewer |
| R2 | Golden-file fixture (acceptance 5 in Plan 3) becomes churn when any benign event-order change happens. | Flagged as `[should]`, not `[must]`. Regen is a one-line command. If it causes more pain than it catches, drop it. | Plan 3 reviewer |
| R3 | The v0.1 mark source (mid of last quote, falling back to last trade price) is fine for crypto perps but wrong for prediction markets where outcome tokens have a distinct "fair price" and asymmetric book depth. | Documented explicitly in the PnL semantics section as a crypto-only model. Plan 8 (prediction-market extensions) revisits with an outcome-token-aware mark. | Plan 8 |
| R4 | The "trivial strategy" in Plan 3 is so trivial that it hides pipeline bugs that only surface under realistic load (multiple concurrent intents, partial fills, cancels). | Plan 4 (MA crossover) is the first plan with non-trivial strategy state. If it surfaces pipeline bugs, those go back into Plan 2's acceptance criteria as additions. | Plan 4 |
| R5 | Deferring prediction-market contract extensions to Plan 8 means someone building on Plans 2–7 could lock in design choices that assume crypto semantics. | The `OutcomeToken` type and binary-market fields already exist in Plan 1. The engine doesn't read them; that's fine. Lifecycle/settlement events are additive in Plan 8 — nothing earlier needs to know about them. | Plan 8 designer |
| R6 | The synthetic data generator (`@trade-arbiter/synth-feed`) could drift from real Hyperliquid event shapes, so a strategy that works in backtest fails in the real adapter. | Plan 5 (Hyperliquid adapter) re-runs Plan 4's MA crossover against recorded data as its acceptance test. A shape mismatch fails Plan 5, not silently. | Plan 5 |

## What this design does NOT decide

- The exact interface for `@trade-arbiter/synth-feed`'s RNG + event generation
  algorithm. Plan 3's implementation plan decides that.
- The JSONL audit log schema evolution strategy. Plan 6 (persistence)
  decides how the JSONL format migrates into SQLite + Parquet.
- The MA crossover strategy's parameter surface. Plan 4 decides.
- The Hyperliquid data recording format. Plan 5 decides.

## See also

- [`../../roadmap.md`](../../roadmap.md) — will be updated to match this
  design once approved.
- [`2026-04-12-trade-arbiter-design.md`](2026-04-12-trade-arbiter-design.md) —
  foundational design. Section 4 (contracts) remains authoritative; this
  design adds to it, not replaces it.
- [`../../polymarket-bot-comparison.md`](../../polymarket-bot-comparison.md) —
  the comparison that sourced the 8 improvements integrated above.
