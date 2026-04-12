# trade-arbiter — Design Spec

**Date:** 2026-04-12
**Status:** Approved pending user review
**Repo root:** `trade-arbiter/`
**Package scope:** `@trade-arbiter/*`
**Binary:** `trade-arbiter`
**Database:** `trade-arbiter.db`

## 1. Purpose

trade-arbiter is a production-grade trading bot framework for prediction markets and connected markets (Polymarket, Kalshi, crypto perpetual futures). It combines the best ideas from three predecessor projects:

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
┌──────────────────────────────────────────────────────────────────────────┐
│ trade-arbiter-engine       │ trade-arbiter-dashboard │ trade-arbiter-research │
│ (TypeScript, long-run)     │ (TS + web)              │ (Python, jupyter)      │
└──────────────┬─────────────┴──────────┬──────────────┴─────────┬──────────┘
               │                        │                        │
               └────────────────────────┼────────────────────────┘
                                        │
                  ┌─────────────────────┴──────────────────────┐
                  │       SHARED STORAGE VOLUME                │
                  │  data/                                     │
                  │    trade-arbiter.db    (SQLite)            │
                  │    trade-arbiter.sock  (admin Unix socket) │
                  │    market/*.parquet    (append-only)       │
                  │    features/*.parquet  (per run)           │
                  │    backtest/*.parquet  (result exports)    │
                  │    config/*.yaml       (strategy configs)  │
                  └────────────────────────────────────────────┘
```

Engine and research share storage; there is no RPC between them. The dashboard server reads SQLite directly for historical views and talks to the engine's admin service over a Unix socket (`data/trade-arbiter.sock`) for control operations. The `trade-arbiter` CLI uses the same socket, so CLI and dashboard are peer clients of the engine's admin service.

### 3.2 Engine layers

```
                            ┌────────────────────────┐
                            │  AdminService          │◀──── trade-arbiter CLI
                            │  (Unix socket)         │◀──── dashboard server
                            └────────┬───────────────┘
                                     │
          ┌──────────────────────────┼───────────────────────────┐
          ▼                          ▼                           ▼
┌──────────────────┐   ┌──────────────────────┐   ┌──────────────────────┐
│ RunController    │   │ KillSwitchController │   │ StrategySupervisor   │
│ start/pause/     │   │ sole owner of        │   │ per-strategy state + │
│ resume/kill/arm  │   │ KillSwitchState      │   │ exception threshold  │
└──────┬───────────┘   └──────┬───────────────┘   └──────┬───────────────┘
       │                      │                           │
       │     (state changes broadcast on EventBus)        │
       └──────────────────────┴───────────────────────────┘

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

Above all of this sits the **EngineClock**. Every layer gets its timestamps from the clock, never from `Date.now()`. The admin service, run controller, kill-switch controller, and strategy supervisor all live in the same process as the event loop — they do not run in a separate thread or container.

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
- **RunController** — owns the lifecycle of one or more concurrent runs (start, pause, resume, kill). Thin layer above the Orchestrator that turns admin commands into structured state transitions and surfaces them back to the AdminService.
- **KillSwitchController** — single owner of kill-switch mutation. All trips and resets go through here; it writes to `risk_events`, updates `RiskState`, and broadcasts state changes on the bus. No other component is allowed to mutate `KillSwitchState` directly.
- **StrategySupervisor** — tracks per-strategy running state (running / paused / killed), catches unhandled exceptions emitted by strategy callbacks, applies the strategy-exception threshold that feeds the kill switch, and routes `pause_strategy` / `resume_strategy` admin commands.
- **AdminService** — long-lived in-process control surface. Exposes a small command interface over a Unix socket. Both the `trade-arbiter` CLI and the dashboard server are clients of this service. See Section 4.13.

## 4. Core Contracts

All types live in `@trade-arbiter/core`. Zero runtime dependencies. Importable by anything.

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

- Explicit user action (`trade-arbiter admin kill`, dashboard button, or future Telegram command)
- `DailyLossRule` exceeded
- `CircuitBreakerRule` triggered
- Strategy unhandled exception count exceeds threshold
- Risk manager unexpected internal error

Once tripped, the only way to untrip it is a manual `trade-arbiter admin reset-kill-switch` or the equivalent dashboard control. There is no automatic recovery. Kill switch state is persisted to `risk_events` on every trip and reset, and the current state is surfaced in the dashboard at all times.

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

### 4.13 AdminService

The engine exposes a tiny long-lived admin service in the same process as the event loop. It is bound to a local Unix socket (`data/trade-arbiter.sock`) and **never** listens on a TCP port in v1. Both the `trade-arbiter` CLI and the dashboard server connect as peer clients; there is no dashboard-to-engine coupling beyond this interface.

```typescript
type AdminCommand =
  | { kind: 'health' }
  | { kind: 'list_runs' }
  | { kind: 'show_run'; runId: RunId }
  | { kind: 'pause_strategy'; runId: RunId; strategyId: StrategyId }
  | { kind: 'resume_strategy'; runId: RunId; strategyId: StrategyId }
  | { kind: 'kill'; reason: string }
  | { kind: 'reset_kill_switch'; reason: string }
  | { kind: 'arm_live'; runId: RunId; strategyId: StrategyId; confirmation: string }
  | { kind: 'disarm_live'; runId: RunId; strategyId: StrategyId };

interface AdminResponse<T = unknown> {
  ok: boolean;
  ts: Timestamp;
  data?: T;
  error?: { code: string; message: string };
}

interface AdminService {
  start(): Promise<void>;
  stop(): Promise<void>;
  handle<T>(cmd: AdminCommand): Promise<AdminResponse<T>>;
}

interface AdminTransport {
  bind(service: AdminService): Promise<void>;
  close(): Promise<void>;
}
```

**Transport.** v1 ships a single transport: `UnixSocketAdminTransport`. It frames one JSON command per message, validates against an `AdminCommand` zod schema on the receive side, and rejects unknown kinds with `error.code = 'unknown_command'`. Socket file permissions are set to `0600` at bind so only the engine's UID can read/write. Dashboard, CLI, and any future transports (TCP, gRPC, HTTP) all speak the same command/response shapes.

**Command routing inside the engine.**

- `health`, `list_runs`, `show_run` — read-only; served from in-memory run state plus SQLite.
- `pause_strategy` / `resume_strategy` — handed off to `StrategySupervisor`, which flips per-strategy state and acknowledges once the next queued event will observe the change.
- `kill` / `reset_kill_switch` — handed off to `KillSwitchController` (the only component allowed to mutate `KillSwitchState`). Both commands are persisted to `risk_events` with the command's `reason` field.
- `arm_live` / `disarm_live` — handed off to `RunController`. Arming is per-run (see Section 13) and requires a matching `confirmation` string proving intent; the call fails if any `live_gate` precondition does not hold.

**v1 command set.** The commands above are the v1 surface. Nothing else goes through the admin service in v1: strategy configs are loaded from YAML at start time, backtests are spawned as separate engine processes, and observability beyond `show_run` is served by the dashboard reading SQLite directly.

**v1.1 / v2 additions.**

- Streaming event subscriptions (`subscribe_events`) over the same socket, so the dashboard can tail live intents / risk events without polling.
- `tail_intents`, `tail_risk_events` one-shot tails for CLI ergonomics.
- `feed_health` / `adapter_health` for feed lag and adapter connection status.
- Config hot-reload (`reload_strategy_config`), once write-mode config editing lands.

All additions extend the `AdminCommand` union; the transport, framing, and UID-only socket permissions do not change.

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
  user_armed: required        # per-run arm via `trade-arbiter admin arm-live`; see Section 13
```

Orchestrator validates at startup. Refuses to start a `live` strategy unless every `live_gate` precondition holds. `user_armed: required` is declarative — the operator still has to issue a fresh `arm_live` admin command on every run before any intent reaches the live adapter. See Section 13 for the full per-run arm lifecycle.

## 8. Parity Testing

Three parity tests, runnable via `trade-arbiter parity`:

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

React (or similar) frontend. The dashboard server is **not** special-cased: it is an ordinary client of the engine's `AdminService` (Section 4.13) over `data/trade-arbiter.sock`, and it reads SQLite directly for historical views. Control actions (start / pause / resume / kill / reset-kill-switch / arm-live / disarm-live) are issued as `AdminCommand`s; the CLI uses the exact same commands through the exact same socket.

**Panels:**

- **Live positions** — current open positions with mark-to-market, per-strategy P&L, total equity.
- **P&L chart** — intraday equity curve for the current run.
- **Strategy status** — per strategy: mode (paper/live), status (running/paused/killed/awaiting_arm), last N intents, last fill, current paper/live gate progress.
- **Intent stream** — live-updating feed of every intent:

```
ts          venue   symbol    side  req → approved  reason
16:24:31.2  poly    btc-up    buy   5.0 → 5.0       reversal
16:24:31.3  poly    btc-down  buy   5.0 → 3.2       kelly_reduced
16:24:45.8  poly    eth-up    buy   5.0 → 0.0       daily_loss_hit
```

In v1 the intent stream is served by polling SQLite. In v1.1 it moves to the `subscribe_events` admin command.

- **Trade log** — filterable by run, strategy, venue, symbol. Joins intents → requests → fills.
- **Risk events** — live feed of risk events with severity coloring. Kill switch state prominently displayed.
- **Controls** — per-strategy start / pause / resume (issues `pause_strategy` / `resume_strategy`). Global kill switch button (red, confirm dialog; issues `kill`). Reset kill switch button behind a second confirm (`reset_kill_switch`). Live arm / disarm buttons behind an explicit strategy-name confirmation (`arm_live` / `disarm_live`).

Write-mode config editing, backtest result viewer, and parameter sweep UI are v2.

## 10. Project Structure (monorepo)

```
trade-arbiter/
├── docker-compose.yml
├── package.json                   (workspace root)
├── packages/
│   ├── core/                      (@trade-arbiter/core — contracts only, zero runtime deps)
│   │   ├── src/
│   │   │   ├── events.ts          EngineEvent, MarketEvent, FillEvent, OrderEvent
│   │   │   ├── intents.ts         OrderIntent, OrderRequest, OrderStatus
│   │   │   ├── portfolio.ts       PositionState, PortfolioState
│   │   │   ├── context.ts         RunContext, EngineClock
│   │   │   ├── strategy.ts        Strategy, StrategyContext
│   │   │   ├── adapter.ts         ExecutionAdapter, DataFeed
│   │   │   ├── risk.ts            RiskRule, RiskDecision, KillSwitchState
│   │   │   └── admin.ts           AdminCommand, AdminResponse, AdminService
│   │   └── test/
│   │
│   ├── engine/                    (@trade-arbiter/engine — long-running process)
│   │   ├── src/
│   │   │   ├── bin/trade-arbiter.ts    single binary; subcommands below dispatch to admin socket
│   │   │   ├── cli/
│   │   │   │   ├── index.ts            argument parsing + subcommand registry
│   │   │   │   ├── run.ts              starts engine process (no admin call)
│   │   │   │   ├── backtest.ts         starts engine process in backtest mode
│   │   │   │   ├── parity.ts           local parity runner
│   │   │   │   └── admin.ts            client for health/list-runs/show-run/
│   │   │   │                           pause-strategy/resume-strategy/kill/
│   │   │   │                           reset-kill-switch/arm-live/disarm-live
│   │   │   ├── admin/
│   │   │   │   ├── admin-service.ts        implements AdminService
│   │   │   │   ├── unix-socket-transport.ts UnixSocketAdminTransport
│   │   │   │   ├── run-controller.ts       start/pause/resume/kill runs
│   │   │   │   ├── kill-switch-controller.ts  sole owner of KillSwitchState
│   │   │   │   └── strategy-supervisor.ts  per-strategy state + exception threshold
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
│   ├── strategies/                (@trade-arbiter/strategies — plug-ins)
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
│   └── dashboard/                 (@trade-arbiter/dashboard)
│       ├── server/
│       │   └── src/               connects to data/trade-arbiter.sock for control,
│       │                          reads SQLite for historical views
│       └── web/
│           └── src/
│
├── research/                      (Python sidecar)
│   ├── pyproject.toml
│   ├── trade_arbiter_research/
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
│   ├── trade-arbiter.db
│   ├── trade-arbiter.sock         admin Unix socket (created by engine at startup)
│   ├── market/
│   ├── features/
│   └── backtest/
│
└── docs/
    └── superpowers/
        └── specs/
            └── 2026-04-12-trade-arbiter-design.md
```

**Dependency direction** is structural: `core` has no dependencies; `strategies` depends only on `core`; `engine` depends on `core` and `strategies`; `dashboard` depends on `core` (for `AdminCommand` / `AdminResponse` shapes), reads SQLite directly for historical views, and talks to the engine over `data/trade-arbiter.sock` for control. A strategy cannot accidentally import from the engine because the engine is not visible from the strategies package.

## 11. v1 Scope

### 11.1 In scope

- `@trade-arbiter/core` — all contracts in Section 4
- `@trade-arbiter/engine`:
  - EventQueue, EventBus
  - WallClock, BacktestClock
  - ParquetReplayFeed, PolymarketWSFeed, BinanceWSFeed
  - SimpleSimAdapter, L2SimAdapter, PaperAdapter, PaperCaptureWriter
  - OrderManager
  - RiskManager with all 7 rules
  - KillSwitchController (sole owner of KillSwitchState)
  - RunController
  - StrategySupervisor
  - AdminService + UnixSocketAdminTransport (v1 command set in Section 4.13)
  - PortfolioService
  - PersistenceService (SQLite + Parquet writers)
  - Orchestrator + RunManifest
  - Config loader (YAML + zod + config hashing)
  - `trade-arbiter` binary with subcommands: `run`, `backtest`, `parity`, `admin <cmd>` where `<cmd>` is one of `health | list-runs | show-run | pause-strategy | resume-strategy | kill | reset-kill-switch | arm-live | disarm-live`. `run` and `backtest` start the engine process; the rest are thin clients that open `data/trade-arbiter.sock` and dispatch an `AdminCommand`.
- `@trade-arbiter/strategies`:
  - **HedgedMeanReversion** — one strategy, ported from Polymarket-Arbitrage-Trading-Bot, rewritten against the `Strategy` interface
- `@trade-arbiter/dashboard` — all panels in Section 9; server talks to admin socket for control, reads SQLite for historical views
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

1. `trade-arbiter backtest --strategy hedged-btc-15m --range 2025-10-01:2025-12-31 --mode backtest_l1` completes: fills, P&L, equity curve exported to Parquet.
2. Same run in `--mode backtest_l2` completes; L1 vs L2 parity test passes for intents (tolerance 1000ms).
3. `trade-arbiter run --strategy hedged-btc-15m --mode paper` runs against live Polymarket WS for **at least 24 hours**, produces **at least 30 risk-approved intents**, and does not crash.
4. Dashboard shows the paper run live with working kill switch, intent stream, position panel, and risk events feed. All control buttons route through the admin Unix socket (`data/trade-arbiter.sock`).
5. `trade-arbiter parity --run-a <paper> --run-b <backtest>` passes for a shared window.
6. `risk/rules/daily-loss.ts` tripped at least once in a test scenario, verified to halt trading and require manual reset via `trade-arbiter admin reset-kill-switch`.
7. **Crash recovery test:** engine container killed mid-run (`docker kill`) and restarted. Engine either (a) resumes cleanly from persisted state with no duplicated or lost orders, or (b) terminates cleanly with the run marked `crashed` in SQLite and no corrupted state. Verified by a scripted integration test.
8. No test or run uses real money. `LivePolymarketAdapter` is not implemented.

## 12. Explicit non-goals

- Not a platform. Not building 21 messaging channels or a marketplace.
- Not building a general-purpose backtest framework for arbitrary asset classes. The domain is prediction markets and crypto markets that connect to them.
- Not trying to beat HFT shops on latency. We are trying to trade correctly and safely with a few hundred milliseconds of latency budget.
- Not optimizing for ops scale. One operator, one machine, one Docker Compose file.

## 13. Live-mode gate

The live-mode gate is **per-run, not sticky**. Every time the engine starts a strategy in `mode: live`, the operator must issue a fresh `arm_live` admin command (via dashboard button or `trade-arbiter admin arm-live`) before any intent from that strategy can reach the live execution adapter. The arm state lives in-memory on the `RunController`; restarting the engine, crashing, or cycling the run all clear it. This is deliberately annoying: every live start is a deliberate, recent human action, and there is no way for a forgotten arm to persist across a weekend.

Concretely:

- `config.live_gate.user_armed: required` is a declaration of intent; it does not by itself arm anything.
- On startup, a live strategy's `RunController` enters the `awaiting_arm` state. Intents from the strategy are rejected at the risk layer with `reason: 'live_not_armed'` until the arm command arrives.
- `arm_live` requires the caller to supply a `confirmation` string (the full `strategyId`) which `RunController` checks before flipping the arm bit. This is cheap protection against fat-fingering a dashboard button.
- `disarm_live` flips the bit back off. Restarting the engine is equivalent to disarming everything.
- All arm / disarm actions are persisted to `risk_events` with the triggering command's reason, so the full arm history is queryable after the fact.

The other `live_gate` preconditions (min paper sessions, min paper trades, min runtime hours, parity check) are checked at startup: if any of them fail, `RunController` refuses to enter `awaiting_arm` at all and the run fails fast with a clear error.

## 14. Open questions

- **Paper capture storage cost.** A paper run at 15-minute Polymarket markets is small, but a month of BTC futures orderbook capture is gigabytes. Need a rotation / retention policy before v2.
- **Dashboard auth.** v1 runs on localhost; no auth, and the admin Unix socket is permission-gated to the engine's UID. If the dashboard is ever exposed beyond localhost (or another user on the same box needs access), auth on both the HTTP layer and the admin transport is a v2 prerequisite.
