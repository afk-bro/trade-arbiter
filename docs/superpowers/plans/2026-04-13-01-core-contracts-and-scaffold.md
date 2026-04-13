# trade-arbiter Plan 1 — Core Contracts and Monorepo Scaffold

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the `trade-arbiter/` monorepo with the `@trade-arbiter/core` package containing every contract from Section 4 of the design spec, plus a green `npm run ci` covering typecheck and tests.

**Architecture:** npm workspaces monorepo. `@trade-arbiter/core` is a pure-types package: zero runtime dependencies, every interface from Section 4 of the spec, plus a small set of runtime constants (`MODES`, `VENUES`, `MARKET_EVENT_TYPES`, `ORDER_STATUSES`, `FILL_STATUSES`) used for config validation and dropdown enumeration. Tests are mostly "compile-check" tests — each test constructs a literal of a contract type, and if the interface drifts the test file fails to typecheck.

**Tech Stack:**
- Node 22+ (uses the native test runner via `node --test`)
- TypeScript 5.6+ in `strict` mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax`
- `tsx` as the Node loader — lets us run `.ts` source directly under `node --test` with no build step
- npm workspaces (no pnpm/yarn — keep tooling minimal)
- No bundler, no ESLint, no Prettier in Plan 1 — added in later plans when there is something to lint/format

**Spec sections covered:** All of Section 4 (Core Contracts).

**Spec sections deliberately deferred:**
- Section 3 engine internals → Plan 2 onward
- Section 5 data flow → exercised end-to-end in Plan 2
- Section 6 persistence schemas → Plan 2
- Section 7 strategy configs → Plan 2 fixture, real loader in Plan 3
- Sections 8–11 → later plans
- Section 13 (live-mode gate) → `LiveArmRule` *interface* is satisfied by `RiskRule` in core; the rule *implementation* lands in Plan 2 alongside the rest of the rule set
- Section 4.13 AdminService → contract types defined in `admin.ts` here; implementation deferred to Plan 6

---

## Repo Layout Note

The working directory is `arbitrage_trading/`. Inside it live three reference projects (`CloddsBot/`, `Polymarket-Arbitrage-Trading-Bot/`, `polymarket-5min-15min-1hour-arbitrage-trading-bot-tools/`, all gitignored) plus `docs/` (already populated with the design spec) and the existing `.git/`. Plan 1 creates a new top-level subdirectory `trade-arbiter/` and does **all** monorepo work inside it.

The spec's Section 10 project structure shows `docs/` as a child of `trade-arbiter/`. The actual filesystem has `docs/` as a sibling. This is intentional and not worth fixing in this plan: `arbitrage_trading/` is the work area where the new project lives alongside reference checkouts, and `trade-arbiter/` is the shippable package.

---

## Final File Layout After Plan 1

```
arbitrage_trading/
├── .git/                                              (already exists)
├── .gitignore                                         (already exists; one addition)
├── CloddsBot/                                         (reference, gitignored)
├── Polymarket-Arbitrage-Trading-Bot/                  (reference, gitignored)
├── polymarket-5min-15min-1hour-arbitrage-trading-bot-tools/ (reference, gitignored)
├── docs/                                              (already exists)
│   └── superpowers/
│       ├── specs/2026-04-12-trade-arbiter-design.md
│       └── plans/2026-04-13-01-core-contracts-and-scaffold.md   (THIS FILE)
└── trade-arbiter/                                     (NEW — created by this plan)
    ├── .github/workflows/ci.yml
    ├── package.json                                   (workspace root)
    ├── package-lock.json                              (generated)
    ├── tsconfig.base.json
    └── packages/
        └── core/
            ├── package.json
            ├── tsconfig.json
            ├── src/
            │   ├── index.ts                           barrel re-exports
            │   ├── primitives.ts                      Mode, Venue, Side, OutcomeToken, Symbol, Timestamp, RunId, StrategyId, ConfigHash, MODES, VENUES
            │   ├── context.ts                         RunContext, EngineClock
            │   ├── events.ts                          EngineEvent, MarketEvent + 4 subtypes, MARKET_EVENT_TYPES
            │   ├── intents.ts                         StrategySignalMeta, OrderIntent, OrderRequest, OrderStatus, OrderEvent, FillStatus, FillEvent, ORDER_STATUSES, FILL_STATUSES
            │   ├── portfolio.ts                       PositionState, PortfolioState
            │   ├── strategy.ts                        Logger, StrategyContext, Strategy
            │   ├── adapter.ts                         ExecutionAdapter, DataFeed
            │   ├── risk.ts                            RiskCheck, RiskRule, RiskDecision, RiskState, KillSwitchState, RiskManager
            │   ├── bus.ts                             EventQueue, EventBus
            │   ├── order-manager.ts                   OrderLineage, OrderManager
            │   └── admin.ts                           AdminCommand, AdminCommandKind, AdminResponse, AdminService, AdminTransport
            └── test/
                ├── smoke.test.ts                      sanity check
                ├── primitives.test.ts                 MODES/VENUES runtime + compile-check
                ├── context.test.ts                    compile-check
                ├── events.test.ts                     compile-check + MARKET_EVENT_TYPES runtime
                ├── intents.test.ts                    compile-check + status arrays runtime
                ├── portfolio.test.ts                  compile-check
                ├── strategy.test.ts                   compile-check
                ├── adapter.test.ts                    compile-check
                ├── risk.test.ts                       compile-check
                ├── bus.test.ts                        compile-check
                ├── order-manager.test.ts              compile-check
                ├── admin.test.ts                      compile-check
                └── public-surface.test.ts             imports every name from '@trade-arbiter/core'
```

---

## Test Strategy

Two flavors of test in this plan:

**1. Compile-check tests.** Each contract file gets a test that constructs a literal value matching the type:

```ts
import { test } from 'node:test';
import type { OrderIntent } from '../src/intents.js';

test('OrderIntent compile shape', () => {
  const intent: OrderIntent = {
    intentId: 'i1',
    /* every required field */
  };
  void intent;
});
```

The test body is trivially `void intent;`. The value of the test is that **tsc has to compile the literal**. If you remove or rename a required field, the test file no longer typechecks and `npm run typecheck` fails — that is the failing-test signal in TDD step 2 of every contract task.

**2. Runtime constant tests.** A handful of types in core have a companion runtime array (e.g., `MODES: readonly Mode[] = [...]`). These get real assertions: `assert.deepEqual(MODES, ['backtest_l1', 'backtest_l2', 'paper', 'live'])`.

Why no DI/mocking framework, no behavior tests in Plan 1? Because there is no behavior in Plan 1 — `@trade-arbiter/core` is types and a few `as const` arrays. Real behavior tests start in Plan 2.

**Module resolution note.** All source files in this plan use `.js` extensions in import paths (e.g., `import type { X } from './primitives.js';`). With NodeNext module resolution, TypeScript reads this as "the file ending in `.ts`" at typecheck time, and `tsx` resolves it to the `.ts` source at runtime. This is the standard ESM-TypeScript pattern and avoids needing `allowImportingTsExtensions`, which would otherwise lock us into `--noEmit`.

---

## Task 1: Initialize trade-arbiter/ workspace root

**Files:**
- Create: `trade-arbiter/package.json`
- Create: `trade-arbiter/tsconfig.base.json`
- Modify: `.gitignore` (add `trade-arbiter/node_modules/` and friends)

- [ ] **Step 1: Create the `trade-arbiter/` directory**

From `arbitrage_trading/`:

```bash
mkdir -p trade-arbiter/packages
```

- [ ] **Step 2: Create the workspace root `package.json`**

Write `trade-arbiter/package.json`:

```json
{
  "name": "trade-arbiter",
  "version": "0.0.0",
  "private": true,
  "description": "Production-grade trading bot framework for prediction and connected markets.",
  "type": "module",
  "engines": {
    "node": ">=22.0.0"
  },
  "workspaces": [
    "packages/*"
  ],
  "scripts": {
    "typecheck": "npm run typecheck --workspaces --if-present",
    "test": "npm run test --workspaces --if-present",
    "ci": "npm run typecheck && npm run test"
  },
  "devDependencies": {
    "@types/node": "^22.7.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0"
  }
}
```

The `--if-present` flag on the workspace scripts means it is fine to add packages later that don't define their own `typecheck` or `test` scripts — npm just skips them. The `ci` script is the canonical entry point for both local and remote CI.

- [ ] **Step 3: Create the shared TypeScript config**

Write `trade-arbiter/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noFallthroughCasesInSwitch": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "forceConsistentCasingInFileNames": true,
    "isolatedModules": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true,
    "verbatimModuleSyntax": true
  }
}
```

`exactOptionalPropertyTypes` distinguishes `field?: T` from `field: T | undefined` — important because the spec uses `?` to mean "optional, may be omitted". `verbatimModuleSyntax` forces explicit `import type` for type-only imports, which the contracts package will benefit from since most imports are types.

- [ ] **Step 4: Update `.gitignore` to ignore monorepo build outputs**

Edit `arbitrage_trading/.gitignore`. Append (the file already exists with reference-project ignores and generic Node entries):

```
# trade-arbiter monorepo build outputs
trade-arbiter/node_modules/
trade-arbiter/**/dist/
trade-arbiter/**/*.tsbuildinfo
```

Do **not** gitignore `package-lock.json` — it's committed deliberately for reproducible installs.

- [ ] **Step 5: Run `npm install` and confirm the workspace resolves**

Run from `arbitrage_trading/`:

```bash
cd trade-arbiter && npm install && cd ..
```

Expected: `added N packages` (N is some small number — typescript, tsx, @types/node and their transitive deps). A `package-lock.json` is created. No errors. The directory `trade-arbiter/node_modules/` exists.

- [ ] **Step 6: Confirm typecheck and test scripts run as no-ops**

Run from `arbitrage_trading/`:

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: prints `> trade-arbiter@0.0.0 typecheck` then nothing else (no workspaces yet). Exit code 0.

```bash
cd trade-arbiter && npm test && cd ..
```

Expected: same — no workspaces means nothing to run. Exit code 0.

- [ ] **Step 7: Commit**

Run from `arbitrage_trading/`:

```bash
git add .gitignore trade-arbiter/package.json trade-arbiter/tsconfig.base.json trade-arbiter/package-lock.json
git commit -m "scaffold: trade-arbiter monorepo workspace root"
```

---

## Task 2: Scaffold the @trade-arbiter/core package with a smoke test

**Files:**
- Create: `trade-arbiter/packages/core/package.json`
- Create: `trade-arbiter/packages/core/tsconfig.json`
- Create: `trade-arbiter/packages/core/src/index.ts`
- Create: `trade-arbiter/packages/core/test/smoke.test.ts`

- [ ] **Step 1: Create the core package directory**

From `arbitrage_trading/`:

```bash
mkdir -p trade-arbiter/packages/core/src trade-arbiter/packages/core/test
```

- [ ] **Step 2: Create `packages/core/package.json`**

Write `trade-arbiter/packages/core/package.json`:

```json
{
  "name": "@trade-arbiter/core",
  "version": "0.0.0",
  "private": true,
  "description": "Type contracts shared by all trade-arbiter packages. Zero runtime dependencies.",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "default": "./src/index.ts"
    }
  },
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --test --import tsx 'test/**/*.test.ts'"
  }
}
```

The `main`/`types`/`exports` fields point at `src/index.ts` directly — no build step. Other in-repo packages will import via `@trade-arbiter/core` and TypeScript + tsx will resolve straight to source.

The `test` script quotes the glob (`'test/**/*.test.ts'`) so the shell does not expand it before `node` sees it. Node 22's native test runner handles globs internally; an unquoted glob would be expanded by `/bin/sh` and would fail on a fresh repo where `test/` is empty.

- [ ] **Step 3: Create `packages/core/tsconfig.json`**

Write `trade-arbiter/packages/core/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "dist",
    "types": ["node"]
  },
  "include": ["src/**/*", "test/**/*"]
}
```

`outDir` is set even though we never actually emit — it just keeps tsc happy if the engineer runs `tsc` without `--noEmit` for any reason. `types: ["node"]` pulls in `@types/node` so `node:test` and `node:assert/strict` resolve.

- [ ] **Step 4: Create the empty barrel `src/index.ts`**

Write `trade-arbiter/packages/core/src/index.ts`:

```ts
export {};
```

This is intentionally empty for now. Each subsequent contract task will add an `export * from './<file>.js';` line, and Task 14 will replace this stub with the full barrel.

- [ ] **Step 5: Create the smoke test**

Write `trade-arbiter/packages/core/test/smoke.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('smoke: arithmetic still works', () => {
  assert.equal(1 + 1, 2);
});
```

This exists so `npm test` always runs at least one assertion — useful when CI is set up before any real tests exist.

- [ ] **Step 6: Verify typecheck passes**

Run from `arbitrage_trading/`:

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: prints `> @trade-arbiter/core@0.0.0 typecheck` and then no further output. Exit code 0.

- [ ] **Step 7: Verify the smoke test runs**

```bash
cd trade-arbiter && npm test && cd ..
```

Expected output includes:

```
ℹ tests 1
ℹ pass 1
ℹ fail 0
```

Exit code 0.

- [ ] **Step 8: Commit**

```bash
git add trade-arbiter/packages/core trade-arbiter/package-lock.json
git commit -m "scaffold: @trade-arbiter/core package with smoke test"
```

---

## Task 3: primitives.ts — base scalar types and runtime constants

Implements Section 4.1 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/primitives.ts`
- Create: `trade-arbiter/packages/core/test/primitives.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/primitives.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES,
  VENUES,
  type Mode,
  type Venue,
  type Side,
  type OutcomeToken,
  type Timestamp,
  type RunId,
  type StrategyId,
  type ConfigHash,
  type Symbol as InstrumentSymbol,
} from '../src/primitives.js';

test('MODES contains the four execution modes in declaration order', () => {
  assert.deepEqual(MODES, ['backtest_l1', 'backtest_l2', 'paper', 'live']);
});

test('VENUES contains all v1+v2 venues', () => {
  assert.deepEqual(
    [...VENUES].sort(),
    ['binance', 'hyperliquid', 'kalshi', 'polymarket'],
  );
});

test('primitive types compile in literal values', () => {
  const ts: Timestamp = 0;
  const runId: RunId = 'r1';
  const strategyId: StrategyId = 's1';
  const configHash: ConfigHash = 'h1';
  const sym: InstrumentSymbol = 'btc-up-15m';
  const side: Side = 'buy';
  const outcomeYes: OutcomeToken = 'YES';
  const outcomeNo: OutcomeToken = 'NO';
  const outcomeNull: OutcomeToken = null;
  const mode: Mode = 'backtest_l1';
  const venue: Venue = 'polymarket';
  void ts; void runId; void strategyId; void configHash; void sym;
  void side; void outcomeYes; void outcomeNo; void outcomeNull; void mode; void venue;
});
```

The `Symbol` type from `primitives.ts` shadows the global `Symbol` if imported with that exact name, so we alias it to `InstrumentSymbol` on import. Downstream packages can do the same.

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: tsc errors, something like `Cannot find module '../src/primitives.js' or its corresponding type declarations`. Exit code non-zero. **This is the failing-test signal.**

- [ ] **Step 3: Implement `primitives.ts`**

Write `trade-arbiter/packages/core/src/primitives.ts`:

```ts
/**
 * Base scalar types and runtime constants shared by every contract.
 * Section 4.1 of the design spec.
 */

/** Engine-wide canonical timestamp: epoch milliseconds. */
export type Timestamp = number;

/** ULID assigned per run. */
export type RunId = string;

/** Stable identifier for a strategy instance, e.g. `hedged-btc-15m`. */
export type StrategyId = string;

/** sha256 of the resolved YAML config, computed at load. */
export type ConfigHash = string;

/**
 * Venue-native instrument symbol. Opaque string.
 *
 * NOTE: this name shadows the global `Symbol` constructor when imported
 * unqualified. Downstream packages should alias on import:
 * `import type { Symbol as InstrumentSymbol } from '@trade-arbiter/core';`
 */
export type Symbol = string;

/** Execution mode of a run. Strategies are blind to this — see Rule 1. */
export type Mode = 'backtest_l1' | 'backtest_l2' | 'paper' | 'live';

/** Venues supported across v1 and v2. */
export type Venue = 'polymarket' | 'kalshi' | 'binance' | 'hyperliquid';

/** Order side. */
export type Side = 'buy' | 'sell';

/**
 * Outcome token for binary prediction markets.
 * `null` means a non-binary venue (futures, perps).
 */
export type OutcomeToken = 'YES' | 'NO' | null;

/**
 * Runtime list of every Mode in declaration order. Used by config validators
 * and by tests that want to enumerate modes.
 */
export const MODES = [
  'backtest_l1',
  'backtest_l2',
  'paper',
  'live',
] as const satisfies readonly Mode[];

/**
 * Runtime list of every Venue. Order is not load-bearing.
 */
export const VENUES = [
  'polymarket',
  'kalshi',
  'binance',
  'hyperliquid',
] as const satisfies readonly Venue[];
```

- [ ] **Step 4: Run typecheck and confirm it passes**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: no output, exit code 0.

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd trade-arbiter && npm test && cd ..
```

Expected output includes `pass 4` (one smoke test + three primitives tests).

- [ ] **Step 6: Commit**

```bash
git add trade-arbiter/packages/core/src/primitives.ts trade-arbiter/packages/core/test/primitives.test.ts
git commit -m "core: add primitive types and MODES/VENUES constants"
```

---

## Task 4: context.ts — RunContext and EngineClock

Implements Section 4.1 (RunContext) and 4.2 (EngineClock) of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/context.ts`
- Create: `trade-arbiter/packages/core/test/context.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/context.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { RunContext, EngineClock } from '../src/context.js';

test('RunContext compile shape', () => {
  const ctx: RunContext = {
    runId: 'r1',
    strategyId: 's1',
    configHash: 'h1',
    mode: 'backtest_l1',
  };
  void ctx;
});

test('EngineClock compile shape with paper-mode wall clock', () => {
  let nowValue = 1000;
  const clock: EngineClock = {
    mode: 'paper',
    now: () => nowValue,
  };
  assert.equal(clock.now(), 1000);
  nowValue = 2000;
  assert.equal(clock.now(), 2000);
});

test('EngineClock compile shape with backtest clock', () => {
  const clock: EngineClock = {
    mode: 'backtest_l1',
    now: () => 0,
  };
  assert.equal(clock.mode, 'backtest_l1');
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/context.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `context.ts`**

Write `trade-arbiter/packages/core/src/context.ts`:

```ts
/**
 * Run identification and clock contracts.
 * Sections 4.1 and 4.2 of the design spec.
 */
import type { ConfigHash, Mode, RunId, StrategyId, Timestamp } from './primitives.js';

/**
 * Identifies the run a given event/intent/decision belongs to. Every event
 * envelope and every persisted row carries one of these.
 */
export interface RunContext {
  runId: RunId;
  strategyId: StrategyId;
  configHash: ConfigHash;
  mode: Mode;
}

/**
 * Time authority for the engine. WallClock in paper/live, BacktestClock in
 * replay. Strategies receive the clock via StrategyContext and MUST NOT call
 * `Date.now()` or `new Date()` directly — see Rule 4 (deterministic event loop).
 */
export interface EngineClock {
  readonly mode: Mode;
  now(): Timestamp;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: typecheck passes, tests show `pass 7` (smoke + 3 primitives + 3 context).

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/context.ts trade-arbiter/packages/core/test/context.test.ts
git commit -m "core: add RunContext and EngineClock interfaces"
```

---

## Task 5: events.ts — EngineEvent envelope and MarketEvent union

Implements Sections 4.3 (event envelope) and 4.4 (market data) of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/events.ts`
- Create: `trade-arbiter/packages/core/test/events.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/events.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  EngineEvent,
  MarketEvent,
  MarketEventType,
  BaseMarketEvent,
  QuoteEvent,
  TradeEvent,
  OrderBookEvent,
  CandleEvent,
} from '../src/events.js';
import { MARKET_EVENT_TYPES } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1',
  strategyId: 's1',
  configHash: 'h1',
  mode: 'paper',
};

test('MARKET_EVENT_TYPES enumerates every market event kind', () => {
  assert.deepEqual(
    [...MARKET_EVENT_TYPES].sort(),
    ['candle', 'funding', 'oracle', 'orderbook', 'quote', 'trade'],
  );
});

test('MarketEventType type accepts all listed kinds', () => {
  const _types: MarketEventType[] = ['quote', 'trade', 'orderbook', 'candle', 'funding', 'oracle'];
  void _types;
});

test('BaseMarketEvent compile shape with optional seq and mid', () => {
  const base: BaseMarketEvent = {
    type: 'quote',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    seq: 100,
    mid: 0.48,
  };
  void base;
});

test('QuoteEvent compile shape', () => {
  const ev: QuoteEvent = {
    type: 'quote',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    bid: 0.47,
    ask: 0.49,
    bidSize: 100,
    askSize: 80,
  };
  assert.equal(ev.type, 'quote');
});

test('TradeEvent compile shape', () => {
  const ev: TradeEvent = {
    type: 'trade',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    price: 0.48,
    size: 5,
    side: 'buy',
  };
  assert.equal(ev.side, 'buy');
});

test('OrderBookEvent compile shape', () => {
  const ev: OrderBookEvent = {
    type: 'orderbook',
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    bids: [[0.47, 100], [0.46, 200]],
    asks: [[0.49, 80], [0.50, 120]],
  };
  assert.equal(ev.bids.length, 2);
  assert.equal(ev.asks.length, 2);
});

test('CandleEvent compile shape', () => {
  const ev: CandleEvent = {
    type: 'candle',
    venue: 'binance',
    symbol: 'BTCUSDT',
    tsExchange: 1,
    tsReceived: 2,
    interval: '1m',
    o: 100, h: 110, l: 95, c: 105, v: 1234,
  };
  assert.equal(ev.interval, '1m');
});

test('MarketEvent union accepts every concrete subtype', () => {
  const evs: MarketEvent[] = [
    { type: 'quote', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bid: 0, ask: 0, bidSize: 0, askSize: 0 },
    { type: 'trade', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, price: 0, size: 0, side: 'buy' },
    { type: 'orderbook', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bids: [], asks: [] },
    { type: 'candle', venue: 'binance', symbol: 's', tsExchange: 0, tsReceived: 0, interval: '1m', o: 0, h: 0, l: 0, c: 0, v: 0 },
  ];
  assert.equal(evs.length, 4);
});

test('EngineEvent envelope wraps a payload with ctx and ts', () => {
  const ev: EngineEvent<{ message: string }> = {
    eventId: 'e1',
    ctx,
    ts: 0,
    payload: { message: 'hi' },
  };
  assert.equal(ev.payload.message, 'hi');
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/events.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `events.ts`**

Write `trade-arbiter/packages/core/src/events.ts`:

```ts
/**
 * Engine event envelope and market data payloads.
 * Sections 4.3 and 4.4 of the design spec.
 */
import type { RunContext } from './context.js';
import type { Side, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * Generic envelope wrapping every payload that flows on the bus / queue.
 * `eventId` is a ULID, globally unique within a run; `ts` is the engine
 * timestamp at the moment the event was enqueued.
 */
export interface EngineEvent<T> {
  eventId: string;
  ctx: RunContext;
  ts: Timestamp;
  payload: T;
}

/** Discriminator for the MarketEvent union. */
export type MarketEventType =
  | 'quote'
  | 'trade'
  | 'orderbook'
  | 'candle'
  | 'funding'
  | 'oracle';

/** Runtime list of every MarketEventType. */
export const MARKET_EVENT_TYPES = [
  'quote',
  'trade',
  'orderbook',
  'candle',
  'funding',
  'oracle',
] as const satisfies readonly MarketEventType[];

/**
 * Fields common to every MarketEvent. `tsExchange` is authoritative for
 * deterministic ordering; `tsReceived` is the local receipt time and is only
 * useful for measuring feed lag.
 */
export interface BaseMarketEvent {
  type: MarketEventType;
  venue: Venue;
  symbol: Symbol;
  tsExchange: Timestamp;
  tsReceived: Timestamp;
  /** Venue sequence number, when the venue provides one. */
  seq?: number;
  /** Venue-normalized mid, when derivable. */
  mid?: number;
}

export interface QuoteEvent extends BaseMarketEvent {
  type: 'quote';
  bid: number;
  ask: number;
  bidSize: number;
  askSize: number;
}

export interface TradeEvent extends BaseMarketEvent {
  type: 'trade';
  price: number;
  size: number;
  side: Side;
}

export interface OrderBookEvent extends BaseMarketEvent {
  type: 'orderbook';
  /** Each entry is `[price, size]`. Sorted high-to-low for bids, low-to-high for asks. */
  bids: ReadonlyArray<readonly [number, number]>;
  asks: ReadonlyArray<readonly [number, number]>;
}

export interface CandleEvent extends BaseMarketEvent {
  type: 'candle';
  interval: string;
  o: number;
  h: number;
  l: number;
  c: number;
  v: number;
}

/**
 * The full MarketEvent discriminated union. Strategies switch on `type` to
 * narrow to a concrete event. `funding` and `oracle` payloads are not defined
 * in v1 — their interfaces will be added when the strategies that need them
 * are ported. Until then, the discriminator is reserved.
 */
export type MarketEvent = QuoteEvent | TradeEvent | OrderBookEvent | CandleEvent;
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: typecheck passes, all events tests pass.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/events.ts trade-arbiter/packages/core/test/events.test.ts
git commit -m "core: add EngineEvent envelope and MarketEvent union"
```

---

## Task 6: intents.ts — OrderIntent / OrderRequest / OrderEvent / FillEvent

Implements Section 4.5 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/intents.ts`
- Create: `trade-arbiter/packages/core/test/intents.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/intents.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  StrategySignalMeta,
  OrderIntent,
  OrderRequest,
  OrderStatus,
  OrderEvent,
  FillStatus,
  FillEvent,
} from '../src/intents.js';
import { ORDER_STATUSES, FILL_STATUSES } from '../src/intents.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};

test('ORDER_STATUSES enumerates the seven lifecycle states', () => {
  assert.deepEqual(
    [...ORDER_STATUSES].sort(),
    ['cancelled', 'expired', 'filled', 'open', 'partially_filled', 'pending', 'rejected'],
  );
});

test('FILL_STATUSES enumerates the five terminal/partial states', () => {
  assert.deepEqual(
    [...FILL_STATUSES].sort(),
    ['cancelled', 'expired', 'filled', 'partial', 'rejected'],
  );
});

test('OrderIntent compile shape with full optional fields', () => {
  const meta: StrategySignalMeta = { expectedEdge: 0.03, variance: 0.001, confidence: 0.7 };
  const intent: OrderIntent = {
    intentId: 'i1',
    ctx,
    tsCreated: 1,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    side: 'buy',
    sizeRequested: 5,
    priceLimit: 0.49,
    timeInForce: 'GTC',
    reason: 'reversal',
    tags: { signalMeta: meta, custom: 'anything' },
  };
  assert.equal(intent.tags?.signalMeta?.expectedEdge, 0.03);
});

test('OrderIntent compile shape with only required fields', () => {
  const intent: OrderIntent = {
    intentId: 'i2',
    ctx,
    tsCreated: 2,
    venue: 'binance',
    symbol: 'BTCUSDT',
    side: 'sell',
    sizeRequested: 0.1,
    timeInForce: 'IOC',
    reason: 'hedge',
  };
  assert.equal(intent.outcome, undefined);
});

test('OrderRequest extends OrderIntent with risk-decision lineage', () => {
  const req: OrderRequest = {
    intentId: 'i1',
    ctx,
    tsCreated: 1,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 5,
    timeInForce: 'IOC',
    reason: 'reversal',
    requestId: 'req1',
    sizeApproved: 3.2,
    riskDecisionId: 'd1',
    parentIntentId: 'i0',
  };
  assert.ok(req.sizeApproved < req.sizeRequested);
});

test('OrderEvent compile shape', () => {
  const ev: OrderEvent = {
    requestId: 'req1',
    intentId: 'i1',
    ctx,
    status: 'partially_filled',
    remainingSize: 1.2,
    ts: 100,
    reason: 'venue partial',
  };
  assert.equal(ev.status, 'partially_filled');
});

test('FillEvent compile shape with both timestamps', () => {
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'req1',
    ctx,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 100,
    tsReceived: 101,
    status: 'partial',
    filledSize: 2.0,
    remainingSize: 1.2,
    avgPrice: 0.48,
    feesPaid: 0.001,
  };
  assert.ok(fill.tsReceived > fill.tsExchange);
});

test('Status types accept every documented state', () => {
  const orderStates: OrderStatus[] = ['pending', 'open', 'partially_filled', 'filled', 'cancelled', 'rejected', 'expired'];
  const fillStates: FillStatus[] = ['partial', 'filled', 'rejected', 'cancelled', 'expired'];
  assert.equal(orderStates.length, 7);
  assert.equal(fillStates.length, 5);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/intents.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `intents.ts`**

Write `trade-arbiter/packages/core/src/intents.ts`:

```ts
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
  expectedEdge?: number;
  variance?: number;
  /** Confidence in [0, 1]. */
  confidence?: number;
}

/**
 * The only thing a strategy can emit. Carries enough information for the
 * risk layer to evaluate it and for the order manager to track its lineage.
 */
export interface OrderIntent {
  /** Strategy-generated; idempotent so retries do not duplicate. */
  intentId: string;
  ctx: RunContext;
  tsCreated: Timestamp;
  venue: Venue;
  symbol: Symbol;
  /** Required for binary prediction markets, omitted for non-binary venues. */
  outcome?: OutcomeToken;
  side: Side;
  sizeRequested: number;
  /** Limit price; omit for market orders. */
  priceLimit?: number;
  timeInForce: 'GTC' | 'IOC' | 'FOK' | 'FAK';
  /** Free-text reason emitted by the strategy; ends up in audit rows. */
  reason: string;
  /** Strategy-defined tags. `signalMeta` is the only key the engine reads. */
  tags?: {
    signalMeta?: StrategySignalMeta;
    [key: string]: unknown;
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
  requestId: string;
  sizeApproved: number;
  riskDecisionId: string;
  /** Lineage pointer for splits / hedges / slices. */
  parentIntentId?: string;
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
  requestId: string;
  intentId: string;
  ctx: RunContext;
  status: OrderStatus;
  remainingSize: number;
  ts: Timestamp;
  reason?: string;
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

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/intents.ts trade-arbiter/packages/core/test/intents.test.ts
git commit -m "core: add OrderIntent/OrderRequest/OrderEvent/FillEvent"
```

---

## Task 7: portfolio.ts — PositionState and PortfolioState

Implements Section 4.6 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/portfolio.ts`
- Create: `trade-arbiter/packages/core/test/portfolio.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/portfolio.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PositionState, PortfolioState } from '../src/portfolio.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};

test('PositionState compile shape with binary outcome', () => {
  const pos: PositionState = {
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    qty: 5,
    avgCost: 0.48,
    realizedPnl: 0,
    unrealizedPnl: 0.05,
  };
  assert.equal(pos.outcome, 'YES');
});

test('PositionState compile shape without outcome (futures)', () => {
  const pos: PositionState = {
    venue: 'binance',
    symbol: 'BTCUSDT',
    qty: -0.1,
    avgCost: 65000,
    realizedPnl: 12.5,
    unrealizedPnl: -3.2,
  };
  assert.ok(pos.qty < 0); // signed quantity
});

test('PortfolioState compile shape with empty positions', () => {
  const pf: PortfolioState = {
    ctx,
    ts: 0,
    cashUsd: 1000,
    positions: new Map(),
    equity: 1000,
    dayStartEquity: 1000,
  };
  assert.equal(pf.positions.size, 0);
  assert.equal(pf.equity, pf.dayStartEquity);
});

test('PortfolioState positions are keyed by venue:symbol:outcome', () => {
  const positions = new Map<string, PositionState>();
  positions.set('polymarket:btc-up-15m:YES', {
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    outcome: 'YES',
    qty: 5, avgCost: 0.48, realizedPnl: 0, unrealizedPnl: 0,
  });
  const pf: PortfolioState = {
    ctx,
    ts: 100,
    cashUsd: 997.6,
    positions,
    equity: 1000,
    dayStartEquity: 1000,
  };
  assert.equal(pf.positions.get('polymarket:btc-up-15m:YES')?.qty, 5);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/portfolio.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `portfolio.ts`**

Write `trade-arbiter/packages/core/src/portfolio.ts`:

```ts
/**
 * Portfolio and position state contracts.
 * Section 4.6 of the design spec.
 */
import type { RunContext } from './context.js';
import type { OutcomeToken, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * One position. `qty` is signed: positive for long, negative for short.
 * For binary prediction markets `outcome` distinguishes YES from NO sides
 * of the same market; for non-binary venues `outcome` is omitted.
 */
export interface PositionState {
  venue: Venue;
  symbol: Symbol;
  outcome?: OutcomeToken;
  qty: number;
  avgCost: number;
  realizedPnl: number;
  unrealizedPnl: number;
}

/**
 * Snapshot of portfolio state at a point in time.
 *
 * Strategies receive this via `StrategyContext.portfolio()` which returns
 * `Readonly<PortfolioState>`. The `positions` map is intentionally typed as
 * `ReadonlyMap` so consumers cannot mutate it through the snapshot. The
 * map key is `${venue}:${symbol}:${outcome ?? ''}`.
 */
export interface PortfolioState {
  ctx: RunContext;
  ts: Timestamp;
  cashUsd: number;
  positions: ReadonlyMap<string, PositionState>;
  equity: number;
  dayStartEquity: number;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/portfolio.ts trade-arbiter/packages/core/test/portfolio.test.ts
git commit -m "core: add PositionState and PortfolioState"
```

---

## Task 8: strategy.ts — Logger, StrategyContext, Strategy

Implements Section 4.7 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/strategy.ts`
- Create: `trade-arbiter/packages/core/test/strategy.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/strategy.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { Logger, Strategy, StrategyContext } from '../src/strategy.js';
import type { EngineClock, RunContext } from '../src/context.js';
import type { MarketEvent } from '../src/events.js';
import type { FillEvent, OrderEvent, OrderIntent } from '../src/intents.js';
import type { PortfolioState } from '../src/portfolio.js';

const ctx: RunContext = {
  runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper',
};
const clock: EngineClock = { mode: 'paper', now: () => 0 };
const portfolio: PortfolioState = {
  ctx, ts: 0, cashUsd: 1000, positions: new Map(), equity: 1000, dayStartEquity: 1000,
};

const noopLogger: Logger = {
  debug: () => {}, info: () => {}, warn: () => {}, error: () => {},
};

test('Logger compile shape', () => {
  noopLogger.info('hello', { key: 'value' });
  noopLogger.error('boom');
  assert.ok(true);
});

test('StrategyContext compile shape', () => {
  const emitted: OrderIntent[] = [];
  const sctx: StrategyContext = {
    clock,
    ctx,
    portfolio: () => portfolio,
    config: { entry_threshold: 0.47 },
    logger: noopLogger,
    emit: (intent) => emitted.push(intent),
  };
  sctx.emit({
    intentId: 'i1',
    ctx,
    tsCreated: 0,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 1,
    timeInForce: 'GTC',
    reason: 'test',
  });
  assert.equal(emitted.length, 1);
  assert.equal(sctx.portfolio().equity, 1000);
});

test('Strategy interface implementable with required + optional methods', () => {
  let initCalled = false;
  let marketCount = 0;
  let fillCount = 0;
  let orderCount = 0;
  let tickCount = 0;

  const strategy: Strategy = {
    id: 'noop-strategy',
    init: async () => { initCalled = true; },
    onMarketEvent: (_ev: MarketEvent) => { marketCount++; },
    onFillEvent: (_ev: FillEvent) => { fillCount++; },
    onOrderEvent: (_ev: OrderEvent) => { orderCount++; },
    onTick: (_ts) => { tickCount++; },
    shutdown: async () => { /* noop */ },
  };

  void strategy.init({} as StrategyContext);
  strategy.onMarketEvent({ type: 'quote', venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, bid: 0, ask: 0, bidSize: 0, askSize: 0 });
  strategy.onFillEvent({ fillId: 'f', intentId: 'i', requestId: 'r', ctx, venue: 'polymarket', symbol: 's', tsExchange: 0, tsReceived: 0, status: 'filled', filledSize: 0, remainingSize: 0, avgPrice: 0, feesPaid: 0 });
  strategy.onOrderEvent?.({ requestId: 'r', intentId: 'i', ctx, status: 'filled', remainingSize: 0, ts: 0 });
  strategy.onTick?.(0);

  // initCalled is set asynchronously; just assert the synchronous counters.
  void initCalled;
  assert.equal(marketCount, 1);
  assert.equal(fillCount, 1);
  assert.equal(orderCount, 1);
  assert.equal(tickCount, 1);
});

test('Strategy interface implementable without optional methods', () => {
  const minimal: Strategy = {
    id: 'minimal',
    init: async () => {},
    onMarketEvent: () => {},
    onFillEvent: () => {},
    shutdown: async () => {},
  };
  assert.equal(minimal.id, 'minimal');
  assert.equal(minimal.onOrderEvent, undefined);
  assert.equal(minimal.onTick, undefined);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/strategy.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `strategy.ts`**

Write `trade-arbiter/packages/core/src/strategy.ts`:

```ts
/**
 * Strategy contracts. Strategies are pure logic — no I/O, no DB, no clock.
 * Section 4.7 of the design spec.
 */
import type { EngineClock, RunContext } from './context.js';
import type { MarketEvent } from './events.js';
import type { FillEvent, OrderEvent, OrderIntent } from './intents.js';
import type { PortfolioState } from './portfolio.js';
import type { StrategyId, Timestamp } from './primitives.js';

/**
 * Minimal structured logger. Each method takes a message and optional
 * key-value metadata. Implementations may forward to pino, console, or a
 * test recorder. Strategies receive a Logger via StrategyContext.
 */
export interface Logger {
  debug(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
  error(message: string, meta?: Record<string, unknown>): void;
}

/**
 * Everything the strategy gets at init time. The clock is the only legal
 * source of timestamps inside strategy code; the portfolio is pull-based
 * and immutable; emit() is the only way to produce intents.
 */
export interface StrategyContext {
  clock: EngineClock;
  ctx: RunContext;
  /** Pull-based, immutable snapshot. */
  portfolio(): Readonly<PortfolioState>;
  /** Validated against the strategy-specific zod schema before init. */
  config: unknown;
  logger: Logger;
  /** Submits an intent to the risk layer. Synchronous; no return value. */
  emit(intent: OrderIntent): void;
}

/**
 * The interface every strategy plug-in implements. `onOrderEvent` and
 * `onTick` are optional — simple strategies omit them.
 */
export interface Strategy {
  readonly id: StrategyId;
  init(sctx: StrategyContext): Promise<void>;
  onMarketEvent(event: MarketEvent): void;
  onFillEvent(event: FillEvent): void;
  onOrderEvent?(event: OrderEvent): void;
  /** Paces on the engine clock, not wall time. */
  onTick?(ts: Timestamp): void;
  shutdown(): Promise<void>;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/strategy.ts trade-arbiter/packages/core/test/strategy.test.ts
git commit -m "core: add Logger, StrategyContext, and Strategy interfaces"
```

---

## Task 9: adapter.ts — ExecutionAdapter and DataFeed

Implements Sections 4.8 and 4.9 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/adapter.ts`
- Create: `trade-arbiter/packages/core/test/adapter.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/adapter.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { ExecutionAdapter, DataFeed } from '../src/adapter.js';
import type { OrderRequest, OrderEvent, FillEvent } from '../src/intents.js';
import type { MarketEvent } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

test('ExecutionAdapter compile shape', async () => {
  const fillCallbacks: Array<(f: FillEvent) => void> = [];
  const orderCallbacks: Array<(o: OrderEvent) => void> = [];

  const adapter: ExecutionAdapter = {
    venue: 'polymarket',
    mode: 'paper',
    connect: async () => {},
    submit: async (req: OrderRequest) => ({ requestId: req.requestId }),
    cancel: async (_id: string) => {},
    onFill: (cb) => { fillCallbacks.push(cb); },
    onOrderEvent: (cb) => { orderCallbacks.push(cb); },
    disconnect: async () => {},
  };

  await adapter.connect();
  const ack = await adapter.submit({
    intentId: 'i1', ctx, tsCreated: 0,
    venue: 'polymarket', symbol: 'btc-up-15m',
    side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
    requestId: 'req1', sizeApproved: 5, riskDecisionId: 'd1',
  });
  assert.equal(ack.requestId, 'req1');
  assert.equal(adapter.venue, 'polymarket');
  assert.equal(fillCallbacks.length, 0); // no callbacks registered yet
  assert.equal(orderCallbacks.length, 0);
  await adapter.disconnect();
});

test('DataFeed compile shape (live, no seek)', async () => {
  const captured: MarketEvent[] = [];
  const feed: DataFeed = {
    venue: 'polymarket',
    mode: 'paper',
    subscribe: (_symbols, _types) => {},
    onEvent: (cb) => { void cb; void captured; },
    start: async () => {},
    stop: async () => {},
  };
  feed.subscribe(['btc-up-15m'], ['quote', 'trade']);
  await feed.start();
  assert.equal(feed.venue, 'polymarket');
  assert.equal(feed.seek, undefined);
  await feed.stop();
});

test('DataFeed compile shape (replay, with seek)', async () => {
  let seekedTo: number | null = null;
  const feed: DataFeed = {
    venue: 'polymarket',
    mode: 'backtest_l1',
    subscribe: () => {},
    onEvent: () => {},
    start: async () => {},
    stop: async () => {},
    seek: async (ts) => { seekedTo = ts; },
  };
  await feed.seek?.(12345);
  assert.equal(seekedTo, 12345);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/adapter.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `adapter.ts`**

Write `trade-arbiter/packages/core/src/adapter.ts`:

```ts
/**
 * Execution adapter and data feed contracts.
 * Sections 4.8 and 4.9 of the design spec.
 */
import type { MarketEvent, MarketEventType } from './events.js';
import type { FillEvent, OrderEvent, OrderRequest } from './intents.js';
import type { Mode, Symbol, Timestamp, Venue } from './primitives.js';

/**
 * Venue/mode-specific execution backend. Accepts approved OrderRequests and
 * emits FillEvents and OrderEvents via callbacks. The submit() promise
 * resolves only after the request is in flight (handed off to the venue or
 * the simulator's internal book), giving callers an ergonomic await point.
 *
 * `requestId` ownership: assigned by the OrderManager before submit() is
 * called. The adapter accepts and echoes it back. Live adapters that need
 * a venue-native id maintain their own engineRequestId → venueOrderId
 * mapping internally but always surface the engine's requestId on
 * FillEvent and OrderEvent.
 */
export interface ExecutionAdapter {
  readonly venue: Venue;
  readonly mode: Mode;
  connect(): Promise<void>;
  submit(req: OrderRequest): Promise<{ requestId: string }>;
  cancel(requestId: string): Promise<void>;
  onFill(cb: (fill: FillEvent) => void): void;
  onOrderEvent(cb: (ev: OrderEvent) => void): void;
  disconnect(): Promise<void>;
}

/**
 * Source of MarketEvents. Live feeds are WebSocket clients; replay feeds
 * read partitioned Parquet files and drive the BacktestClock.
 */
export interface DataFeed {
  readonly venue: Venue;
  readonly mode: Mode;
  subscribe(symbols: Symbol[], types: MarketEventType[]): void;
  onEvent(cb: (ev: MarketEvent) => void): void;
  start(): Promise<void>;
  stop(): Promise<void>;
  /** Replay only — live feeds throw when called. */
  seek?(ts: Timestamp): Promise<void>;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/adapter.ts trade-arbiter/packages/core/test/adapter.test.ts
git commit -m "core: add ExecutionAdapter and DataFeed interfaces"
```

---

## Task 10: risk.ts — risk rule, decision, state, and manager

Implements Section 4.10 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/risk.ts`
- Create: `trade-arbiter/packages/core/test/risk.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/risk.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  RiskCheck,
  RiskRule,
  RiskDecision,
  RiskState,
  KillSwitchState,
  RiskManager,
} from '../src/risk.js';
import type { OrderIntent } from '../src/intents.js';
import type { PortfolioState } from '../src/portfolio.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

const intent: OrderIntent = {
  intentId: 'i1', ctx, tsCreated: 0,
  venue: 'polymarket', symbol: 'btc-up-15m',
  side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
};

const portfolio: PortfolioState = {
  ctx, ts: 0, cashUsd: 1000, positions: new Map(), equity: 1000, dayStartEquity: 1000,
};

const killState: KillSwitchState = {
  active: false,
  triggeredBy: null,
  reason: '',
  triggeredAt: null,
};

const riskState: RiskState = {
  killSwitch: killState,
  dayStartTs: 0,
  realizedPnlToday: 0,
  consecutiveLosses: 0,
  circuitBreakerTrippedAt: null,
  strategyExposureUsd: new Map(),
  venueExposureUsd: new Map(),
};

test('RiskCheck compile shape with passing result', () => {
  const check: RiskCheck = { pass: true, size: 5, reason: 'ok' };
  assert.equal(check.size, 5);
});

test('RiskCheck compile shape with rejecting result', () => {
  const check: RiskCheck = { pass: false, size: 0, reason: 'kill_switch' };
  assert.equal(check.size, 0);
});

test('RiskRule implementable as pure function', () => {
  const rule: RiskRule = {
    id: 'max-order-size',
    check: (i, _pf, _state) => ({
      pass: i.sizeRequested <= 10,
      size: Math.min(i.sizeRequested, 10),
      reason: i.sizeRequested <= 10 ? 'ok' : 'capped',
    }),
  };
  const result = rule.check(intent, portfolio, riskState);
  assert.equal(result.pass, true);
  assert.equal(result.size, 5);
});

test('RiskDecision compile shape', () => {
  const decision: RiskDecision = {
    decisionId: 'd1',
    ctx,
    intentId: 'i1',
    approved: true,
    sizeApproved: 5,
    reason: 'ok',
    ts: 1,
  };
  assert.equal(decision.approved, true);
});

test('RiskState compile shape with populated exposure maps', () => {
  const populated: RiskState = {
    ...riskState,
    strategyExposureUsd: new Map([['hedged-btc-15m', 250]]),
    venueExposureUsd: new Map([['polymarket', 250]]),
  };
  assert.equal(populated.strategyExposureUsd.get('hedged-btc-15m'), 250);
  assert.equal(populated.venueExposureUsd.get('polymarket'), 250);
});

test('KillSwitchState compile shape — tripped', () => {
  const tripped: KillSwitchState = {
    active: true,
    triggeredBy: 'risk_rule',
    reason: 'daily_loss_exceeded',
    triggeredAt: 1234,
  };
  assert.ok(tripped.active);
  assert.equal(tripped.triggeredBy, 'risk_rule');
});

test('RiskManager interface implementable', () => {
  let killed = false;
  const manager: RiskManager = {
    check: (i, _pf): RiskDecision => ({
      decisionId: `d-${i.intentId}`,
      ctx: i.ctx,
      intentId: i.intentId,
      approved: !killed,
      sizeApproved: killed ? 0 : i.sizeRequested,
      reason: killed ? 'kill_switch' : 'ok',
      ts: 0,
    }),
    onFill: (_f) => {},
    isKilled: () => killed,
  };
  const ok = manager.check(intent, portfolio);
  assert.equal(ok.approved, true);
  killed = true;
  const blocked = manager.check(intent, portfolio);
  assert.equal(blocked.approved, false);
  assert.equal(blocked.sizeApproved, 0);
  assert.equal(manager.isKilled(), true);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/risk.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `risk.ts`**

Write `trade-arbiter/packages/core/src/risk.ts`:

```ts
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
  pass: boolean;
  size: number;
  reason: string;
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
  decisionId: string;
  ctx: RunContext;
  intentId: string;
  approved: boolean;
  sizeApproved: number;
  reason: string;
  ts: Timestamp;
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
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/risk.ts trade-arbiter/packages/core/test/risk.test.ts
git commit -m "core: add RiskRule/RiskDecision/RiskState/KillSwitchState/RiskManager"
```

---

## Task 11: bus.ts — EventQueue and EventBus

Implements Section 4.11 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/bus.ts`
- Create: `trade-arbiter/packages/core/test/bus.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/bus.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EventQueue, EventBus } from '../src/bus.js';
import type { EngineEvent } from '../src/events.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

test('EventQueue interface implementable with stub', async () => {
  const buffer: EngineEvent<unknown>[] = [];
  let stopped = false;

  const queue: EventQueue = {
    enqueue: (ev) => { buffer.push(ev); },
    run: async () => { /* drain stub */ },
    stop: async () => { stopped = true; },
    size: () => buffer.length,
  };

  queue.enqueue({ eventId: 'e1', ctx, ts: 0, payload: { hello: 'world' } });
  queue.enqueue({ eventId: 'e2', ctx, ts: 1, payload: { hello: 'again' } });
  assert.equal(queue.size(), 2);
  await queue.run();
  await queue.stop();
  assert.equal(stopped, true);
});

test('EventBus interface implementable with synchronous fan-out stub', () => {
  const handlers = new Map<string, Array<(ev: EngineEvent<unknown>) => void>>();
  let publishCount = 0;

  const bus: EventBus = {
    subscribe: <T>(eventType: string, handler: (ev: EngineEvent<T>) => void | Promise<void>) => {
      const list = handlers.get(eventType) ?? [];
      list.push(handler as (ev: EngineEvent<unknown>) => void);
      handlers.set(eventType, list);
      return () => {
        const after = (handlers.get(eventType) ?? []).filter((h) => h !== handler);
        handlers.set(eventType, after);
      };
    },
    publish: <T>(eventType: string, ev: EngineEvent<T>) => {
      publishCount++;
      for (const h of handlers.get(eventType) ?? []) {
        h(ev as EngineEvent<unknown>);
      }
    },
  };

  let received = 0;
  const unsubscribe = bus.subscribe<{ n: number }>('tick', (ev) => {
    received += ev.payload.n;
  });
  bus.publish<{ n: number }>('tick', { eventId: 'e1', ctx, ts: 0, payload: { n: 1 } });
  bus.publish<{ n: number }>('tick', { eventId: 'e2', ctx, ts: 0, payload: { n: 2 } });
  unsubscribe();
  bus.publish<{ n: number }>('tick', { eventId: 'e3', ctx, ts: 0, payload: { n: 4 } });

  assert.equal(received, 3); // 1 + 2; the third event has no subscriber
  assert.equal(publishCount, 3);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/bus.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `bus.ts`**

Write `trade-arbiter/packages/core/src/bus.ts`:

```ts
/**
 * EventQueue and EventBus contracts.
 * Section 4.11 of the design spec.
 *
 * The flow is: publish() hands the event to enqueue(); run() drains the
 * queue one event at a time, and on each pop the bus dispatches that event
 * to its subscribers. EventQueue owns ordering, EventBus owns routing.
 * No path from a subscriber back to another subscriber bypasses the queue.
 */
import type { EngineEvent } from './events.js';

export interface EventQueue {
  enqueue(ev: EngineEvent<unknown>): void;
  /** Drains the queue sequentially until stop() is called. */
  run(): Promise<void>;
  stop(): Promise<void>;
  size(): number;
}

export interface EventBus {
  subscribe<T>(
    eventType: string,
    handler: (ev: EngineEvent<T>) => void | Promise<void>,
  ): () => void;
  /** Enqueues onto the underlying EventQueue. */
  publish<T>(eventType: string, ev: EngineEvent<T>): void;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/bus.ts trade-arbiter/packages/core/test/bus.test.ts
git commit -m "core: add EventQueue and EventBus interfaces"
```

---

## Task 12: order-manager.ts — OrderLineage and OrderManager

Implements Section 4.12 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/order-manager.ts`
- Create: `trade-arbiter/packages/core/test/order-manager.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/order-manager.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { OrderLineage, OrderManager } from '../src/order-manager.js';
import type { OrderIntent, OrderRequest, FillEvent, OrderEvent } from '../src/intents.js';
import type { RunContext } from '../src/context.js';

const ctx: RunContext = { runId: 'r1', strategyId: 's1', configHash: 'h1', mode: 'paper' };

const intent: OrderIntent = {
  intentId: 'i1', ctx, tsCreated: 0,
  venue: 'polymarket', symbol: 'btc-up-15m',
  side: 'buy', sizeRequested: 5, timeInForce: 'GTC', reason: 't',
};

const request: OrderRequest = {
  ...intent,
  requestId: 'req1',
  sizeApproved: 5,
  riskDecisionId: 'd1',
};

test('OrderLineage compile shape', () => {
  const lineage: OrderLineage = {
    intent,
    requests: [request],
    fills: [],
    events: [],
    status: 'pending',
    remainingSize: 5,
  };
  assert.equal(lineage.requests.length, 1);
  assert.equal(lineage.status, 'pending');
});

test('OrderManager interface implementable with stub state', () => {
  const lineages = new Map<string, OrderLineage>();
  const open: OrderRequest[] = [];

  const manager: OrderManager = {
    onIntent: (i, r) => {
      lineages.set(i.intentId, {
        intent: i,
        requests: [r],
        fills: [],
        events: [],
        status: 'pending',
        remainingSize: r.sizeApproved,
      });
      open.push(r);
    },
    onFill: (f: FillEvent) => {
      const cur = lineages.get(f.intentId);
      if (cur) {
        const updated: OrderLineage = {
          ...cur,
          fills: [...cur.fills, f],
          remainingSize: f.remainingSize,
          status: f.status === 'filled' ? 'filled' : 'partially_filled',
        };
        lineages.set(f.intentId, updated);
      }
    },
    onOrderEvent: (e: OrderEvent) => {
      const cur = lineages.get(e.intentId);
      if (cur) {
        lineages.set(e.intentId, { ...cur, events: [...cur.events, e], status: e.status });
      }
    },
    getOpenOrders: () => open,
    getLineage: (id) => {
      const found = lineages.get(id);
      if (!found) throw new Error(`no lineage for ${id}`);
      return found;
    },
    tickTimeouts: (_now) => {},
  };

  manager.onIntent(intent, request);
  assert.equal(manager.getOpenOrders().length, 1);

  manager.onFill({
    fillId: 'f1', intentId: 'i1', requestId: 'req1', ctx,
    venue: 'polymarket', symbol: 'btc-up-15m',
    tsExchange: 1, tsReceived: 2,
    status: 'filled', filledSize: 5, remainingSize: 0,
    avgPrice: 0.48, feesPaid: 0.001,
  });

  const lineage = manager.getLineage('i1');
  assert.equal(lineage.fills.length, 1);
  assert.equal(lineage.status, 'filled');
  assert.equal(lineage.remainingSize, 0);

  manager.tickTimeouts(1000);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/order-manager.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `order-manager.ts`**

Write `trade-arbiter/packages/core/src/order-manager.ts`:

```ts
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
  intent: OrderIntent;
  requests: ReadonlyArray<OrderRequest>;
  fills: ReadonlyArray<FillEvent>;
  events: ReadonlyArray<OrderEvent>;
  status: OrderStatus;
  remainingSize: number;
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
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/order-manager.ts trade-arbiter/packages/core/test/order-manager.test.ts
git commit -m "core: add OrderLineage and OrderManager interfaces"
```

---

## Task 13: admin.ts — AdminCommand, AdminResponse, AdminService, AdminTransport

Implements Section 4.13 of the spec.

**Files:**
- Create: `trade-arbiter/packages/core/src/admin.ts`
- Create: `trade-arbiter/packages/core/test/admin.test.ts`

- [ ] **Step 1: Write the failing test**

Write `trade-arbiter/packages/core/test/admin.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import type {
  AdminCommand,
  AdminCommandKind,
  AdminResponse,
  AdminService,
  AdminTransport,
} from '../src/admin.js';

test('AdminCommand union has every v1 command kind', () => {
  const commands: AdminCommand[] = [
    { kind: 'health' },
    { kind: 'list_runs' },
    { kind: 'show_run', runId: 'r1' },
    { kind: 'pause_strategy', runId: 'r1', strategyId: 's1' },
    { kind: 'resume_strategy', runId: 'r1', strategyId: 's1' },
    { kind: 'kill', reason: 'manual' },
    { kind: 'reset_kill_switch', reason: 'investigated' },
    { kind: 'arm_live', runId: 'r1', strategyId: 's1', confirmation: 's1' },
    { kind: 'disarm_live', runId: 'r1', strategyId: 's1' },
  ];
  assert.equal(commands.length, 9);
});

test('AdminCommandKind is a string union derived from AdminCommand', () => {
  const kinds: AdminCommandKind[] = [
    'health',
    'list_runs',
    'show_run',
    'pause_strategy',
    'resume_strategy',
    'kill',
    'reset_kill_switch',
    'arm_live',
    'disarm_live',
  ];
  assert.equal(kinds.length, 9);
});

test('AdminResponse compile shape — success', () => {
  const res: AdminResponse<{ runs: number }> = {
    ok: true,
    ts: 0,
    data: { runs: 3 },
  };
  assert.equal(res.ok, true);
  assert.equal(res.data?.runs, 3);
});

test('AdminResponse compile shape — error', () => {
  const res: AdminResponse = {
    ok: false,
    ts: 0,
    error: { code: 'unknown_command', message: 'no such kind' },
  };
  assert.equal(res.ok, false);
  assert.equal(res.error?.code, 'unknown_command');
});

test('AdminService interface implementable with handler stub', async () => {
  let started = false;
  const service: AdminService = {
    start: async () => { started = true; },
    stop: async () => { started = false; },
    handle: async (cmd) => {
      if (cmd.kind === 'health') {
        return { ok: true, ts: 0, data: { uptime_ms: 0 } };
      }
      return { ok: false, ts: 0, error: { code: 'not_implemented', message: cmd.kind } };
    },
  };
  await service.start();
  const health = await service.handle({ kind: 'health' });
  assert.equal(health.ok, true);
  const unknown = await service.handle({ kind: 'kill', reason: 'test' });
  assert.equal(unknown.ok, false);
  await service.stop();
  assert.equal(started, false);
});

test('AdminTransport interface implementable with stub', async () => {
  let bound: AdminService | null = null;
  const transport: AdminTransport = {
    bind: async (svc) => { bound = svc; },
    close: async () => { bound = null; },
  };
  const fakeSvc: AdminService = {
    start: async () => {},
    stop: async () => {},
    handle: async () => ({ ok: true, ts: 0 }),
  };
  await transport.bind(fakeSvc);
  assert.equal(bound, fakeSvc);
  await transport.close();
  assert.equal(bound, null);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: `Cannot find module '../src/admin.js'`. Exit code non-zero.

- [ ] **Step 3: Implement `admin.ts`**

Write `trade-arbiter/packages/core/src/admin.ts`:

```ts
/**
 * Admin service contracts.
 * Section 4.13 of the design spec.
 *
 * The AdminService is the engine's in-process control surface. Both the
 * trade-arbiter CLI and the dashboard server are clients of this service
 * via a Unix socket transport. Implementation lives in the engine package
 * and lands in Plan 6.
 *
 * All mutating commands (pause_strategy, resume_strategy, kill,
 * reset_kill_switch, arm_live, disarm_live) are serialized onto the
 * EventQueue as control events, so they are observed in deterministic
 * order relative to market/fill/order events. Read-only commands
 * (health, list_runs, show_run) bypass the queue.
 */
import type { RunId, StrategyId, Timestamp } from './primitives.js';

/**
 * The full v1 admin command surface. Adding new commands extends this
 * union; the transport, framing, and socket permission model do not
 * change. Every mutating command carries enough context for the
 * receiving controller to route it without further lookup.
 */
export type AdminCommand =
  | { kind: 'health' }
  | { kind: 'list_runs' }
  | { kind: 'show_run'; runId: RunId }
  | { kind: 'pause_strategy'; runId: RunId; strategyId: StrategyId }
  | { kind: 'resume_strategy'; runId: RunId; strategyId: StrategyId }
  | { kind: 'kill'; reason: string }
  | { kind: 'reset_kill_switch'; reason: string }
  | {
      kind: 'arm_live';
      runId: RunId;
      strategyId: StrategyId;
      /** Must equal `strategyId` — protects against fat-fingered dashboard clicks. */
      confirmation: string;
    }
  | { kind: 'disarm_live'; runId: RunId; strategyId: StrategyId };

/** Discriminator string of every AdminCommand variant. */
export type AdminCommandKind = AdminCommand['kind'];

export interface AdminResponse<T = unknown> {
  ok: boolean;
  ts: Timestamp;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

export interface AdminService {
  start(): Promise<void>;
  stop(): Promise<void>;
  handle<T = unknown>(cmd: AdminCommand): Promise<AdminResponse<T>>;
}

/**
 * Pluggable transport for the admin service. v1 ships
 * UnixSocketAdminTransport; future transports (TCP, gRPC, HTTP) speak the
 * same command/response shapes.
 */
export interface AdminTransport {
  bind(service: AdminService): Promise<void>;
  close(): Promise<void>;
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd trade-arbiter && npm run typecheck && npm test && cd ..
```

Expected: all green.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/core/src/admin.ts trade-arbiter/packages/core/test/admin.test.ts
git commit -m "core: add AdminCommand/AdminResponse/AdminService/AdminTransport"
```

---

## Task 14: index.ts barrel + public-surface test

Replaces the empty `src/index.ts` stub from Task 2 with a full barrel that re-exports every contract, then verifies the package can be imported by its package name end-to-end.

**Files:**
- Modify: `trade-arbiter/packages/core/src/index.ts` (replace contents)
- Create: `trade-arbiter/packages/core/test/public-surface.test.ts`

- [ ] **Step 1: Write the failing public-surface test**

Write `trade-arbiter/packages/core/test/public-surface.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as core from '@trade-arbiter/core';

test('public surface exports all runtime constants', () => {
  assert.ok(Array.isArray(core.MODES), 'MODES exported');
  assert.equal(core.MODES.length, 4);
  assert.ok(Array.isArray(core.VENUES), 'VENUES exported');
  assert.equal(core.VENUES.length, 4);
  assert.ok(Array.isArray(core.MARKET_EVENT_TYPES), 'MARKET_EVENT_TYPES exported');
  assert.equal(core.MARKET_EVENT_TYPES.length, 6);
  assert.ok(Array.isArray(core.ORDER_STATUSES), 'ORDER_STATUSES exported');
  assert.equal(core.ORDER_STATUSES.length, 7);
  assert.ok(Array.isArray(core.FILL_STATUSES), 'FILL_STATUSES exported');
  assert.equal(core.FILL_STATUSES.length, 5);
});

test('public surface accepts a synthetic intent → request → fill round trip', () => {
  const ctx: core.RunContext = {
    runId: 'r1',
    strategyId: 's1',
    configHash: 'h1',
    mode: 'backtest_l1',
  };

  const intent: core.OrderIntent = {
    intentId: 'i1',
    ctx,
    tsCreated: 0,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    side: 'buy',
    sizeRequested: 5,
    timeInForce: 'GTC',
    reason: 'test',
  };

  const request: core.OrderRequest = {
    ...intent,
    requestId: 'req1',
    sizeApproved: 5,
    riskDecisionId: 'd1',
  };

  const fill: core.FillEvent = {
    fillId: 'f1',
    intentId: intent.intentId,
    requestId: request.requestId,
    ctx,
    venue: 'polymarket',
    symbol: 'btc-up-15m',
    tsExchange: 1,
    tsReceived: 2,
    status: 'filled',
    filledSize: 5,
    remainingSize: 0,
    avgPrice: 0.48,
    feesPaid: 0.001,
  };

  assert.equal(fill.intentId, intent.intentId);
  assert.equal(fill.requestId, request.requestId);
  assert.equal(request.sizeApproved, intent.sizeRequested);
});

test('public surface exposes every interface as a named type', () => {
  // This test exists to lock in that future barrel changes don't accidentally
  // drop a name. The body is type-level only; the runtime body is trivial.
  type Surface = {
    // primitives
    Timestamp: core.Timestamp;
    RunId: core.RunId;
    StrategyId: core.StrategyId;
    ConfigHash: core.ConfigHash;
    Mode: core.Mode;
    Venue: core.Venue;
    Side: core.Side;
    OutcomeToken: core.OutcomeToken;
    // context
    RunContext: core.RunContext;
    EngineClock: core.EngineClock;
    // events
    EngineEvent: core.EngineEvent<unknown>;
    MarketEventType: core.MarketEventType;
    BaseMarketEvent: core.BaseMarketEvent;
    QuoteEvent: core.QuoteEvent;
    TradeEvent: core.TradeEvent;
    OrderBookEvent: core.OrderBookEvent;
    CandleEvent: core.CandleEvent;
    MarketEvent: core.MarketEvent;
    // intents
    StrategySignalMeta: core.StrategySignalMeta;
    OrderIntent: core.OrderIntent;
    OrderRequest: core.OrderRequest;
    OrderStatus: core.OrderStatus;
    OrderEvent: core.OrderEvent;
    FillStatus: core.FillStatus;
    FillEvent: core.FillEvent;
    // portfolio
    PositionState: core.PositionState;
    PortfolioState: core.PortfolioState;
    // strategy
    Logger: core.Logger;
    StrategyContext: core.StrategyContext;
    Strategy: core.Strategy;
    // adapter
    ExecutionAdapter: core.ExecutionAdapter;
    DataFeed: core.DataFeed;
    // risk
    RiskCheck: core.RiskCheck;
    RiskRule: core.RiskRule;
    RiskDecision: core.RiskDecision;
    KillSwitchState: core.KillSwitchState;
    RiskState: core.RiskState;
    RiskManager: core.RiskManager;
    // bus
    EventQueue: core.EventQueue;
    EventBus: core.EventBus;
    // order-manager
    OrderLineage: core.OrderLineage;
    OrderManager: core.OrderManager;
    // admin
    AdminCommand: core.AdminCommand;
    AdminCommandKind: core.AdminCommandKind;
    AdminResponse: core.AdminResponse;
    AdminService: core.AdminService;
    AdminTransport: core.AdminTransport;
  };
  // Use the type to prevent unused-locals lint from removing it.
  const _surface = null as unknown as Surface;
  void _surface;
  assert.ok(true);
});
```

- [ ] **Step 2: Run typecheck and confirm it fails**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: a flood of errors of the form `Module '"@trade-arbiter/core"' has no exported member 'MODES'` (and similarly for every name). This is because the current `index.ts` is the empty `export {};` stub. The test fails as intended.

- [ ] **Step 3: Replace the barrel with the full export list**

Edit `trade-arbiter/packages/core/src/index.ts`. Replace the entire file contents with:

```ts
/**
 * Public surface of @trade-arbiter/core. Every contract from Section 4 of
 * the design spec is re-exported from here. Other in-repo packages should
 * import only from this barrel, never from individual files.
 */
export * from './primitives.js';
export * from './context.js';
export * from './events.js';
export * from './intents.js';
export * from './portfolio.js';
export * from './strategy.js';
export * from './adapter.js';
export * from './risk.js';
export * from './bus.js';
export * from './order-manager.js';
export * from './admin.js';
```

- [ ] **Step 4: Run typecheck and confirm it passes**

```bash
cd trade-arbiter && npm run typecheck && cd ..
```

Expected: no output, exit code 0.

- [ ] **Step 5: Run the full test suite**

```bash
cd trade-arbiter && npm test && cd ..
```

Expected: every test passes, including the three new public-surface tests. The total count should be ~54 passing tests (1 smoke + 3 primitives + 3 context + 9 events + 8 intents + 4 portfolio + 4 strategy + 3 adapter + 7 risk + 2 bus + 2 order-manager + 5 admin + 3 public-surface). If the count is materially off, a previous task left a test out.

- [ ] **Step 6: Commit**

```bash
git add trade-arbiter/packages/core/src/index.ts trade-arbiter/packages/core/test/public-surface.test.ts
git commit -m "core: full barrel export and public-surface test"
```

---

## Task 15: GitHub Actions CI workflow + final ci run

**Files:**
- Create: `trade-arbiter/.github/workflows/ci.yml`

- [ ] **Step 1: Create the GitHub Actions workflow directory**

From `arbitrage_trading/`:

```bash
mkdir -p trade-arbiter/.github/workflows
```

- [ ] **Step 2: Write the CI workflow**

Write `trade-arbiter/.github/workflows/ci.yml`:

```yaml
name: ci

on:
  push:
    branches: [master, main]
  pull_request:

jobs:
  ci:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: trade-arbiter
    steps:
      - uses: actions/checkout@v4

      - name: Install Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'
          cache: 'npm'
          cache-dependency-path: trade-arbiter/package-lock.json

      - name: Install dependencies
        run: npm ci

      - name: Run typecheck and tests
        run: npm run ci
```

The workflow runs on every push to `master`/`main` and on every pull request. It uses Node 22 (matching the engines field), enables npm cache for fast installs, and runs `npm run ci` from inside `trade-arbiter/`. There is no Linux-only logic here — the same workflow would run on macOS or Windows runners if needed in the future.

- [ ] **Step 3: Run the canonical CI command locally**

From `arbitrage_trading/`:

```bash
cd trade-arbiter && npm run ci && cd ..
```

Expected: `npm run typecheck` produces no errors, `npm run test` reports `pass N` where N is the total count from Task 14 Step 5. Exit code 0.

- [ ] **Step 4: Commit the workflow**

```bash
git add trade-arbiter/.github/workflows/ci.yml
git commit -m "ci: add GitHub Actions workflow for npm run ci"
```

- [ ] **Step 5: Final verification — full plan-1 ci run from a cold workspace**

To prove the plan reproduces from a fresh clone, simulate it:

```bash
cd /tmp
rm -rf plan1-verify
git clone /home/x/dev/projects/arbitrage_trading plan1-verify
cd plan1-verify/trade-arbiter
npm ci
npm run ci
```

Expected: `npm ci` installs from `package-lock.json` only (no resolution from network). `npm run ci` reports the same pass count as Step 3. Exit code 0.

If this passes, Plan 1 is complete. Clean up the verification directory:

```bash
cd /home/x/dev/projects/arbitrage_trading
rm -rf /tmp/plan1-verify
```

- [ ] **Step 6: Tag the milestone** (optional, only if the repo has a conventional tag scheme; otherwise skip)

```bash
git tag plan1-complete
```

---

## Done Criteria for Plan 1

Plan 1 is complete when **all** of the following hold:

1. The `trade-arbiter/` directory exists with the layout shown in "Final File Layout After Plan 1".
2. `cd trade-arbiter && npm run ci` exits 0 from a clean clone.
3. Every contract file in `packages/core/src/` has a matching test file in `packages/core/test/`.
4. The barrel `packages/core/src/index.ts` re-exports every name listed in the public-surface test (Task 14 Step 1).
5. `package-lock.json` is committed.
6. `.github/workflows/ci.yml` is committed and references `npm run ci` from `trade-arbiter/`.
7. No file outside `trade-arbiter/` has been modified, except `.gitignore` (one block added) and `docs/superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md` (this file).

---

## Out of Scope for Plan 1 (Common Temptations to Resist)

- **No engine code.** `EventQueue`, `EventBus`, `OrderManager`, `RiskManager` are *interfaces only*. Implementations land in Plan 2.
- **No risk rules.** `LiveArmRule`, `KillSwitchRule`, `BalanceRule`, etc. are not in this plan. They are part of `@trade-arbiter/engine` in Plan 2.
- **No persistence.** SQLite schema, Parquet writers — all Plan 2.
- **No CLI binary.** The `trade-arbiter` binary is created in Plan 2, but its admin subcommands are stubs until Plan 6.
- **No Python sidecar.** Deferred to Plan 8.
- **No ESLint, no Prettier, no `Date.now()` lint rule.** The lint rule is a strategy-package concern and arrives with Plan 3.
- **No Docker Compose.** Deferred to Plan 8.
- **No backwards-compat layer for the old reference projects.** The reference projects stay gitignored and untouched.

---

## Notes for the Implementing Engineer

- **You will be tempted to combine multiple contract tasks into one commit.** Don't. The five-step rhythm (write failing test → confirm fail → write contract → confirm pass → commit) is the discipline this plan exists to enforce. If a task takes you less than five minutes, you are doing it right.
- **Compile-check tests look pointless.** They are not. Their value is that tsc has to validate the literal against the type. If a future task drops a required field from `OrderIntent`, every compile-check test that constructs an `OrderIntent` will fail to typecheck. That is the only line of defense against silent contract drift in a contracts-only package.
- **`.js` import extensions in `.ts` source files look weird if you have not used NodeNext before.** They are correct. TypeScript reads them as "the file ending in `.ts`" at typecheck time, and `tsx` resolves them at runtime.
- **If `npm test` complains about no test files matched on a fresh run, check that the glob in `packages/core/package.json` is single-quoted.** Unquoted globs get expanded by the shell before `node` sees them, and an empty expansion fails.
- **Do not add a `dist/` directory or a build step in this plan.** The package consumes itself from `src/` directly; this is fine for an in-repo workspace package and avoids the "must `npm run build` before typecheck" footgun.
