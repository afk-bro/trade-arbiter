# Arbtanis — Design Spec

**Date:** 2026-04-12
**Status:** Approved pending user review
**Repo root:** `trade-arbiter/`
**Package scope:** `@arbtanis/*`

## 1. Purpose

Arbtanis is a production-grade trading bot framework for prediction markets and connected markets (Polymarket, Kalshi, crypto perpetual futures). It combines the best ideas from three predecessor projects:

- **Polymarket-Arbitrage-Trading-Bot** — clean TypeScript execution core, hedged mean-reversion strategy, minimal dependency discipline
- **polymarket-5min-15min-1hour-bot-tools** — multi-strategy research (VWAP/momentum, late-window consensus, PTB divergence), multi-asset parallel trading, web dashboards, Telegram notifications
- **CloddsBot** — risk engine patterns (Kelly sizing, VaR, circuit breaker), backtesting framework, structured trade ledger with audit trail

The **deal-breaker** for v1: a backtest and paper-trading pipeline the operator trusts before risking real capital.

## 2. Golden Rules

These rules are structural, not stylistic. Violating them is a design-level bug.

**Rule 1 — Strategy blindness to mode.** Strategy code must not know whether it is running in `backtest_l1`, `backtest_l2`, `paper`, or `live`. It sees only: market data, portfolio state, config, order/fill/order-lifecycle events. Execution backend, data feed, and clock are injected.

**Rule 2 — Risk layer is unbypassable.** Every order flows through the risk manager. The path is always:

```
Strategy → OrderIntent → RiskManager → OrderRequest → OrderManager → ExecutionAdapter → FillEvent/OrderEvent
```

No adapter accepts an `OrderRequest` that didn't come from the risk layer. No strategy can emit anything other than an `OrderIntent`.

**Rule 3 — Parity by construction.** The same strategy code produces the same intent given the same observable inputs across all four modes. Execution outcomes may differ (that is the whole point of L2 being more realistic than L1). Intents must not.

**Rule 4 — Deterministic event loop.** All events are processed in a single deterministic queue, one at a time. No callback may mutate state asynchronously, call `Date.now()`, or enqueue work that bypasses the queue. Time comes from `EngineClock.now()`, never from `Date`.

## 3. Architecture Overview

### 3.1 Containers (Docker Compose)

```
┌─────────────────────────────────────────────────────────────────────┐
│ arbtanis-engine          │ arbtanis-dashboard  │ arbtanis-research  │
│ (TypeScript, long-run)   │ (TS + web)          │ (Python, jupyter)  │
└──────────────┬───────────┴──────────┬──────────┴─────────┬──────────┘
               │                      │                    │
               └──────────────────────┼────────────────────┘
                                      │
                  ┌───────────────────┴────────────────────┐
                  │       SHARED STORAGE VOLUME            │
                  │  data/                                 │
                  │    arbtanis.db         (SQLite)        │
                  │    market/*.parquet    (append-only)   │
                  │    features/*.parquet  (per run)       │
                  │    backtest/*.parquet  (result exports)│
                  │    config/*.yaml       (strategy configs) │
                  └────────────────────────────────────────┘
```

Engine and research share storage; there is no RPC between them. Dashboard reads SQLite directly and controls the engine over a Unix socket exposed by `engine-cli`.

### 3.2 Engine layers

```
┌──────────────────────────────────────────────────────────────────┐
│                       STRATEGIES (plugins)                       │
│  HedgedMeanReversion │ VWAPMomentum │ LateWindow │ PTB │ XArb   │
└──────────────────────────────┬───────────────────────────────────┘
                               │  OrderIntent
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        RISK MANAGER                              │
│  Kill │ Balance │ Hard caps │ DailyLoss │ Circuit │ Kelly │ Max │
└──────────────────────────────┬───────────────────────────────────┘
                               │  OrderRequest
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                        ORDER MANAGER                             │
│  active orders │ lineage │ timeouts │ cancel/replace             │
└──────────────────────────────┬───────────────────────────────────┘
                               │  OrderRequest
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                  EXECUTION ADAPTER (pluggable)                   │
│   SimpleSim │ L2Sim │ Paper │ LivePolymarket(v1.1) │ ...        │
└──────────────────────────────┬───────────────────────────────────┘
                               │  FillEvent / OrderEvent
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│        EventBus (routing) → EventQueue (ordering)                │
└──────────────────────────────┬───────────────────────────────────┘
                               │
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│      PORTFOLIO → RISK.onFill → STRATEGY.onFill/onOrderEvent      │
└──────────────────────────────────────────────────────────────────┘
```

Above all of this sits the **EngineClock**. Every layer gets its timestamps from the clock, never from `Date.now()`.

### 3.3 Component responsibilities

- **EngineClock** — `WallClock` (paper/live) or `BacktestClock` (backtest, advances with events).
- **EventQueue** — owns enqueue order, processes events sequentially, guarantees no interleaving. Tie-breakers on `(tsExchange, seq, eventId)` for deterministic replay.
- **EventBus** — dumb fan-out routing. Does not own ordering; delegates to EventQueue.
- **DataFeed** — produces `MarketEvent`. Live feeds are WS clients; `ParquetReplayFeed` reads partitioned files and drives `BacktestClock`.
- **Strategies** — consume events, emit `OrderIntent`. Pure logic, no I/O, no direct DB access.
- **RiskManager** — composition of `RiskRule`s applied in fixed order. Turns approved intents into `OrderRequest`s.
- **OrderManager** — tracks active orders, reconciles fills and lifecycle events, detects stuck orders, coordinates cancel/replace. Single source of truth for in-flight state.
- **ExecutionAdapter** — venue/mode specific. Accepts `OrderRequest`, emits `FillEvent` + `OrderEvent` via callbacks.
- **PortfolioService** — stateful aggregator. Updates positions on fills, marks to market on quotes. Exposes immutable snapshots via `portfolio()`.
- **PersistenceService** — writes SQLite rows and Parquet partitions. Subscribes to bus events; strategies and risk never write to storage directly.
- **Orchestrator** — reads `RunManifest`, wires dependencies, starts feeds, handles shutdown.

## 4. Core Contracts

All types live in `@arbtanis/core`. Zero runtime dependencies. Importable by anything.

### 4.1 Primitives

```typescript
type Timestamp = number;           // epoch millis, engine-wide canonical
type RunId = string;               // ULID
type StrategyId = string;          // stable per-strategy-instance, e.g. "hedged-btc-15m"
type ConfigHash = string;          // sha256 of resolved YAML config
type Mode = 'backtest_l1' | 'backtest_l2' | 'paper' | 'live';
type Venue = 'polymarket' | 'kalshi' | 'binance' | 'hyperliquid';
type Symbol = string;              // venue-native

interface RunContext {
  runId: RunId;
  strategyId: StrategyId;
  configHash: ConfigHash;
  mode: Mode;
}
```

### 4.2 Clock

```typescript
interface EngineClock {
  now(): Timestamp;
  mode: Mode;
}
```

Strategies receive the clock via `StrategyContext`. A lint rule forbids `Date.now()` and `new Date()` in strategy code.

### 4.3 Event envelope

```typescript
interface EngineEvent<T> {
  eventId: string;                 // ULID, globally unique in run
  ctx: RunContext;
  ts: Timestamp;                   // engine timestamp at enqueue
  payload: T;
}
```

Every event on the bus is wrapped in `EngineEvent<T>`. Payloads below.

### 4.4 Market data

```typescript
type MarketEventType = 'quote' | 'trade' | 'orderbook' | 'candle' | 'funding' | 'oracle';

interface BaseMarketEvent {
  type: MarketEventType;
  venue: Venue;
  symbol: Symbol;
  tsExchange: Timestamp;           // exchange-side timestamp; authoritative for ordering
  tsReceived: Timestamp;           // local receipt time
  seq?: number;                    // venue sequence number
  mid?: number;                    // venue-normalized mid, when derivable
}

interface QuoteEvent extends BaseMarketEvent { type: 'quote'; bid: number; ask: number; bidSize: number; askSize: number; }
interface TradeEvent extends BaseMarketEvent { type: 'trade'; price: number; size: number; side: 'buy' | 'sell'; }
interface OrderBookEvent extends BaseMarketEvent { type: 'orderbook'; bids: [number, number][]; asks: [number, number][]; }
interface CandleEvent extends BaseMarketEvent { type: 'candle'; interval: string; o: number; h: number; l: number; c: number; v: number; }

type MarketEvent = QuoteEvent | TradeEvent | OrderBookEvent | CandleEvent;
```

### 4.5 Intent → Request → Fill

```typescript
type Side = 'buy' | 'sell';
type OutcomeToken = 'YES' | 'NO' | null;

interface StrategySignalMeta {
  expectedEdge?: number;           // e.g. 0.03 = 3c edge on a $1 binary
  variance?: number;
  confidence?: number;             // 0-1
}

interface OrderIntent {
  intentId: string;                // strategy-generated, idempotent
  ctx: RunContext;
  tsCreated: Timestamp;
  venue: Venue;
  symbol: Symbol;
  outcome?: OutcomeToken;
  side: Side;
  sizeRequested: number;
  priceLimit?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'FAK';
  reason: string;
  tags?: {
    signalMeta?: StrategySignalMeta;
    [key: string]: unknown;
  };
}

interface OrderRequest extends OrderIntent {
  requestId: string;               // assigned by OrderManager (ULID) before submit
  sizeApproved: number;
  riskDecisionId: string;
  parentIntentId?: string;         // lineage for splits/hedges/slicing
}

type OrderStatus =
  | 'pending' | 'open' | 'partially_filled'
  | 'filled'  | 'cancelled' | 'rejected' | 'expired';

interface OrderEvent {
  requestId: string;
  intentId: string;
  ctx: RunContext;
  status: OrderStatus;
  remainingSize: number;
  ts: Timestamp;
  reason?: string;
}

type FillStatus = 'partial' | 'filled' | 'rejected' | 'cancelled' | 'expired';

interface FillEvent {
  fillId: string;
  intentId: string;
  requestId: string;
  ctx: RunContext;
  venue: Venue;
  symbol: Symbol;
  tsExchange: Timestamp;
  tsReceived: Timestamp;
  status: FillStatus;
  filledSize: number;
  remainingSize: number;
  avgPrice: number;
  feesPaid: number;
  reason?: string;
}
```

### 4.6 Portfolio

```typescript
interface PositionState {
  venue: Venue;
  symbol: Symbol;
  outcome?: OutcomeToken;
  qty: number;                     // signed
  avgCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

interface PortfolioState {
  ctx: RunContext;
  ts: Timestamp;
  cashUsd: number;
  positions: Map<string, PositionState>;  // keyed by `${venue}:${symbol}:${outcome ?? ''}`
  equity: number;
  dayStartEquity: number;
}
```

### 4.7 Strategy

```typescript
interface StrategyContext {
  clock: EngineClock;
  ctx: RunContext;
  portfolio: () => Readonly<PortfolioState>;   // immutable snapshot, pull-based
  config: unknown;                              // validated against strategy-specific zod schema
  logger: Logger;
  emit(intent: OrderIntent): void;              // → RiskManager → ExecutionAdapter
}

interface Strategy {
  readonly id: StrategyId;
  init(sctx: StrategyContext): Promise<void>;
  onMarketEvent(event: MarketEvent): void;
  onFillEvent(event: FillEvent): void;
  onOrderEvent?(event: OrderEvent): void;       // optional — simple strategies skip
  onTick?(ts: Timestamp): void;                 // paces on clock, not wall time
  shutdown(): Promise<void>;
}
```

### 4.8 Execution adapter

```typescript
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

Implementations:
- `SimpleSimAdapter` — L1: fills at mid ± configurable slippage, instant
- `L2SimAdapter` — L2: walks historical orderbook depth, models latency, queue position, partial fills
- `PaperAdapter` — live feeds, simulated fills via L2 internals
- `LivePolymarketAdapter` — v1.1

**requestId ownership:** `requestId` on `OrderRequest` is assigned by the `OrderManager` (ULID) before `submit` is called, and is the engine's canonical identifier for that request for the rest of its lifecycle. The adapter accepts it, uses it to track the order internally, and echoes it back in the submit acknowledgement promise. Adapters that need a venue-native ID (e.g., `LivePolymarketAdapter` talking to the Polymarket CLOB) maintain their own `engineRequestId → venueOrderId` mapping internally but always surface the engine's `requestId` on `FillEvent` and `OrderEvent`. The acknowledgement promise resolves only after the adapter has successfully handed off the request (submitted to venue, or accepted into the simulator's internal book), giving callers an ergonomic `await` point and confirming that the request is in flight.

### 4.9 Data feed

```typescript
interface DataFeed {
  readonly venue: Venue;
  readonly mode: Mode;
  subscribe(symbols: Symbol[], types: MarketEventType[]): void;
  onEvent(cb: (ev: MarketEvent) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  seek?(ts: Timestamp): Promise<void>;          // replay only; live throws
}
```

### 4.10 Risk

```typescript
interface RiskCheck {
  pass: boolean;
  size: number;                    // always explicit, 0 if rejected
  reason: string;                  // always present
}

interface RiskRule {
  readonly id: string;
  check(
    intent: OrderIntent,
    portfolio: Readonly<PortfolioState>,
    state: Readonly<RiskState>,
  ): RiskCheck;
}

interface RiskDecision {
  decisionId: string;
  ctx: RunContext;
  intentId: string;
  approved: boolean;
  sizeApproved: number;
  reason: string;
  ts: Timestamp;
}

interface RiskManager {
  check(intent: OrderIntent, portfolio: Readonly<PortfolioState>): RiskDecision;
  onFill(fill: FillEvent): void;
  isKilled(): boolean;
}

interface RiskState {
  killSwitch: KillSwitchState;
  dayStartTs: Timestamp;                // when the current trading day began
  realizedPnlToday: number;             // running realized P&L since dayStartTs
  consecutiveLosses: number;            // reset on any winning trade
  circuitBreakerTrippedAt: Timestamp | null;
  strategyExposureUsd: Map<StrategyId, number>;       // strategy → open position value
  venueExposureUsd: Map<Venue, number>;               // venue → total exposure
}

interface KillSwitchState {
  active: boolean;
  triggeredBy: 'user' | 'risk_rule' | 'system_error' | null;
  reason: string;
  triggeredAt: Timestamp | null;
}
```

**Rule ordering (fixed):**

1. `KillSwitchRule`
2. `BalanceRule`
3. `HardCapsRule` (strategy + venue exposure caps)
4. `DailyLossRule`
5. `CircuitBreakerRule`
6. `KellySizingRule` (reads `intent.tags.signalMeta`; no-op if absent)
7. `MaxOrderSizeRule` (final safety clamp)

Rules short-circuit on first rejection. Every rule evaluation is persisted to `risk_decisions`. System-level events (kill switch trips, circuit breaker, daily loss) are also persisted to `risk_events`.

**Kill switch lifecycle.** The kill switch is an engine-wide boolean that any component can trip. Once tripped, `RiskManager.check()` rejects every intent with `reason: 'kill_switch'` and `size: 0` regardless of the rest of the pipeline. It can be tripped by:

- Explicit user action (`engine-cli admin kill`, dashboard button, or future Telegram command)
- `DailyLossRule` exceeded
- `CircuitBreakerRule` triggered
- Strategy unhandled exception count exceeds threshold
- Risk manager unexpected internal error

Once tripped, the only way to untrip it is a manual `engine-cli admin reset` or the equivalent dashboard control. There is no automatic recovery. Kill switch state is persisted to `risk_events` on every trip and reset, and the current state is surfaced in the dashboard at all times.

### 4.11 EventQueue + EventBus

```typescript
interface EventQueue {
  enqueue(ev: EngineEvent<unknown>): void;
  run(): Promise<void>;                         // drains the queue sequentially
  stop(): Promise<void>;
  size(): number;
}

interface EventBus {
  subscribe<T>(eventType: string, handler: (ev: EngineEvent<T>) => void | Promise<void>): () => void;
  publish<T>(eventType: string, ev: EngineEvent<T>): void;   // enqueues onto EventQueue
}
```

EventQueue owns ordering; EventBus is routing only. Handlers may enqueue follow-ups (e.g. risk sees a kill-switch trip and enqueues a `risk_event`) but the follow-ups land at the tail, never interleaved.

### 4.12 OrderManager

```typescript
interface OrderLineage {
  intent: OrderIntent;
  requests: OrderRequest[];
  fills: FillEvent[];
  events: OrderEvent[];
  status: OrderStatus;
  remainingSize: number;
}

interface OrderManager {
  onIntent(intent: OrderIntent, request: OrderRequest): void;
  onFill(fill: FillEvent): void;
  onOrderEvent(ev: OrderEvent): void;
  getOpenOrders(): ReadonlyArray<OrderRequest>;
  getLineage(intentId: string): OrderLineage;
  tickTimeouts(now: Timestamp): void;
}
```

The order manager sits on the path between risk and execution for the submit direction and between execution and strategies for the feedback direction. It is the single source of truth for "what's in flight right now."

## 5. Data Flow by Mode

The strategy code path is **identical** in all four modes. Only the `DataFeed` and `ExecutionAdapter` change.

### 5.1 Backtest L1

```
ParquetReplayFeed → drives BacktestClock
  ↓ MarketEvent
EventBus → EventQueue
  ↓
Strategy.onMarketEvent → emit(intent)
  ↓
RiskManager.check → approved OrderRequest
  ↓
OrderManager → SimpleSimAdapter.submit → synthetic fill
  ↓ FillEvent + OrderEvent
EventBus → EventQueue
  ↓
Portfolio.onFill → RiskManager.onFill → Strategy.onFill / onOrderEvent
```

Clock advances only when events are processed. Fully deterministic.

### 5.2 Backtest L2

Identical to L1 but with `L2SimAdapter`. The adapter tracks resting orders in an internal book model, walks historical orderbook depth on each `OrderBookEvent`, models latency and queue position, and emits partial/full fills + status transitions.

### 5.3 Paper

```
LiveWebSocketFeed (real venue) → drives WallClock
  ↓ MarketEvent
(also tee'd to PaperCaptureWriter → data/market/.../captured_run=.../)
EventBus → EventQueue
  ↓
Strategy.onMarketEvent → emit(intent)
  ↓
RiskManager → OrderManager → PaperAdapter (L2 sim internals, live quotes)
  ↓ FillEvent + OrderEvent
EventBus → Portfolio → RiskManager → Strategy
```

Every paper run captures raw market events to Parquet. This makes "run a backtest on what paper saw" a true deterministic replay and unlocks the paper vs backtest parity test.

### 5.4 Live (v1.1)

Same path; `LivePolymarketAdapter` talks to the real CLOB and emits real fills and order lifecycle transitions.

### 5.5 Fill ordering rule

```
FillEvent →
  Portfolio (update positions, mark P&L) →
  RiskManager (observe realized loss; may trip circuit breaker) →
  Strategy (observes post-risk world)
```

The strategy always sees the post-risk world. If a fill trips a kill switch, the strategy's `onFillEvent` runs after the kill switch is tripped and can observe it via `portfolio()` and any risk event it subscribes to.

## 6. Data Persistence

### 6.1 SQLite (operational state)

```sql
CREATE TABLE runs (
  run_id TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  config_hash TEXT NOT NULL,
  mode TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL,            -- 'running' | 'completed' | 'crashed' | 'killed'
  meta_json TEXT
);

CREATE TABLE strategy_configs (
  config_hash TEXT PRIMARY KEY,
  strategy_id TEXT NOT NULL,
  yaml_content TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE order_intents (
  intent_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  strategy_id TEXT NOT NULL,
  ts_created INTEGER NOT NULL,
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  outcome TEXT,
  side TEXT NOT NULL,
  size_requested REAL NOT NULL,
  price_limit REAL,
  time_in_force TEXT NOT NULL,
  reason TEXT NOT NULL,
  tags_json TEXT
);

CREATE TABLE risk_decisions (
  decision_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  intent_id TEXT NOT NULL REFERENCES order_intents(intent_id),
  approved INTEGER NOT NULL,
  size_approved REAL NOT NULL,
  reason TEXT NOT NULL,
  ts INTEGER NOT NULL
);

CREATE TABLE order_requests (
  request_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  intent_id TEXT NOT NULL REFERENCES order_intents(intent_id),
  parent_intent_id TEXT,
  risk_decision_id TEXT NOT NULL REFERENCES risk_decisions(decision_id),
  size_approved REAL NOT NULL,
  ts_submitted INTEGER NOT NULL,
  venue TEXT NOT NULL
);

CREATE TABLE order_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  request_id TEXT NOT NULL REFERENCES order_requests(request_id),
  intent_id TEXT NOT NULL REFERENCES order_intents(intent_id),
  status TEXT NOT NULL,
  remaining_size REAL NOT NULL,
  ts INTEGER NOT NULL,
  reason TEXT
);

CREATE TABLE fills (
  fill_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  request_id TEXT NOT NULL REFERENCES order_requests(request_id),
  intent_id TEXT NOT NULL REFERENCES order_intents(intent_id),
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  ts_exchange INTEGER NOT NULL,
  ts_received INTEGER NOT NULL,
  status TEXT NOT NULL,
  filled_size REAL NOT NULL,
  remaining_size REAL NOT NULL,
  avg_price REAL NOT NULL,
  fees_paid REAL NOT NULL,
  reason TEXT
);

CREATE TABLE positions (
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  venue TEXT NOT NULL,
  symbol TEXT NOT NULL,
  outcome TEXT,
  qty REAL NOT NULL,
  avg_cost REAL NOT NULL,
  realized_pnl REAL NOT NULL,
  unrealized_pnl REAL NOT NULL,
  last_updated INTEGER NOT NULL,
  PRIMARY KEY (run_id, venue, symbol, outcome)
);

CREATE TABLE portfolio_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  ts INTEGER NOT NULL,
  cash_usd REAL NOT NULL,
  equity REAL NOT NULL,
  day_start_equity REAL NOT NULL,
  positions_json TEXT NOT NULL
);

CREATE TABLE risk_events (
  event_id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(run_id),
  ts INTEGER NOT NULL,
  type TEXT NOT NULL,              -- 'kill_switch' | 'daily_loss_limit' | 'circuit_breaker' | ...
  severity TEXT NOT NULL,          -- 'info' | 'warn' | 'critical'
  message TEXT NOT NULL,
  meta_json TEXT
);

-- Indexes
CREATE INDEX idx_fills_intent_ts
  ON fills(intent_id, ts_exchange)
  WHERE status IN ('partial', 'filled');
CREATE INDEX idx_fills_run_ts          ON fills(run_id, ts_exchange);
CREATE INDEX idx_order_requests_run    ON order_requests(run_id, ts_submitted);
CREATE INDEX idx_order_events_run_ts   ON order_events(run_id, ts);
CREATE INDEX idx_intents_run           ON order_intents(run_id, ts_created);
CREATE INDEX idx_snapshots_run_ts      ON portfolio_snapshots(run_id, ts);
```

### 6.2 Parquet (analytical storage)

```
data/
  market/
    venue=polymarket/symbol=btc-up-15m/date=2026-04-12/
      quotes-000001.parquet
      trades-000001.parquet
      orderbook-000001.parquet
    venue=polymarket/symbol=btc-up-15m/date=2026-04-12/captured_run=01JABC.../
      quotes-000001.parquet         # paper run capture
      trades-000001.parquet
      orderbook-000001.parquet
    venue=binance/symbol=BTCUSDT/date=2026-04-12/
      ...
  features/
    strategy=hedged-btc-15m/run_id=01JABC.../date=2026-04-12/
      signals-000001.parquet         # strategy signal inputs, carry intent_id
  backtest/
    run_id=01JABC.../
      equity_curve.parquet
      trades.parquet
      drawdowns.parquet
      params.json
```

Append-only, partitioned. The Python sidecar reads directly with `pyarrow`.

## 7. Strategy Configs

YAML per strategy, hash-pinned on load. Dashboard reads them in v1; write-mode editing in v2.

```yaml
# configs/strategies/hedged-btc-15m.yaml
id: hedged-btc-15m
strategy: hedged_mean_reversion
venue: polymarket
mode: paper                         # backtest_l1 | backtest_l2 | paper | live
symbols:
  - btc-up-15m
  - btc-down-15m
params:
  entry_threshold: 0.47
  reversal_delta: 0.02
  depth_buy_discount: 0.02
  dynamic_threshold_boost: 0.04
  second_side_buffer: 0.003
  second_side_time_threshold_ms: 200
  max_sum_avg: 0.98
  shares_per_side: 5
  max_buys_per_side: 1
risk:
  max_position_usd: 1000
  kelly_fraction: 0.25
live_gate:
  min_paper_sessions: 3
  min_paper_trades: 50
  min_paper_runtime_hours: 24
  parity_check: required
  user_armed: required
```

Orchestrator validates at startup. Refuses to start a `live` strategy unless every `live_gate` precondition holds.

## 8. Parity Testing

Three parity tests, runnable via `engine-cli parity`:

1. **Replay determinism** — same strategy, same Parquet data, same seed → bit-for-bit identical intents across two runs.
2. **L1 vs L2 parity** — same strategy over the same window in both modes → intents match within tolerance. Fills may differ.
3. **Paper vs backtest parity** — run paper for a window; run a backtest on the paper capture → intents match within tolerance.

Two intents match when all of `(side, venue, symbol, outcome)` are equal and `ts_created` is within tolerance (default 1000ms). The parity runner reports:

```
Parity report run_a=01JA... run_b=01JB... tolerance=1000ms
  Intents A: 247
  Intents B: 247
  Matched:   247
  Missing in A: 0
  Missing in B: 0
  Out of tolerance: 0
  Result: PASS
```

Parity failure blocks the live-mode gate.

## 9. Dashboard (v1 minimal)

React (or similar) frontend, TypeScript backend reads SQLite directly and talks to engine over a Unix socket.

**Panels:**

- **Live positions** — current open positions with mark-to-market, per-strategy P&L, total equity.
- **P&L chart** — intraday equity curve for the current run.
- **Strategy status** — per strategy: mode (paper/live), status (running/paused/killed), last N intents, last fill, current paper/live gate progress.
- **Intent stream** — live-updating feed of every intent:

```
ts          venue   symbol    side  req → approved  reason
16:24:31.2  poly    btc-up    buy   5.0 → 5.0       reversal
16:24:31.3  poly    btc-down  buy   5.0 → 3.2       kelly_reduced
16:24:45.8  poly    eth-up    buy   5.0 → 0.0       daily_loss_hit
```

- **Trade log** — filterable by run, strategy, venue, symbol. Joins intents → requests → fills.
- **Risk events** — live feed of risk events with severity coloring. Kill switch state prominently displayed.
- **Controls** — per-strategy start / pause / resume. Global kill switch button (red, confirm dialog).

Write-mode config editing, backtest result viewer, and parameter sweep UI are v2.

## 10. Project Structure (monorepo)

```
trade-arbiter/
├── docker-compose.yml
├── package.json                   (workspace root)
├── packages/
│   ├── core/                      (@arbtanis/core — contracts only, zero runtime deps)
│   │   ├── src/
│   │   │   ├── events.ts          EngineEvent, MarketEvent, FillEvent, OrderEvent
│   │   │   ├── intents.ts         OrderIntent, OrderRequest, OrderStatus
│   │   │   ├── portfolio.ts       PositionState, PortfolioState
│   │   │   ├── context.ts         RunContext, EngineClock
│   │   │   ├── strategy.ts        Strategy, StrategyContext
│   │   │   ├── adapter.ts         ExecutionAdapter, DataFeed
│   │   │   └── risk.ts            RiskRule, RiskDecision, KillSwitchState
│   │   └── test/
│   │
│   ├── engine/                    (@arbtanis/engine — long-running process)
│   │   ├── src/
│   │   │   ├── bin/arbtanis.ts
│   │   │   ├── cli/
│   │   │   │   ├── index.ts
│   │   │   │   ├── run.ts
│   │   │   │   ├── backtest.ts
│   │   │   │   ├── parity.ts
│   │   │   │   └── admin.ts       kill, reset, list-runs, show-run
│   │   │   ├── bus/
│   │   │   │   ├── event-queue.ts
│   │   │   │   └── event-bus.ts
│   │   │   ├── clock/
│   │   │   │   ├── wall-clock.ts
│   │   │   │   └── backtest-clock.ts
│   │   │   ├── feeds/
│   │   │   │   ├── parquet-replay-feed.ts
│   │   │   │   ├── polymarket-ws-feed.ts
│   │   │   │   └── binance-ws-feed.ts
│   │   │   ├── execution/
│   │   │   │   ├── order-manager.ts
│   │   │   │   ├── simple-sim-adapter.ts
│   │   │   │   ├── l2-sim-adapter.ts
│   │   │   │   ├── paper-adapter.ts
│   │   │   │   ├── paper-capture-writer.ts
│   │   │   │   └── live-polymarket-adapter.ts   (v1.1)
│   │   │   ├── risk/
│   │   │   │   ├── risk-manager.ts
│   │   │   │   ├── kill-switch.ts
│   │   │   │   └── rules/
│   │   │   │       ├── kill-switch.ts
│   │   │   │       ├── balance.ts
│   │   │   │       ├── hard-caps.ts
│   │   │   │       ├── daily-loss.ts
│   │   │   │       ├── circuit-breaker.ts
│   │   │   │       ├── kelly.ts
│   │   │   │       └── max-order-size.ts
│   │   │   ├── portfolio/
│   │   │   │   └── portfolio-service.ts
│   │   │   ├── persistence/
│   │   │   │   ├── sqlite.ts
│   │   │   │   └── parquet.ts
│   │   │   ├── orchestrator/
│   │   │   │   ├── orchestrator.ts
│   │   │   │   └── run-manifest.ts
│   │   │   └── config/
│   │   │       ├── loader.ts
│   │   │       └── schemas.ts     zod schemas
│   │   └── test/
│   │       ├── unit/
│   │       ├── integration/
│   │       ├── parity/
│   │       └── fixtures/          parquet fixtures, sample YAML configs, synthetic orderbooks
│   │
│   ├── strategies/                (@arbtanis/strategies — plug-ins)
│   │   ├── src/
│   │   │   ├── hedged-mean-reversion/
│   │   │   │   ├── index.ts
│   │   │   │   ├── config.ts      zod schema
│   │   │   │   └── test/
│   │   │   ├── vwap-momentum/     (v2)
│   │   │   ├── late-window/       (v2)
│   │   │   ├── ptb/               (v2)
│   │   │   ├── cross-platform-arb/ (v2)
│   │   │   └── delta-neutral-hedge/ (v2)
│   │   └── index.ts               registry
│   │
│   └── dashboard/                 (@arbtanis/dashboard)
│       ├── server/
│       │   └── src/
│       └── web/
│           └── src/
│
├── research/                      (Python sidecar)
│   ├── pyproject.toml
│   ├── arbtanis_research/
│   │   ├── loaders.py             pandas loaders for SQLite + Parquet
│   │   ├── backtest_analysis.py
│   │   ├── parity_check.py
│   │   └── sweeps.py              parameter sweeps
│   └── notebooks/
│       └── hedged-mean-reversion-analysis.ipynb
│
├── configs/
│   └── strategies/
│       ├── hedged-btc-15m.yaml
│       └── ...
│
├── scripts/
│   ├── backfill-market-data.ts    pull historical Polymarket/Binance into Parquet
│   └── migrate-db.ts              SQLite schema migrations
│
├── data/                          (shared volume, gitignored)
│   ├── arbtanis.db
│   ├── market/
│   ├── features/
│   └── backtest/
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-12-arbtanis-design.md
```

**Dependency direction** is structural: `core` has no dependencies; `strategies` depends only on `core`; `engine` depends on `core` and `strategies`; `dashboard` reads SQLite and hits `engine-cli`. A strategy cannot accidentally import from the engine because the engine is not visible from the strategies package.

## 11. v1 Scope

### 11.1 In scope

- `@arbtanis/core` — all contracts in Section 4
- `@arbtanis/engine`:
  - EventQueue, EventBus
  - WallClock, BacktestClock
  - ParquetReplayFeed, PolymarketWSFeed, BinanceWSFeed
  - SimpleSimAdapter, L2SimAdapter, PaperAdapter, PaperCaptureWriter
  - OrderManager
  - RiskManager with all 7 rules
  - KillSwitch with CLI + dashboard control
  - PortfolioService
  - PersistenceService (SQLite + Parquet writers)
  - Orchestrator + RunManifest
  - Config loader (YAML + zod + config hashing)
  - `engine-cli`: `run`, `backtest`, `parity`, `admin kill|reset|list-runs|show-run`
- `@arbtanis/strategies`:
  - **HedgedMeanReversion** — one strategy, ported from Polymarket-Arbitrage-Trading-Bot, rewritten against the `Strategy` interface
- `@arbtanis/dashboard` — all panels in Section 9
- `research/`:
  - Python loaders
  - `parity_check.py`
  - One example notebook
- Parity tests:
  - Replay determinism
  - L1 vs L2 on a fixed synthetic dataset
  - Paper vs backtest on captured market data
- Docker Compose: 3 services (engine, dashboard, research)
- `scripts/backfill-market-data.ts`
- `scripts/migrate-db.ts`

### 11.2 Out of scope (deferred)

- **v1.1** — `LivePolymarketAdapter`. Arrives only after v1 is trusted.
- **v2** — Kalshi / Binance / Hyperliquid live adapters; VWAP-momentum, late-window, PTB, cross-platform arb, delta-neutral hedge strategies; Telegram notifications; dashboard write-mode config editing; parameter sweep UI.
- **v3** — Out-of-order event handling in replay; multi-instance / distributed operation.

### 11.3 Done criteria

v1 is complete when **all** of the following hold:

1. `engine-cli backtest --strategy hedged-btc-15m --range 2025-10-01:2025-12-31 --mode backtest_l1` completes: fills, P&L, equity curve exported to Parquet.
2. Same run in `--mode backtest_l2` completes; L1 vs L2 parity test passes for intents (tolerance 1000ms).
3. `engine-cli run --strategy hedged-btc-15m --mode paper` runs against live Polymarket WS for **at least 24 hours**, produces **at least 30 risk-approved intents**, and does not crash.
4. Dashboard shows the paper run live with working kill switch, intent stream, position panel, and risk events feed.
5. `engine-cli parity --run-a <paper> --run-b <backtest>` passes for a shared window.
6. `risk/rules/daily-loss.ts` tripped at least once in a test scenario, verified to halt trading and require manual reset via `engine-cli admin reset`.
7. **Crash recovery test:** engine container killed mid-run (`docker kill`) and restarted. Engine either (a) resumes cleanly from persisted state with no duplicated or lost orders, or (b) terminates cleanly with the run marked `crashed` in SQLite and no corrupted state. Verified by a scripted integration test.
8. No test or run uses real money. `LivePolymarketAdapter` is not implemented.

## 12. Explicit non-goals

- Not a platform. Not building 21 messaging channels or a marketplace.
- Not building a general-purpose backtest framework for arbitrary asset classes. The domain is prediction markets and crypto markets that connect to them.
- Not trying to beat HFT shops on latency. We are trying to trade correctly and safely with a few hundred milliseconds of latency budget.
- Not optimizing for ops scale. One operator, one machine, one Docker Compose file.

## 13. Open questions

- **Live-mode gate: "user_armed" mechanism.** Dashboard button + CLI flag both work. Need to decide whether the arm is sticky per strategy (once armed, stays armed across restarts until disarmed) or per-run (must be re-armed every start). Recommend sticky with explicit disarm — safer for long-running paper runs being promoted.
- **Paper capture storage cost.** A paper run at 15-minute Polymarket markets is small, but a month of BTC futures orderbook capture is gigabytes. Need a rotation / retention policy before v2.
- **Dashboard auth.** v1 runs on localhost; no auth. If the dashboard is ever exposed beyond localhost, auth is a v2 prerequisite.
