# trade-arbiter Plan 2 — Engine Runtime and Observability

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a runnable `@trade-arbiter/engine` package that wires `EventQueue`, `EventBus`, `RiskManager`, `OrderManager`, `Portfolio` updater, `PnlSnapshot` ticker, and a JSONL audit writer behind the contracts Plan 1 shipped. Plan 2 ends with a deterministic integration test: fake `DataFeed`, fake `Strategy`, fake `ExecutionAdapter`, empty rule list → 10 `MarketEvent`s in → byte-identical JSONL logs across two runs.

**Architecture:** One new workspace package, `packages/engine`. Zero runtime deps beyond `@trade-arbiter/core`. Every component is a small focused file (one responsibility each). The engine is a library — it's driven by the caller (tests in Plan 2, CLI in Plan 3), not a process. Determinism is a property of the serialization/ID/clock layer, not of the orchestration layer.

**Tech Stack:**
- Node 22+, native test runner (`node --test`)
- TypeScript strict mode (existing `tsconfig.base.json` applies)
- `tsx` loader (existing)
- No build step, no emit — same as Plan 1

**Spec coverage (from `docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md`):**
- "Plan 2 shape — Engine runtime + observability" (all of it)
- "Determinism contract (Plans 2 + 3)" (ID generation, JSONL serialization, float formatting, clock, RNG, iteration order)
- "PnL semantics (v0.1)" (mark source, realized formula, fees respected, currency)
- "Error handling posture (Plans 2 + 3)" (boundary validation, fail loud)
- Plan 2 acceptance criteria 1–8

**Deferred (by spec, not this plan):**
- Persistence beyond JSONL → Plan 6
- Any concrete risk rule, strategy, or adapter → Plan 3+
- Kill switch wiring → Plan 7
- Config schema validation library → Plan 7
- CLI + YAML config loader → Plan 3

---

## Final File Layout After Plan 2

```
trade-arbiter/
├── package.json                                        (workspaces list gets 'packages/engine')
├── package-lock.json                                   (regenerated)
├── tsconfig.base.json                                  (unchanged)
└── packages/
    ├── core/                                           (Plan 1; gets 3 small additions)
    │   ├── src/
    │   │   ├── index.ts                                + export * from './audit.js'
    │   │   ├── events.ts                               + PnlEvent + PnlSnapshot
    │   │   ├── audit.ts                                NEW — AuditKind, AuditRecord
    │   │   └── ... (all other Plan 1 files unchanged)
    │   └── test/
    │       ├── events.test.ts                          + PnlEvent/PnlSnapshot compile-check
    │       ├── audit.test.ts                           NEW
    │       └── public-surface.test.ts                  + 4 new imports
    └── engine/                                         NEW
        ├── package.json
        ├── tsconfig.json
        ├── src/
        │   ├── index.ts                                barrel
        │   ├── format-number.ts                        fixed-precision float formatter
        │   ├── stable-json.ts                          sorted-key serializer
        │   ├── id-gen.ts                               mode-dependent ID factory
        │   ├── backtest-clock.ts                       BacktestClock (advances via advance())
        │   ├── event-queue.ts                          InMemoryEventQueue
        │   ├── event-bus.ts                            InMemoryEventBus
        │   ├── risk-manager.ts                         DefaultRiskManager
        │   ├── order-manager.ts                        DefaultOrderManager
        │   ├── portfolio-updater.ts                    PortfolioUpdater (emits PnlEvent)
        │   ├── pnl-snapshotter.ts                      PnlSnapshotter (emits PnlSnapshot)
        │   ├── audit-writer.ts                         JsonlAuditWriter
        │   └── engine.ts                               Engine (wires all of the above)
        └── test/
            ├── format-number.test.ts
            ├── stable-json.test.ts
            ├── id-gen.test.ts
            ├── backtest-clock.test.ts
            ├── event-queue.test.ts
            ├── event-bus.test.ts
            ├── risk-manager.test.ts
            ├── order-manager.test.ts
            ├── portfolio-updater.test.ts
            ├── pnl-snapshotter.test.ts
            ├── audit-writer.test.ts
            └── integration/
                └── engine-determinism.test.ts          the end-of-plan acceptance gate
```

---

## Phase A — Contract additions to `@trade-arbiter/core`

All three types are purely additive to Plan 1's shipped surface. No renames, no removals.

### Task A1: Add `PnlEvent` interface to core

**Files:**
- Modify: `trade-arbiter/packages/core/src/events.ts`
- Modify: `trade-arbiter/packages/core/test/events.test.ts`
- Modify: `trade-arbiter/packages/core/test/public-surface.test.ts`

- [ ] **Step 1: Write the failing compile-check test**

Append to `trade-arbiter/packages/core/test/events.test.ts`:

```typescript
import type { PnlEvent } from '../src/index.js';

test('PnlEvent compile shape — fill-triggered', () => {
  const ev: PnlEvent = {
    type: 'pnl',
    strategyId: 'strat-001',
    symbol: 'HYPE-PERP',
    realizedDelta: 1.5,
    realizedCumulative: 12.0,
    unrealizedMark: -0.25,
    currency: 'USDC',
    triggeredBy: 'fill',
  };
  void ev;
});

test('PnlEvent compile shape — snapshot-triggered', () => {
  const ev: PnlEvent = {
    type: 'pnl',
    strategyId: 'strat-001',
    symbol: 'HYPE-PERP',
    realizedDelta: 0,
    realizedCumulative: 12.0,
    unrealizedMark: 0.8,
    currency: 'USDC',
    triggeredBy: 'snapshot',
  };
  void ev;
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

From `trade-arbiter/`:
```bash
npm run typecheck
```
Expected: FAIL in `packages/core/test/events.test.ts` — `Module has no exported member 'PnlEvent'`.

- [ ] **Step 3: Add the interface to `events.ts`**

Append to `trade-arbiter/packages/core/src/events.ts`:

```typescript
/**
 * Realized + unrealized P&L state emitted on every fill and on every
 * snapshot tick. `triggeredBy` distinguishes fill-driven from periodic
 * emissions. `currency` is venue-native (e.g., 'USDC' for Hyperliquid perps).
 * Not a variant of the `MarketEvent` union — PnlEvent flows on the bus
 * under its own event-type key.
 */
export interface PnlEvent {
  readonly type: 'pnl';
  readonly strategyId: StrategyId;
  readonly symbol: Symbol;
  readonly realizedDelta: number;
  readonly realizedCumulative: number;
  readonly unrealizedMark: number;
  readonly currency: string;
  readonly triggeredBy: 'fill' | 'snapshot';
}
```

Also extend the top-of-file import to include `StrategyId`:

```typescript
import type { Side, StrategyId, Symbol, Timestamp, Venue } from './primitives.js';
```

- [ ] **Step 4: Update `public-surface.test.ts` to import the new name**

In `trade-arbiter/packages/core/test/public-surface.test.ts`, add `PnlEvent` to the type-import block (follow the existing alphabetized style).

- [ ] **Step 5: Run `npm run ci` to verify green**

From `trade-arbiter/`:
```bash
npm run ci
```
Expected: PASS. Tests count increases by 2.

- [ ] **Step 6: Commit**

```bash
git add trade-arbiter/packages/core/src/events.ts trade-arbiter/packages/core/test/events.test.ts trade-arbiter/packages/core/test/public-surface.test.ts
git commit -m "feat(core): add PnlEvent contract"
```

---

### Task A2: Add `PnlSnapshot` interface to core

**Files:**
- Modify: `trade-arbiter/packages/core/src/events.ts`
- Modify: `trade-arbiter/packages/core/test/events.test.ts`
- Modify: `trade-arbiter/packages/core/test/public-surface.test.ts`

- [ ] **Step 1: Write the failing compile-check test**

Append to `trade-arbiter/packages/core/test/events.test.ts`:

```typescript
import type { PnlSnapshot } from '../src/index.js';

test('PnlSnapshot compile shape — populated positions', () => {
  const snap: PnlSnapshot = {
    type: 'pnl_snapshot',
    strategyId: 'strat-001',
    positions: [
      { symbol: 'HYPE-PERP', qty: 1, avgEntry: 100.5, markPrice: 101.2 },
      { symbol: 'ETH-PERP', qty: -2, avgEntry: 3500, markPrice: 3495 },
    ],
    realizedCumulative: 12.5,
    unrealizedTotal: 1.4,
    currency: 'USDC',
  };
  void snap;
});

test('PnlSnapshot compile shape — empty positions', () => {
  const snap: PnlSnapshot = {
    type: 'pnl_snapshot',
    strategyId: 'strat-001',
    positions: [],
    realizedCumulative: 0,
    unrealizedTotal: 0,
    currency: 'USDC',
  };
  void snap;
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

```bash
npm run typecheck
```
Expected: FAIL — `Module has no exported member 'PnlSnapshot'`.

- [ ] **Step 3: Add the interface to `events.ts`**

Append to `trade-arbiter/packages/core/src/events.ts`:

```typescript
/**
 * Periodic mark-to-market of all open positions for one strategy.
 * Emitted on engine-clock intervals (not wall-clock). The `positions`
 * array iterates positions in insertion order; this is deterministic by
 * the `PortfolioState.positions` insertion-order invariant.
 */
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
```

- [ ] **Step 4: Update `public-surface.test.ts`**

Add `PnlSnapshot` to the type-import block alphabetically.

- [ ] **Step 5: Run `npm run ci`**

```bash
npm run ci
```
Expected: PASS, tests count +2.

- [ ] **Step 6: Commit**

```bash
git add trade-arbiter/packages/core/src/events.ts trade-arbiter/packages/core/test/events.test.ts trade-arbiter/packages/core/test/public-surface.test.ts
git commit -m "feat(core): add PnlSnapshot contract"
```

---

### Task A3: Add `audit.ts` with `AuditKind` + `AuditRecord`

**Files:**
- Create: `trade-arbiter/packages/core/src/audit.ts`
- Create: `trade-arbiter/packages/core/test/audit.test.ts`
- Modify: `trade-arbiter/packages/core/src/index.ts`
- Modify: `trade-arbiter/packages/core/test/public-surface.test.ts`

- [ ] **Step 1: Write the failing compile-check test**

Create `trade-arbiter/packages/core/test/audit.test.ts`:

```typescript
/**
 * Compile-check tests for the audit record contract. Asserts the discriminator
 * list and the generic envelope shape. See
 * docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AuditKind, AuditRecord } from '../src/index.js';
import { AUDIT_KINDS } from '../src/index.js';

test('AUDIT_KINDS contains every expected discriminator', () => {
  assert.deepEqual(AUDIT_KINDS, [
    'market',
    'intent',
    'decision',
    'request',
    'order',
    'fill',
    'pnl',
    'snapshot',
  ]);
});

test('AuditRecord compile shape — unconstrained payload', () => {
  const rec: AuditRecord = {
    eventId: '00000000000000000000000001',
    ts: 1_700_000_000_000,
    runId: '00000000000000000000000000',
    kind: 'market',
    payload: { anything: 'goes' },
  };
  void rec;
});

test('AuditRecord compile shape — narrowed kind + typed payload', () => {
  const rec: AuditRecord<'fill', { avgPrice: number }> = {
    eventId: '00000000000000000000000002',
    ts: 1_700_000_000_500,
    runId: '00000000000000000000000000',
    kind: 'fill',
    payload: { avgPrice: 100.5 },
  };
  void rec;
});

test('AuditKind union is exhaustive', () => {
  const all: AuditKind[] = [
    'market',
    'intent',
    'decision',
    'request',
    'order',
    'fill',
    'pnl',
    'snapshot',
  ];
  void all;
});
```

- [ ] **Step 2: Run typecheck to verify it fails**

```bash
npm run typecheck
```
Expected: FAIL — module `../src/index.js` has no exported `AuditKind`, `AuditRecord`, `AUDIT_KINDS`.

- [ ] **Step 3: Create `audit.ts`**

Create `trade-arbiter/packages/core/src/audit.ts`:

```typescript
/**
 * Typed envelope for the JSONL audit log. Every line written by the engine's
 * audit writer is one `AuditRecord`. The engine derives `kind` and `payload`
 * from the event class that caused the record; consumers can narrow with
 * `AuditRecord<'fill', FillEvent>` etc.
 *
 * This file is part of the Plan 2 contract additions — purely additive to
 * Plan 1's shipped surface. See
 * docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md.
 */
import type { RunId, Timestamp } from './primitives.js';

export type AuditKind =
  | 'market'
  | 'intent'
  | 'decision'
  | 'request'
  | 'order'
  | 'fill'
  | 'pnl'
  | 'snapshot';

/**
 * Runtime list of every AuditKind in declaration order. Used by the engine's
 * audit writer to validate the `kind` field before serialization.
 */
export const AUDIT_KINDS = [
  'market',
  'intent',
  'decision',
  'request',
  'order',
  'fill',
  'pnl',
  'snapshot',
] as const satisfies readonly AuditKind[];

/**
 * One line of the JSONL audit log. `eventId` is the engine's ULID-shaped
 * identifier for the triggering event; `runId` identifies the run.
 * `payload` is the untyped event body — consumers narrow via the
 * generic parameters.
 */
export interface AuditRecord<K extends AuditKind = AuditKind, P = unknown> {
  readonly eventId: string;
  readonly ts: Timestamp;
  readonly runId: RunId;
  readonly kind: K;
  readonly payload: P;
}
```

- [ ] **Step 4: Export from the barrel**

Modify `trade-arbiter/packages/core/src/index.ts` — append:

```typescript
export * from './audit.js';
```

- [ ] **Step 5: Update `public-surface.test.ts`**

Add `AUDIT_KINDS` (runtime import) and `AuditKind`, `AuditRecord` (type imports) to the relevant blocks, alphabetized.

- [ ] **Step 6: Run `npm run ci`**

```bash
npm run ci
```
Expected: PASS, tests count +4.

- [ ] **Step 7: Commit**

```bash
git add trade-arbiter/packages/core/src/audit.ts trade-arbiter/packages/core/src/index.ts trade-arbiter/packages/core/test/audit.test.ts trade-arbiter/packages/core/test/public-surface.test.ts
git commit -m "feat(core): add AuditKind and AuditRecord contracts"
```

---

## Phase B — Engine package scaffolding

### Task B1: Create `@trade-arbiter/engine` package skeleton

**Files:**
- Create: `trade-arbiter/packages/engine/package.json`
- Create: `trade-arbiter/packages/engine/tsconfig.json`
- Create: `trade-arbiter/packages/engine/src/index.ts`
- Create: `trade-arbiter/packages/engine/test/smoke.test.ts`
- Modify: `trade-arbiter/package.json` (the workspaces list)

- [ ] **Step 1: Write a smoke test that imports the package**

Create `trade-arbiter/packages/engine/test/smoke.test.ts`:

```typescript
/**
 * Sanity check: the engine package exists, has a barrel, and can import
 * @trade-arbiter/core. Every later engine test builds on this loading path.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { MODES } from '@trade-arbiter/core';

test('engine package can import @trade-arbiter/core', () => {
  assert.ok(MODES.includes('backtest_l1'));
});
```

- [ ] **Step 2: Run the test to verify it fails**

From `trade-arbiter/`:
```bash
npm test --workspaces --if-present
```
Expected: FAIL — `@trade-arbiter/engine` not in workspaces.

- [ ] **Step 3: Create the package skeleton**

Create `trade-arbiter/packages/engine/package.json`:

```json
{
  "name": "@trade-arbiter/engine",
  "version": "0.0.0",
  "private": true,
  "description": "Event loop, bus, queue, risk manager, order manager, portfolio updater, pnl snapshotter, audit writer. Library, not a process.",
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
    "test": "node --test --import tsx \"test/**/*.test.ts\""
  },
  "dependencies": {
    "@trade-arbiter/core": "*"
  }
}
```

Note the double-quoted glob in `test` — same cross-platform fix that went into core in this session.

Create `trade-arbiter/packages/engine/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "rootDir": ".",
    "outDir": "./dist"
  },
  "include": ["src/**/*", "test/**/*"]
}
```

Create `trade-arbiter/packages/engine/src/index.ts`:

```typescript
/**
 * Public surface of @trade-arbiter/engine. Additions to this barrel should
 * be narrow and intentional — the engine exposes wiring primitives, not
 * policy. Policy (rules, strategies, adapters) lives in other packages.
 */
export {};
```

- [ ] **Step 4: Add the package to the workspace root**

Modify `trade-arbiter/package.json`'s `workspaces` array:

```json
"workspaces": [
  "packages/core",
  "packages/engine"
]
```

If it's currently `"packages/*"`, leave it — the new dir is picked up automatically.

- [ ] **Step 5: Install and run tests**

```bash
npm install
npm run ci
```
Expected: PASS. Tests count includes engine's 1 smoke test.

- [ ] **Step 6: Commit**

```bash
git add trade-arbiter/packages/engine trade-arbiter/package.json trade-arbiter/package-lock.json
git commit -m "feat(engine): scaffold @trade-arbiter/engine workspace package"
```

---

## Phase C — Determinism primitives

### Task C1: Fixed-precision float formatter

**Files:**
- Create: `trade-arbiter/packages/engine/src/format-number.ts`
- Create: `trade-arbiter/packages/engine/test/format-number.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/format-number.test.ts`:

```typescript
/**
 * Tests for the deterministic number formatter. Covers the spec's
 * "Determinism contract > Floating-point formatting" requirements.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { formatNumber } from '../src/format-number.js';

test('integer renders without a decimal point', () => {
  assert.equal(formatNumber(0), '0');
  assert.equal(formatNumber(1), '1');
  assert.equal(formatNumber(-42), '-42');
  assert.equal(formatNumber(1_000_000), '1000000');
});

test('finite float renders with 12 decimal places', () => {
  assert.equal(formatNumber(1.5), '1.500000000000');
  assert.equal(formatNumber(-0.25), '-0.250000000000');
  assert.equal(formatNumber(1.234567890123456), '1.234567890123');
});

test('no exponent notation even for very small/large values', () => {
  const small = 1e-10;
  const formatted = formatNumber(small);
  assert.equal(formatted.includes('e'), false);
  assert.equal(formatted.includes('E'), false);
});

test('negative zero renders as positive zero', () => {
  assert.equal(formatNumber(-0), '0');
});

test('NaN and Infinity throw', () => {
  assert.throws(() => formatNumber(NaN), /finite/);
  assert.throws(() => formatNumber(Infinity), /finite/);
  assert.throws(() => formatNumber(-Infinity), /finite/);
});
```

- [ ] **Step 2: Run to verify failure**

From `trade-arbiter/`:
```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the formatter**

Create `trade-arbiter/packages/engine/src/format-number.ts`:

```typescript
/**
 * Deterministic number → string conversion for the JSONL audit log.
 * Integers render without a decimal point. Floats render with exactly 12
 * decimal places and no exponent. Negative zero collapses to positive zero.
 * NaN/Infinity throw — they have no place in a deterministic audit stream.
 *
 * See docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md
 * section "Determinism contract".
 */
const DECIMAL_DIGITS = 12;

export function formatNumber(n: number): string {
  if (!Number.isFinite(n)) {
    throw new Error(`formatNumber requires a finite value; got ${n}`);
  }
  if (Object.is(n, -0)) {
    return '0';
  }
  if (Number.isInteger(n)) {
    return n.toString(10);
  }
  return n.toFixed(DECIMAL_DIGITS);
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/format-number.ts trade-arbiter/packages/engine/test/format-number.test.ts
git commit -m "feat(engine): fixed-precision deterministic number formatter"
```

---

### Task C2: Stable JSON serializer

**Files:**
- Create: `trade-arbiter/packages/engine/src/stable-json.ts`
- Create: `trade-arbiter/packages/engine/test/stable-json.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/stable-json.test.ts`:

```typescript
/**
 * Tests for stable JSON serialization. Every line of the JSONL audit log
 * uses this serializer; byte-identical replay depends on it.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { stableStringify } from '../src/stable-json.js';

test('object keys serialize in alphabetical order', () => {
  const out = stableStringify({ z: 1, a: 2, m: 3 });
  assert.equal(out, '{"a":2,"m":3,"z":1}');
});

test('nested object keys are sorted at every level', () => {
  const out = stableStringify({ outer: { z: 1, a: 2 } });
  assert.equal(out, '{"outer":{"a":2,"z":1}}');
});

test('arrays preserve order; array elements are recursively stabilized', () => {
  const out = stableStringify([{ z: 1, a: 2 }, { b: 3 }]);
  assert.equal(out, '[{"a":2,"z":1},{"b":3}]');
});

test('numbers use the deterministic formatter', () => {
  assert.equal(stableStringify({ x: 1.5 }), '{"x":1.500000000000}');
  assert.equal(stableStringify({ x: 42 }), '{"x":42}');
});

test('strings escape the standard JSON specials', () => {
  assert.equal(
    stableStringify({ s: 'hi "there"\n' }),
    '{"s":"hi \\"there\\"\\n"}',
  );
});

test('booleans and null', () => {
  assert.equal(stableStringify({ a: true, b: false, c: null }), '{"a":true,"b":false,"c":null}');
});

test('undefined properties are dropped (matching JSON.stringify)', () => {
  assert.equal(stableStringify({ a: 1, b: undefined, c: 3 }), '{"a":1,"c":3}');
});

test('no whitespace around separators', () => {
  const out = stableStringify({ a: 1, b: [1, 2] });
  assert.equal(out.includes(' '), false);
  assert.equal(out.includes('\n'), false);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/stable-json.ts`:

```typescript
/**
 * Deterministic JSON serializer. Sorts object keys alphabetically at every
 * nesting level; delegates numbers to the fixed-precision formatter. No
 * extraneous whitespace. See
 * docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md
 * section "Determinism contract".
 */
import { formatNumber } from './format-number.js';

export function stableStringify(value: unknown): string {
  return serialize(value);
}

function serialize(v: unknown): string {
  if (v === null) return 'null';
  switch (typeof v) {
    case 'string':
      return JSON.stringify(v);
    case 'number':
      return formatNumber(v);
    case 'boolean':
      return v ? 'true' : 'false';
    case 'undefined':
      // Matches JSON.stringify behavior when undefined appears as a value.
      // Caller's responsibility to filter undefined array elements too;
      // we emit 'null' here for parity with the standard.
      return 'null';
    case 'object':
      if (Array.isArray(v)) {
        const parts = v.map((el) => (el === undefined ? 'null' : serialize(el)));
        return `[${parts.join(',')}]`;
      }
      return serializeObject(v as Record<string, unknown>);
    default:
      throw new Error(`stableStringify: unsupported value type ${typeof v}`);
  }
}

function serializeObject(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
  const entries = keys.map((k) => `${JSON.stringify(k)}:${serialize(obj[k])}`);
  return `{${entries.join(',')}}`;
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/stable-json.ts trade-arbiter/packages/engine/test/stable-json.test.ts
git commit -m "feat(engine): stable JSON serializer with sorted keys"
```

---

### Task C3: Mode-dependent ID generator

**Files:**
- Create: `trade-arbiter/packages/engine/src/id-gen.ts`
- Create: `trade-arbiter/packages/engine/test/id-gen.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/id-gen.test.ts`:

```typescript
/**
 * Tests for the mode-dependent ID generator. Backtest modes use a seeded
 * monotonic counter rendered as a 26-char ULID-shaped string. Paper/live
 * modes will use real ULIDs, but Plan 2 only needs the dispatch — the
 * paper/live branch throws a clear 'not implemented in Plan 2' error.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { createIdGen } from '../src/id-gen.js';

test('backtest counter starts at 1 and increments monotonically', () => {
  const gen = createIdGen('backtest_l1');
  assert.equal(gen.next(), '00000000000000000000000001');
  assert.equal(gen.next(), '00000000000000000000000002');
  assert.equal(gen.next(), '00000000000000000000000003');
});

test('backtest_l2 uses the same counter scheme', () => {
  const gen = createIdGen('backtest_l2');
  assert.equal(gen.next(), '00000000000000000000000001');
});

test('two backtest generators produce identical sequences', () => {
  const a = createIdGen('backtest_l1');
  const b = createIdGen('backtest_l1');
  const seqA = [a.next(), a.next(), a.next()];
  const seqB = [b.next(), b.next(), b.next()];
  assert.deepEqual(seqA, seqB);
});

test('counter id is always 26 chars long', () => {
  const gen = createIdGen('backtest_l1');
  for (let i = 0; i < 10; i++) {
    assert.equal(gen.next().length, 26);
  }
});

test('paper mode throws "not implemented in Plan 2"', () => {
  const gen = createIdGen('paper');
  assert.throws(() => gen.next(), /Plan 2/);
});

test('live mode throws "not implemented in Plan 2"', () => {
  const gen = createIdGen('live');
  assert.throws(() => gen.next(), /Plan 2/);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/id-gen.ts`:

```typescript
/**
 * Mode-dependent ID factory. Backtest modes use a seeded monotonic counter
 * rendered as a 26-char ULID-shaped string. Paper/live modes throw until
 * Plan 5 (first real adapter) wires a real ULID implementation.
 *
 * See docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md
 * section "Determinism contract > ID generation in backtest mode".
 */
import type { Mode } from '@trade-arbiter/core';

export interface IdGen {
  next(): string;
}

const ULID_LEN = 26;

export function createIdGen(mode: Mode): IdGen {
  if (mode === 'backtest_l1' || mode === 'backtest_l2') {
    let n = 0;
    return {
      next(): string {
        n += 1;
        return n.toString(10).padStart(ULID_LEN, '0');
      },
    };
  }
  return {
    next(): string {
      throw new Error(
        `createIdGen: real ULID generation for mode '${mode}' is not implemented in Plan 2; wired in Plan 5`,
      );
    },
  };
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/id-gen.ts trade-arbiter/packages/engine/test/id-gen.test.ts
git commit -m "feat(engine): mode-dependent ID generator (counter for backtest)"
```

---

## Phase D — Clock

### Task D1: BacktestClock implementation

**Files:**
- Create: `trade-arbiter/packages/engine/src/backtest-clock.ts`
- Create: `trade-arbiter/packages/engine/test/backtest-clock.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/backtest-clock.test.ts`:

```typescript
/**
 * BacktestClock advances only via explicit advance(ts). now() returns the
 * most recently advanced timestamp. Clock never goes backwards.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { BacktestClock } from '../src/backtest-clock.js';

test('clock starts at its seed timestamp', () => {
  const c = new BacktestClock('backtest_l1', 1_700_000_000_000);
  assert.equal(c.now(), 1_700_000_000_000);
});

test('advance() moves the clock forward', () => {
  const c = new BacktestClock('backtest_l1', 0);
  c.advance(100);
  assert.equal(c.now(), 100);
  c.advance(250);
  assert.equal(c.now(), 250);
});

test('advance() to equal timestamp is a no-op (idempotent)', () => {
  const c = new BacktestClock('backtest_l1', 100);
  c.advance(100);
  assert.equal(c.now(), 100);
});

test('advance() to earlier timestamp throws', () => {
  const c = new BacktestClock('backtest_l1', 100);
  assert.throws(() => c.advance(50), /backwards/);
});

test('mode is exposed', () => {
  const c = new BacktestClock('backtest_l2', 0);
  assert.equal(c.mode, 'backtest_l2');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/backtest-clock.ts`:

```typescript
/**
 * Deterministic clock for backtest runs. Advances only when the engine
 * processes an event with a later `tsExchange`. Strategies and risk rules
 * read via the EngineClock interface; they never see system time.
 */
import type { EngineClock, Mode, Timestamp } from '@trade-arbiter/core';

export class BacktestClock implements EngineClock {
  readonly mode: Mode;
  private ts: Timestamp;

  constructor(mode: Mode, seedTs: Timestamp) {
    if (mode !== 'backtest_l1' && mode !== 'backtest_l2') {
      throw new Error(`BacktestClock cannot run in mode '${mode}'`);
    }
    this.mode = mode;
    this.ts = seedTs;
  }

  now(): Timestamp {
    return this.ts;
  }

  advance(ts: Timestamp): void {
    if (ts < this.ts) {
      throw new Error(
        `BacktestClock: refusing to move backwards from ${this.ts} to ${ts}`,
      );
    }
    this.ts = ts;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/backtest-clock.ts trade-arbiter/packages/engine/test/backtest-clock.test.ts
git commit -m "feat(engine): BacktestClock with monotonic advance()"
```

---

## Phase E — EventQueue and EventBus

### Task E1: InMemoryEventQueue

**Files:**
- Create: `trade-arbiter/packages/engine/src/event-queue.ts`
- Create: `trade-arbiter/packages/engine/test/event-queue.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/event-queue.test.ts`:

```typescript
/**
 * InMemoryEventQueue: FIFO drain, ordering by ts with insertion-order
 * tiebreaker, stop() halts the drain loop.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { EngineEvent, RunContext } from '@trade-arbiter/core';
import { InMemoryEventQueue } from '../src/event-queue.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkEvent(eventId: string, ts: number, payload: unknown): EngineEvent<unknown> {
  return { eventId, ctx, ts, payload };
}

test('enqueue increases size', () => {
  const q = new InMemoryEventQueue();
  assert.equal(q.size(), 0);
  q.enqueue(mkEvent('a', 0, 'x'));
  assert.equal(q.size(), 1);
});

test('run() drains events in timestamp order; handler sees each once', async () => {
  const q = new InMemoryEventQueue();
  const seen: string[] = [];
  q.onDrain((ev) => {
    seen.push(ev.eventId);
  });
  q.enqueue(mkEvent('b', 10, null));
  q.enqueue(mkEvent('a', 5, null));
  q.enqueue(mkEvent('c', 15, null));
  await q.run();
  assert.deepEqual(seen, ['a', 'b', 'c']);
});

test('equal timestamps fall back to insertion order', async () => {
  const q = new InMemoryEventQueue();
  const seen: string[] = [];
  q.onDrain((ev) => {
    seen.push(ev.eventId);
  });
  q.enqueue(mkEvent('first', 10, null));
  q.enqueue(mkEvent('second', 10, null));
  q.enqueue(mkEvent('third', 10, null));
  await q.run();
  assert.deepEqual(seen, ['first', 'second', 'third']);
});

test('stop() halts the drain even with pending events', async () => {
  const q = new InMemoryEventQueue();
  let seen = 0;
  q.onDrain(async () => {
    seen += 1;
    // Let the main thread call stop() before we drain more.
    await q.stop();
  });
  q.enqueue(mkEvent('a', 0, null));
  q.enqueue(mkEvent('b', 1, null));
  q.enqueue(mkEvent('c', 2, null));
  await q.run();
  assert.equal(seen, 1, 'handler should see only the first event before stop()');
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/event-queue.ts`:

```typescript
/**
 * In-memory, single-producer/single-consumer queue. Ordering: ascending
 * `ts`, insertion-order tiebreaker for equal `ts`. A simple array with a
 * binary-search insert keeps the implementation dependency-free; the event
 * volume in v0.1 is well under the threshold where a heap would matter.
 *
 * This class implements the engine side of the `EventQueue` contract but
 * adds `onDrain()` so the bus can subscribe to pop events. The public
 * `EventQueue` interface stays the same; `onDrain` is an engine-internal
 * extension.
 */
import type { EngineEvent, EventQueue } from '@trade-arbiter/core';

interface Entry {
  ts: number;
  insertSeq: number;
  event: EngineEvent<unknown>;
}

export class InMemoryEventQueue implements EventQueue {
  private readonly entries: Entry[] = [];
  private insertSeq = 0;
  private running = false;
  private stopped = false;
  private drainHandler: ((ev: EngineEvent<unknown>) => void | Promise<void>) | null = null;

  enqueue(ev: EngineEvent<unknown>): void {
    const entry: Entry = { ts: ev.ts, insertSeq: this.insertSeq++, event: ev };
    // Binary search for insertion point.
    let lo = 0;
    let hi = this.entries.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      const m = this.entries[mid];
      if (m === undefined) {
        // Guard for noUncheckedIndexedAccess; should be unreachable given lo/hi bounds.
        throw new Error('InMemoryEventQueue: binary-search bounds violated');
      }
      if (m.ts < entry.ts || (m.ts === entry.ts && m.insertSeq < entry.insertSeq)) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    this.entries.splice(lo, 0, entry);
  }

  onDrain(cb: (ev: EngineEvent<unknown>) => void | Promise<void>): void {
    this.drainHandler = cb;
  }

  async run(): Promise<void> {
    if (this.running) throw new Error('InMemoryEventQueue.run: already running');
    this.running = true;
    this.stopped = false;
    while (!this.stopped) {
      const next = this.entries.shift();
      if (next === undefined) {
        // Yield and re-check. In Plan 2 the caller stops the queue once input
        // is exhausted; a timer or real async I/O would replace this in later plans.
        await Promise.resolve();
        if (this.stopped) break;
        if (this.entries.length === 0) break;
        continue;
      }
      if (this.drainHandler !== null) {
        await this.drainHandler(next.event);
      }
    }
    this.running = false;
  }

  async stop(): Promise<void> {
    this.stopped = true;
  }

  size(): number {
    return this.entries.length;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/event-queue.ts trade-arbiter/packages/engine/test/event-queue.test.ts
git commit -m "feat(engine): InMemoryEventQueue with deterministic ordering"
```

---

### Task E2: InMemoryEventBus

**Files:**
- Create: `trade-arbiter/packages/engine/src/event-bus.ts`
- Create: `trade-arbiter/packages/engine/test/event-bus.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/event-bus.test.ts`:

```typescript
/**
 * InMemoryEventBus dispatches events to per-type subscribers. Publication
 * enqueues onto the wrapped queue; delivery happens on drain.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { EngineEvent, RunContext } from '@trade-arbiter/core';
import { InMemoryEventBus } from '../src/event-bus.js';
import { InMemoryEventQueue } from '../src/event-queue.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkEvent<T>(eventId: string, ts: number, payload: T): EngineEvent<T> {
  return { eventId, ctx, ts, payload };
}

test('subscribers receive events of their type', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const received: unknown[] = [];
  bus.subscribe<string>('market', (ev) => {
    received.push(ev.payload);
  });
  bus.publish('market', mkEvent('a', 0, 'hello'));
  await q.run();
  assert.deepEqual(received, ['hello']);
});

test('unsubscribe stops delivery', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const received: unknown[] = [];
  const off = bus.subscribe<string>('market', (ev) => {
    received.push(ev.payload);
  });
  off();
  bus.publish('market', mkEvent('a', 0, 'ignored'));
  await q.run();
  assert.deepEqual(received, []);
});

test('subscribers receiving the wrong type are not invoked', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const marketSeen: unknown[] = [];
  const fillSeen: unknown[] = [];
  bus.subscribe<string>('market', (ev) => {
    marketSeen.push(ev.payload);
  });
  bus.subscribe<string>('fill', (ev) => {
    fillSeen.push(ev.payload);
  });
  bus.publish('market', mkEvent('a', 0, 'm'));
  bus.publish('fill', mkEvent('b', 1, 'f'));
  await q.run();
  assert.deepEqual(marketSeen, ['m']);
  assert.deepEqual(fillSeen, ['f']);
});

test('multiple subscribers on same type both receive in subscription order', async () => {
  const q = new InMemoryEventQueue();
  const bus = new InMemoryEventBus(q);
  const order: string[] = [];
  bus.subscribe<string>('market', () => { order.push('A'); });
  bus.subscribe<string>('market', () => { order.push('B'); });
  bus.publish('market', mkEvent('a', 0, 'm'));
  await q.run();
  assert.deepEqual(order, ['A', 'B']);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/event-bus.ts`:

```typescript
/**
 * Pub/sub wrapper over InMemoryEventQueue. Tracks subscribers per event-type
 * string. Event-type strings are the engine's canonical topic names — the
 * engine orchestrator chooses them (e.g., 'market', 'intent', 'fill',
 * 'pnl', 'snapshot'). Free-form to avoid coupling the contract to a
 * specific enum; iteration order is insertion order.
 */
import type { EngineEvent, EventBus } from '@trade-arbiter/core';
import type { InMemoryEventQueue } from './event-queue.js';

type Handler = (ev: EngineEvent<unknown>) => void | Promise<void>;

export class InMemoryEventBus implements EventBus {
  private readonly subscribers = new Map<string, Handler[]>();
  private readonly envelopeType = new WeakMap<EngineEvent<unknown>, string>();

  constructor(queue: InMemoryEventQueue) {
    queue.onDrain(async (ev) => {
      const type = this.envelopeType.get(ev);
      if (type === undefined) return;
      const handlers = this.subscribers.get(type);
      if (handlers === undefined) return;
      for (const h of handlers) {
        await h(ev);
      }
    });
    this.queue = queue;
  }

  private readonly queue: InMemoryEventQueue;

  subscribe<T>(
    eventType: string,
    handler: (ev: EngineEvent<T>) => void | Promise<void>,
  ): () => void {
    const list = this.subscribers.get(eventType) ?? [];
    list.push(handler as Handler);
    this.subscribers.set(eventType, list);
    return () => {
      const current = this.subscribers.get(eventType);
      if (current === undefined) return;
      const idx = current.indexOf(handler as Handler);
      if (idx >= 0) current.splice(idx, 1);
    };
  }

  publish<T>(eventType: string, ev: EngineEvent<T>): void {
    this.envelopeType.set(ev as EngineEvent<unknown>, eventType);
    this.queue.enqueue(ev as EngineEvent<unknown>);
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/event-bus.ts trade-arbiter/packages/engine/test/event-bus.test.ts
git commit -m "feat(engine): InMemoryEventBus over the event queue"
```

---

## Phase F — RiskManager, OrderManager, PortfolioUpdater

### Task F1: DefaultRiskManager

**Files:**
- Create: `trade-arbiter/packages/engine/src/risk-manager.ts`
- Create: `trade-arbiter/packages/engine/test/risk-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/risk-manager.test.ts`:

```typescript
/**
 * DefaultRiskManager composes rules in declaration order, short-circuits on
 * first rejection, and emits a RiskDecision carrying the first-rejecting
 * reason (or 'ok' if all pass). Pure function of its inputs — no I/O.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  OrderIntent,
  PortfolioState,
  RiskRule,
  RiskState,
  RunContext,
  FillEvent,
} from '@trade-arbiter/core';
import { DefaultRiskManager } from '../src/risk-manager.js';
import { createIdGen } from '../src/id-gen.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

const intent: OrderIntent = {
  intentId: 'i1',
  ctx,
  tsCreated: 1,
  venue: 'hyperliquid',
  symbol: 'HYPE-PERP',
  side: 'buy',
  sizeRequested: 1,
  timeInForce: 'GTC',
  reason: 'test',
};

const portfolio: PortfolioState = {
  ctx,
  ts: 1,
  cashUsd: 1000,
  positions: new Map(),
  equity: 1000,
  dayStartEquity: 1000,
};

function makeRiskState(): RiskState {
  return {
    killSwitch: { active: false, triggeredBy: null, reason: '', triggeredAt: null },
    dayStartTs: 0,
    realizedPnlToday: 0,
    consecutiveLosses: 0,
    circuitBreakerTrippedAt: null,
    strategyExposureUsd: new Map(),
    venueExposureUsd: new Map(),
  };
}

test('empty rule list accepts every intent', () => {
  const rm = new DefaultRiskManager([], makeRiskState(), createIdGen('backtest_l1'), () => 42);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, true);
  assert.equal(d.sizeApproved, intent.sizeRequested);
  assert.equal(d.reason, 'ok');
  assert.equal(d.ts, 42);
});

test('passing rules chain to full approval', () => {
  const rule: RiskRule = {
    id: 'always-ok',
    check: () => ({ pass: true, size: 1, reason: 'fine' }),
  };
  const rm = new DefaultRiskManager([rule], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, true);
});

test('first rejecting rule wins; later rules are not called', () => {
  let secondCalls = 0;
  const first: RiskRule = {
    id: 'reject',
    check: () => ({ pass: false, size: 0, reason: 'no' }),
  };
  const second: RiskRule = {
    id: 'counter',
    check: () => { secondCalls += 1; return { pass: true, size: 1, reason: 'ok' }; },
  };
  const rm = new DefaultRiskManager([first, second], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check(intent, portfolio);
  assert.equal(d.approved, false);
  assert.equal(d.reason, 'no');
  assert.equal(d.sizeApproved, 0);
  assert.equal(secondCalls, 0);
});

test('approved size is the minimum across passing rules', () => {
  const r1: RiskRule = { id: 'cap5', check: () => ({ pass: true, size: 5, reason: 'cap5' }) };
  const r2: RiskRule = { id: 'cap2', check: () => ({ pass: true, size: 2, reason: 'cap2' }) };
  const rm = new DefaultRiskManager([r1, r2], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const d = rm.check({ ...intent, sizeRequested: 10 }, portfolio);
  assert.equal(d.approved, true);
  assert.equal(d.sizeApproved, 2);
});

test('isKilled() reflects the owned RiskState', () => {
  const state: RiskState = {
    ...makeRiskState(),
    killSwitch: { active: true, triggeredBy: 'user', reason: 'stop', triggeredAt: 1 },
  };
  const rm = new DefaultRiskManager([], state, createIdGen('backtest_l1'), () => 1);
  assert.equal(rm.isKilled(), true);
});

test('onFill keeps runtime contract stable (no-op in Plan 2 is acceptable; see docs)', () => {
  const rm = new DefaultRiskManager([], makeRiskState(), createIdGen('backtest_l1'), () => 1);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 1,
    tsReceived: 1,
    status: 'filled',
    filledSize: 1,
    remainingSize: 0,
    avgPrice: 100,
    feesPaid: 0,
  };
  assert.doesNotThrow(() => rm.onFill(fill));
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/risk-manager.ts`:

```typescript
/**
 * DefaultRiskManager. Composes rules in declaration order, short-circuits on
 * first reject. `sizeApproved` for an accepted decision is the minimum of
 * `intent.sizeRequested` and every passing rule's returned `size`.
 *
 * This is the risk pipeline runner — concrete rules (KillSwitchRule,
 * HardCapsRule, LiveArmRule, etc.) live in their own plans and plug in
 * here as a `ReadonlyArray<RiskRule>`.
 *
 * Plan 2's `onFill()` is a no-op: `realizedPnlToday`, `consecutiveLosses`,
 * and exposure accounting land with the rules that consume them (Plan 7).
 * Accepting fills without updating state keeps the runtime contract stable
 * without premature implementation.
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
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/risk-manager.ts trade-arbiter/packages/engine/test/risk-manager.test.ts
git commit -m "feat(engine): DefaultRiskManager composes RiskRule pipeline"
```

---

### Task F2: DefaultOrderManager

**Files:**
- Create: `trade-arbiter/packages/engine/src/order-manager.ts`
- Create: `trade-arbiter/packages/engine/test/order-manager.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/order-manager.test.ts`:

```typescript
/**
 * DefaultOrderManager tracks intent → request → fill lineage. Open orders
 * are any request not yet terminally filled or cancelled.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  FillEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  RunContext,
} from '@trade-arbiter/core';
import { DefaultOrderManager } from '../src/order-manager.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

const intent: OrderIntent = {
  intentId: 'i1',
  ctx,
  tsCreated: 1,
  venue: 'hyperliquid',
  symbol: 'HYPE-PERP',
  side: 'buy',
  sizeRequested: 1,
  timeInForce: 'GTC',
  reason: 'test',
};

const request: OrderRequest = {
  ...intent,
  requestId: 'r1',
  sizeApproved: 1,
  riskDecisionId: 'd1',
};

test('getOpenOrders starts empty', () => {
  const om = new DefaultOrderManager();
  assert.equal(om.getOpenOrders().length, 0);
});

test('onIntent adds a request to open orders', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  assert.equal(om.getOpenOrders().length, 1);
  assert.equal(om.getOpenOrders()[0]?.requestId, 'r1');
});

test('getLineage reflects intent + requests + fills + events', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const lin = om.getLineage('i1');
  assert.equal(lin.intent.intentId, 'i1');
  assert.equal(lin.requests.length, 1);
  assert.equal(lin.fills.length, 0);
  assert.equal(lin.events.length, 0);
  assert.equal(lin.status, 'pending');
  assert.equal(lin.remainingSize, 1);
});

test('terminal fill removes request from open orders', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 2,
    tsReceived: 2,
    status: 'filled',
    filledSize: 1,
    remainingSize: 0,
    avgPrice: 100,
    feesPaid: 0,
  };
  om.onFill(fill);
  assert.equal(om.getOpenOrders().length, 0);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'filled');
  assert.equal(lin.remainingSize, 0);
  assert.equal(lin.fills.length, 1);
});

test('partial fill keeps request open with reduced remaining size', () => {
  const om = new DefaultOrderManager();
  const req2: OrderRequest = { ...request, sizeApproved: 5 };
  om.onIntent(intent, req2);
  const fill: FillEvent = {
    fillId: 'f1',
    intentId: 'i1',
    requestId: 'r1',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 2,
    tsReceived: 2,
    status: 'partial',
    filledSize: 2,
    remainingSize: 3,
    avgPrice: 100,
    feesPaid: 0,
  };
  om.onFill(fill);
  assert.equal(om.getOpenOrders().length, 1);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'partially_filled');
  assert.equal(lin.remainingSize, 3);
});

test('OrderEvent updates status without fill', () => {
  const om = new DefaultOrderManager();
  om.onIntent(intent, request);
  const ev: OrderEvent = {
    requestId: 'r1',
    intentId: 'i1',
    ctx,
    status: 'cancelled',
    remainingSize: 1,
    ts: 3,
  };
  om.onOrderEvent(ev);
  assert.equal(om.getOpenOrders().length, 0);
  const lin = om.getLineage('i1');
  assert.equal(lin.status, 'cancelled');
});

test('tickTimeouts is a no-op in Plan 2 (acceptance of future wiring)', () => {
  const om = new DefaultOrderManager();
  assert.doesNotThrow(() => om.tickTimeouts(1000));
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/order-manager.ts`:

```typescript
/**
 * DefaultOrderManager. Keeps an intent-keyed map of OrderLineage and an
 * open-orders set derived from the lineage status. Timeouts are a Plan 7
 * concern — `tickTimeouts()` is a no-op here.
 *
 * This manager does NOT generate requestIds. The engine orchestrator does
 * that before calling `onIntent()`, so rule-approval and ID assignment stay
 * adjacent (both read from the same IdGen seeded once per run).
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
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/order-manager.ts trade-arbiter/packages/engine/test/order-manager.test.ts
git commit -m "feat(engine): DefaultOrderManager tracks OrderLineage"
```

---

### Task F3: PortfolioUpdater (emits PnlEvent on fill)

**Files:**
- Create: `trade-arbiter/packages/engine/src/portfolio-updater.ts`
- Create: `trade-arbiter/packages/engine/test/portfolio-updater.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/portfolio-updater.test.ts`:

```typescript
/**
 * PortfolioUpdater. Given FillEvents and a last-quote provider, maintains
 * PortfolioState and emits a PnlEvent per fill. Realized PnL formula
 * follows the spec: realizedDelta = (fill_price − avg_entry) × qty × sign
 * for closing fills, 0 for opening fills; opening fills update avg_entry.
 * Fees are subtracted from realizedDelta verbatim.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { FillEvent, RunContext } from '@trade-arbiter/core';
import { PortfolioUpdater } from '../src/portfolio-updater.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'strat',
  configHash: 'hash',
  mode: 'backtest_l1',
};

function mkFill(over: Partial<FillEvent>): FillEvent {
  return {
    fillId: 'f',
    intentId: 'i',
    requestId: 'r',
    ctx,
    venue: 'hyperliquid',
    symbol: 'HYPE-PERP',
    tsExchange: 1,
    tsReceived: 1,
    status: 'filled',
    filledSize: 1,
    remainingSize: 0,
    avgPrice: 100,
    feesPaid: 0,
    ...over,
  };
}

test('opening long fill sets avgEntry; realizedDelta is 0', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const pnl = pu.onFill(mkFill({ filledSize: 2, avgPrice: 100 }));
  assert.equal(pnl.realizedDelta, 0);
  assert.equal(pnl.realizedCumulative, 0);
  assert.equal(pnl.currency, 'USDC');
});

test('adding to long position updates avgEntry (weighted average)', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFill(mkFill({ filledSize: 2, avgPrice: 100 }));
  pu.onFill(mkFill({ fillId: 'f2', filledSize: 2, avgPrice: 110 }));
  const p = pu.getPortfolio(2);
  const pos = p.positions.get('hyperliquid:HYPE-PERP:');
  assert.equal(pos?.qty, 4);
  assert.equal(pos?.avgCost, 105);
});

test('explicit sell closes a long and booked PnL matches formula', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFill(mkFill({ filledSize: 2, avgPrice: 100 }));
  const sell = mkFill({
    fillId: 'close',
    filledSize: 1,
    avgPrice: 110,
    feesPaid: 0.25,
    remainingSize: 0,
  });
  // Simulate a sell by using a fill with a negative filledSize convention:
  // PortfolioUpdater treats `side` via the helper. We enrich the helper here.
  const pnl = pu.onFillDirected(sell, 'sell');
  assert.equal(pnl.realizedDelta, (110 - 100) * 1 - 0.25);
  const p = pu.getPortfolio(1);
  assert.equal(p.positions.get('hyperliquid:HYPE-PERP:')?.qty, 1);
});

test('cumulative realized tracks the running total', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.onFill(mkFill({ filledSize: 1, avgPrice: 100 }));
  const a = pu.onFillDirected(mkFill({ fillId: 'sell1', filledSize: 1, avgPrice: 105, feesPaid: 0 }), 'sell');
  pu.onFill(mkFill({ fillId: 'buy2', filledSize: 1, avgPrice: 200 }));
  const b = pu.onFillDirected(mkFill({ fillId: 'sell2', filledSize: 1, avgPrice: 190, feesPaid: 0 }), 'sell');
  assert.equal(a.realizedCumulative, 5);
  assert.equal(b.realizedCumulative, -5);
});

test('empty position produces 0 unrealizedMark regardless of quote presence', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  pu.updateMark('hyperliquid:HYPE-PERP:', 999);
  const pnl = pu.onFill(mkFill({ filledSize: 0, status: 'cancelled', remainingSize: 0 }));
  // A fill with filledSize 0 changes nothing; marks are irrelevant.
  assert.equal(pnl.unrealizedMark, 0);
});
```

Note: the helper introduces `onFillDirected(fill, side)` because the
`FillEvent` payload in Plan 1's contract does not carry side directly; the
engine derives side from the originating `OrderRequest`. Plan 2's updater
accepts an explicit side argument — the orchestrator in Task I1 passes it.

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/portfolio-updater.ts`:

```typescript
/**
 * PortfolioUpdater applies fills to a running PortfolioState and emits a
 * PnlEvent per fill. Tracks per-instrument position (qty, avgCost), realized
 * PnL (cumulative), and the last-seen mark price for unrealized PnL.
 *
 * Mark source in Plan 2: caller updates via updateMark(key, price) whenever
 * a QuoteEvent or TradeEvent is seen. If no mark is known for an open
 * position, unrealizedPnl contribution is 0 for that leg.
 *
 * Realized PnL formula (spec section "PnL semantics (v0.1)"):
 *   realizedDelta = (fill_price − avg_entry) × filledSize × closingSign − feesPaid
 * where closingSign = +1 when selling to close a long and −1 when buying to
 * cover a short. Opening fills set realizedDelta = feesPaid negated (fees
 * are always realized immediately) and update avgCost via weighted average.
 *
 * Out of scope (spec): slippage, partial-fill realism, funding, borrow costs.
 */
import type {
  FillEvent,
  PnlEvent,
  PortfolioState,
  PositionState,
  Side,
  Symbol as InstrumentSymbol,
  Timestamp,
  Venue,
} from '@trade-arbiter/core';

function key(venue: Venue, symbol: InstrumentSymbol): string {
  // Matches the PortfolioState.positions key convention from core.
  return `${venue}:${symbol}:`;
}

interface MutablePosition {
  venue: Venue;
  symbol: InstrumentSymbol;
  qty: number;       // signed
  avgCost: number;
  realizedPnl: number;
  markPrice: number | null;
}

export class PortfolioUpdater {
  private readonly positions = new Map<string, MutablePosition>();
  private realizedCumulative = 0;
  private cash: number;
  private readonly initialCash: number;
  private readonly currency: string;

  constructor(initialCash: number, currency: string) {
    this.cash = initialCash;
    this.initialCash = initialCash;
    this.currency = currency;
  }

  updateMark(positionKey: string, price: number): void {
    const pos = this.positions.get(positionKey);
    if (pos === undefined) return;
    pos.markPrice = price;
  }

  onFill(fill: FillEvent): PnlEvent {
    // Used when side is derivable from caller context (or the fill has no
    // side semantics — e.g., a cancelled zero-size fill). Default to 'buy'
    // for the no-op case; positions mutate only when filledSize > 0.
    return this.onFillDirected(fill, 'buy');
  }

  onFillDirected(fill: FillEvent, side: Side): PnlEvent {
    const pk = key(fill.venue, fill.symbol);
    if (fill.filledSize <= 0) {
      return this.makePnlEvent(fill, 0, pk);
    }

    const pos = this.positions.get(pk) ?? {
      venue: fill.venue,
      symbol: fill.symbol,
      qty: 0,
      avgCost: 0,
      realizedPnl: 0,
      markPrice: null,
    };
    const signedFillQty = side === 'buy' ? fill.filledSize : -fill.filledSize;

    let realizedDelta = -fill.feesPaid;
    const sameDirection = (pos.qty === 0) || (Math.sign(pos.qty) === Math.sign(signedFillQty));

    if (sameDirection) {
      const newQty = pos.qty + signedFillQty;
      const newAvgCost = newQty === 0
        ? 0
        : (pos.qty * pos.avgCost + signedFillQty * fill.avgPrice) / newQty;
      pos.qty = newQty;
      pos.avgCost = newAvgCost;
    } else {
      const closingSize = Math.min(Math.abs(signedFillQty), Math.abs(pos.qty));
      const closingSign = pos.qty > 0 ? 1 : -1; // +1 for closing long, −1 for covering short
      realizedDelta += (fill.avgPrice - pos.avgCost) * closingSize * closingSign;
      const remainingOpposite = Math.abs(signedFillQty) - closingSize;
      if (remainingOpposite > 0) {
        // Position flipped through zero: new position opens at fill price.
        pos.qty = Math.sign(signedFillQty) * remainingOpposite;
        pos.avgCost = fill.avgPrice;
      } else {
        pos.qty = pos.qty + signedFillQty;
        if (pos.qty === 0) pos.avgCost = 0;
      }
    }

    pos.realizedPnl += realizedDelta;
    this.realizedCumulative += realizedDelta;
    this.cash += realizedDelta;
    this.positions.set(pk, pos);

    return this.makePnlEvent(fill, realizedDelta, pk);
  }

  getPortfolio(ts: Timestamp): PortfolioState {
    const out = new Map<string, PositionState>();
    let unrealizedTotal = 0;
    for (const [k, p] of this.positions) {
      const unreal = p.markPrice !== null
        ? (p.markPrice - p.avgCost) * p.qty
        : 0;
      unrealizedTotal += unreal;
      out.set(k, {
        venue: p.venue,
        symbol: p.symbol,
        qty: p.qty,
        avgCost: p.avgCost,
        realizedPnl: p.realizedPnl,
        unrealizedPnl: unreal,
      });
    }
    return {
      ctx: PLACEHOLDER_CTX, // orchestrator rebinds before publishing
      ts,
      cashUsd: this.cash,
      positions: out,
      equity: this.cash + unrealizedTotal,
      dayStartEquity: this.initialCash,
    };
  }

  currentRealizedCumulative(): number {
    return this.realizedCumulative;
  }

  snapshotPositionsForPnlSnapshot(): ReadonlyArray<{
    symbol: InstrumentSymbol;
    qty: number;
    avgEntry: number;
    markPrice: number;
  }> {
    const out: Array<{ symbol: InstrumentSymbol; qty: number; avgEntry: number; markPrice: number }> = [];
    for (const p of this.positions.values()) {
      if (p.qty === 0) continue;
      out.push({
        symbol: p.symbol,
        qty: p.qty,
        avgEntry: p.avgCost,
        markPrice: p.markPrice ?? p.avgCost,
      });
    }
    return out;
  }

  totalUnrealized(): number {
    let total = 0;
    for (const p of this.positions.values()) {
      if (p.markPrice === null) continue;
      total += (p.markPrice - p.avgCost) * p.qty;
    }
    return total;
  }

  getCurrency(): string {
    return this.currency;
  }

  private makePnlEvent(fill: FillEvent, realizedDelta: number, pk: string): PnlEvent {
    const pos = this.positions.get(pk);
    const unrealized = (pos !== undefined && pos.markPrice !== null)
      ? (pos.markPrice - pos.avgCost) * pos.qty
      : 0;
    return {
      type: 'pnl',
      strategyId: fill.ctx.strategyId,
      symbol: fill.symbol,
      realizedDelta,
      realizedCumulative: this.realizedCumulative,
      unrealizedMark: unrealized,
      currency: this.currency,
      triggeredBy: 'fill',
    };
  }
}

// Placeholder RunContext used when getPortfolio() is called outside the
// orchestrator; the orchestrator overrides ctx via structural copy before
// publishing. Keeping the field typed avoids an optional ctx on PortfolioState.
const PLACEHOLDER_CTX = {
  runId: '00000000000000000000000000',
  strategyId: 'unbound',
  configHash: 'unbound',
  mode: 'backtest_l1',
} as const;
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/portfolio-updater.ts trade-arbiter/packages/engine/test/portfolio-updater.test.ts
git commit -m "feat(engine): PortfolioUpdater with realized/unrealized PnL accounting"
```

---

## Phase G — PnL snapshot ticker

### Task G1: PnlSnapshotter

**Files:**
- Create: `trade-arbiter/packages/engine/src/pnl-snapshotter.ts`
- Create: `trade-arbiter/packages/engine/test/pnl-snapshotter.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/pnl-snapshotter.test.ts`:

```typescript
/**
 * PnlSnapshotter emits a PnlSnapshot whenever the engine clock has advanced
 * past the previous snapshot time by at least `intervalMs`. Pure function of
 * (now, lastEmittedTs, interval) — no timers.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { PortfolioUpdater } from '../src/portfolio-updater.js';
import { PnlSnapshotter } from '../src/pnl-snapshotter.js';

test('first tick after interval boundary emits a snapshot', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  assert.equal(s.maybeEmit(500), null);
  const snap = s.maybeEmit(1000);
  assert.ok(snap !== null);
  assert.equal(snap?.type, 'pnl_snapshot');
});

test('repeated calls before next interval return null', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  assert.ok(s.maybeEmit(1000) !== null);
  assert.equal(s.maybeEmit(1500), null);
  assert.ok(s.maybeEmit(2000) !== null);
});

test('snapshot carries empty positions initially', () => {
  const pu = new PortfolioUpdater(1000, 'USDC');
  const s = new PnlSnapshotter(pu, 'strat', 1000, 0);
  const snap = s.maybeEmit(1000);
  assert.equal(snap?.positions.length, 0);
  assert.equal(snap?.realizedCumulative, 0);
  assert.equal(snap?.unrealizedTotal, 0);
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/pnl-snapshotter.ts`:

```typescript
/**
 * Clock-driven PnL snapshot emitter. Caller invokes `maybeEmit(now)` whenever
 * the engine clock advances; the snapshotter returns a PnlSnapshot if the
 * elapsed since last emit is >= intervalMs, else null.
 */
import type { PnlSnapshot, StrategyId, Timestamp } from '@trade-arbiter/core';
import type { PortfolioUpdater } from './portfolio-updater.js';

export class PnlSnapshotter {
  private lastEmittedTs: Timestamp;

  constructor(
    private readonly portfolio: PortfolioUpdater,
    private readonly strategyId: StrategyId,
    private readonly intervalMs: number,
    startTs: Timestamp,
  ) {
    this.lastEmittedTs = startTs;
  }

  maybeEmit(now: Timestamp): PnlSnapshot | null {
    if (now - this.lastEmittedTs < this.intervalMs) return null;
    this.lastEmittedTs = now;
    return {
      type: 'pnl_snapshot',
      strategyId: this.strategyId,
      positions: this.portfolio.snapshotPositionsForPnlSnapshot(),
      realizedCumulative: this.portfolio.currentRealizedCumulative(),
      unrealizedTotal: this.portfolio.totalUnrealized(),
      currency: this.portfolio.getCurrency(),
    };
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/pnl-snapshotter.ts trade-arbiter/packages/engine/test/pnl-snapshotter.test.ts
git commit -m "feat(engine): PnlSnapshotter emits on engine-clock intervals"
```

---

## Phase H — JSONL audit writer

### Task H1: JsonlAuditWriter

**Files:**
- Create: `trade-arbiter/packages/engine/src/audit-writer.ts`
- Create: `trade-arbiter/packages/engine/test/audit-writer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `trade-arbiter/packages/engine/test/audit-writer.test.ts`:

```typescript
/**
 * JsonlAuditWriter writes each AuditRecord as one LF-terminated line of
 * stable JSON. The write interface is synchronous from the caller's
 * perspective (fire-and-forget append); internally we buffer to a string
 * and expose flushToString() for tests and to a file handle for the
 * engine runtime.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type { AuditRecord } from '@trade-arbiter/core';
import { JsonlAuditWriter } from '../src/audit-writer.js';

test('write appends one line per record in call order', () => {
  const w = new JsonlAuditWriter();
  const a: AuditRecord = {
    eventId: '01',
    ts: 100,
    runId: 'RUN',
    kind: 'market',
    payload: { type: 'quote', b: 2, a: 1 },
  };
  const b: AuditRecord = {
    eventId: '02',
    ts: 200,
    runId: 'RUN',
    kind: 'fill',
    payload: { filledSize: 1 },
  };
  w.write(a);
  w.write(b);
  const out = w.flushToString();
  const lines = out.split('\n');
  assert.equal(lines.length, 3); // two records + trailing empty
  assert.equal(lines[2], '');
});

test('each line is parseable JSON with sorted keys', () => {
  const w = new JsonlAuditWriter();
  w.write({
    eventId: '01',
    ts: 1,
    runId: 'RUN',
    kind: 'pnl',
    payload: { z: 1, a: 2 },
  });
  const line = w.flushToString().split('\n')[0] ?? '';
  assert.ok(line.indexOf('"eventId"') < line.indexOf('"kind"'));
  assert.ok(line.indexOf('"kind"') < line.indexOf('"payload"'));
  assert.ok(line.indexOf('"payload"') < line.indexOf('"runId"'));
  assert.ok(line.indexOf('"runId"') < line.indexOf('"ts"'));
  // Inside payload, 'a' before 'z':
  assert.ok(line.indexOf('"a":2') < line.indexOf('"z":1'));
});

test('numbers in payload use deterministic formatter', () => {
  const w = new JsonlAuditWriter();
  w.write({
    eventId: '01',
    ts: 1,
    runId: 'RUN',
    kind: 'pnl',
    payload: { x: 1.5, y: 42 },
  });
  const line = w.flushToString().split('\n')[0] ?? '';
  assert.ok(line.includes('"x":1.500000000000'));
  assert.ok(line.includes('"y":42'));
});

test('rejects unknown kind', () => {
  const w = new JsonlAuditWriter();
  assert.throws(
    () => w.write({
      eventId: '01',
      ts: 1,
      runId: 'RUN',
      kind: 'bogus' as 'market',
      payload: {},
    }),
    /kind/,
  );
});
```

- [ ] **Step 2: Run to verify failure**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `trade-arbiter/packages/engine/src/audit-writer.ts`:

```typescript
/**
 * JsonlAuditWriter. Accepts AuditRecords and buffers stable-JSON lines.
 * The engine's orchestrator calls write() on every bus event; a file sink
 * (out of scope for Plan 2) will consume flushToString() periodically.
 */
import type { AuditRecord } from '@trade-arbiter/core';
import { AUDIT_KINDS } from '@trade-arbiter/core';
import { stableStringify } from './stable-json.js';

const VALID_KINDS = new Set<string>(AUDIT_KINDS);

export class JsonlAuditWriter {
  private buffer = '';

  write(record: AuditRecord): void {
    if (!VALID_KINDS.has(record.kind)) {
      throw new Error(`JsonlAuditWriter: invalid kind '${record.kind}'`);
    }
    this.buffer += stableStringify(record);
    this.buffer += '\n';
  }

  flushToString(): string {
    const out = this.buffer;
    this.buffer = '';
    return out;
  }
}
```

- [ ] **Step 4: Run tests**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add trade-arbiter/packages/engine/src/audit-writer.ts trade-arbiter/packages/engine/test/audit-writer.test.ts
git commit -m "feat(engine): JsonlAuditWriter emits stable-JSON records"
```

---

## Phase I — Engine orchestrator

### Task I1: Engine class ties it all together

**Files:**
- Create: `trade-arbiter/packages/engine/src/engine.ts`
- Modify: `trade-arbiter/packages/engine/src/index.ts`

- [ ] **Step 1: Create the orchestrator**

Create `trade-arbiter/packages/engine/src/engine.ts`:

```typescript
/**
 * Engine orchestrator. Constructor takes a DataFeed, Strategy,
 * ExecutionAdapter, and RiskRule list plus static config (cash, currency,
 * snapshot interval, run context). `run()` starts the feed and drains until
 * the feed stops.
 *
 * Event topic names: 'market', 'intent', 'decision', 'request', 'order',
 * 'fill', 'pnl', 'snapshot'. These match the AuditKind union so audit
 * records can be emitted 1:1 with bus events.
 */
import type {
  DataFeed,
  EngineEvent,
  ExecutionAdapter,
  FillEvent,
  MarketEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  PnlSnapshot,
  RiskRule,
  RiskState,
  RunContext,
  Strategy,
  StrategyContext,
  Timestamp,
} from '@trade-arbiter/core';
import { BacktestClock } from './backtest-clock.js';
import { InMemoryEventBus } from './event-bus.js';
import { InMemoryEventQueue } from './event-queue.js';
import { createIdGen, type IdGen } from './id-gen.js';
import { DefaultOrderManager } from './order-manager.js';
import { DefaultRiskManager } from './risk-manager.js';
import { PortfolioUpdater } from './portfolio-updater.js';
import { PnlSnapshotter } from './pnl-snapshotter.js';
import { JsonlAuditWriter } from './audit-writer.js';

export interface EngineConfig {
  readonly ctx: RunContext;
  readonly initialCash: number;
  readonly currency: string;
  readonly pnlSnapshotIntervalMs: number;
  readonly rules: ReadonlyArray<RiskRule>;
  readonly feed: DataFeed;
  readonly strategy: Strategy;
  readonly adapter: ExecutionAdapter;
}

export class Engine {
  private readonly queue = new InMemoryEventQueue();
  private readonly bus: InMemoryEventBus;
  private readonly clock: BacktestClock;
  private readonly ids: IdGen;
  private readonly orders = new DefaultOrderManager();
  private readonly portfolio: PortfolioUpdater;
  private readonly risk: DefaultRiskManager;
  private readonly snapshotter: PnlSnapshotter;
  readonly audit = new JsonlAuditWriter();
  private done = false;

  constructor(private readonly cfg: EngineConfig) {
    this.bus = new InMemoryEventBus(this.queue);
    this.clock = new BacktestClock(cfg.ctx.mode, 0);
    this.ids = createIdGen(cfg.ctx.mode);
    this.portfolio = new PortfolioUpdater(cfg.initialCash, cfg.currency);
    const riskState: RiskState = {
      killSwitch: { active: false, triggeredBy: null, reason: '', triggeredAt: null },
      dayStartTs: 0,
      realizedPnlToday: 0,
      consecutiveLosses: 0,
      circuitBreakerTrippedAt: null,
      strategyExposureUsd: new Map(),
      venueExposureUsd: new Map(),
    };
    this.risk = new DefaultRiskManager(cfg.rules, riskState, this.ids, () => this.clock.now());
    this.snapshotter = new PnlSnapshotter(this.portfolio, cfg.ctx.strategyId, cfg.pnlSnapshotIntervalMs, 0);

    this.wire();
  }

  private wire(): void {
    // Market events: update clock, update portfolio mark, forward to strategy.
    this.bus.subscribe<MarketEvent>('market', (ev) => {
      this.clock.advance(ev.payload.tsExchange);
      const mark = this.deriveMark(ev.payload);
      if (mark !== null) {
        this.portfolio.updateMark(`${ev.payload.venue}:${ev.payload.symbol}:`, mark);
      }
      this.cfg.strategy.onMarketEvent(ev.payload);
      this.audit.write({ eventId: ev.eventId, ts: ev.ts, runId: ev.ctx.runId, kind: 'market', payload: ev.payload });
      this.maybeEmitSnapshot();
    });

    // Intents: approve via risk; on approve, make OrderRequest and submit.
    this.bus.subscribe<OrderIntent>('intent', async (ev) => {
      const decision = this.risk.check(ev.payload, this.snapshotPortfolio());
      this.publish('decision', decision, decision.ts);
      this.audit.write({ eventId: this.ids.next(), ts: decision.ts, runId: ev.ctx.runId, kind: 'decision', payload: decision });
      if (!decision.approved) return;
      const request: OrderRequest = {
        ...ev.payload,
        requestId: this.ids.next(),
        sizeApproved: decision.sizeApproved,
        riskDecisionId: decision.decisionId,
      };
      this.orders.onIntent(ev.payload, request);
      this.publish('request', request, this.clock.now());
      this.audit.write({ eventId: request.requestId, ts: this.clock.now(), runId: ev.ctx.runId, kind: 'request', payload: request });
      await this.cfg.adapter.submit(request);
    });

    // Fills: update portfolio + orders, emit PnlEvent, forward to strategy.
    this.bus.subscribe<FillEvent>('fill', (ev) => {
      const request = this.findRequest(ev.payload.requestId);
      const side = request?.side ?? 'buy';
      this.orders.onFill(ev.payload);
      const pnl = this.portfolio.onFillDirected(ev.payload, side);
      this.cfg.strategy.onFillEvent(ev.payload);
      this.audit.write({ eventId: ev.payload.fillId, ts: ev.payload.tsExchange, runId: ev.ctx.runId, kind: 'fill', payload: ev.payload });
      this.publish('pnl', pnl, ev.payload.tsExchange);
      this.audit.write({ eventId: this.ids.next(), ts: ev.payload.tsExchange, runId: ev.ctx.runId, kind: 'pnl', payload: pnl });
      this.maybeEmitSnapshot();
    });

    // Order lifecycle events — route to order manager and, if present, to strategy.
    this.bus.subscribe<OrderEvent>('order', (ev) => {
      this.orders.onOrderEvent(ev.payload);
      this.cfg.strategy.onOrderEvent?.(ev.payload);
      this.audit.write({ eventId: this.ids.next(), ts: ev.payload.ts, runId: ev.ctx.runId, kind: 'order', payload: ev.payload });
    });

    // Feed → bus.
    this.cfg.feed.onEvent((ev) => {
      this.publish<MarketEvent>('market', ev, ev.tsExchange);
    });
    // Adapter → bus.
    this.cfg.adapter.onFill((fill) => {
      this.publish<FillEvent>('fill', fill, fill.tsExchange);
    });
    this.cfg.adapter.onOrderEvent((oev) => {
      this.publish<OrderEvent>('order', oev, oev.ts);
    });
  }

  private buildStrategyContext(): StrategyContext {
    return {
      clock: this.clock,
      ctx: this.cfg.ctx,
      portfolio: () => this.snapshotPortfolio(),
      config: undefined,
      logger: {
        debug: () => {},
        info: () => {},
        warn: () => {},
        error: () => {},
      },
      emit: (intent: OrderIntent) => {
        this.publish<OrderIntent>('intent', intent, intent.tsCreated);
        this.audit.write({ eventId: intent.intentId, ts: intent.tsCreated, runId: intent.ctx.runId, kind: 'intent', payload: intent });
      },
    };
  }

  private snapshotPortfolio() {
    const p = this.portfolio.getPortfolio(this.clock.now());
    return { ...p, ctx: this.cfg.ctx };
  }

  private publish<T>(type: string, payload: T, ts: Timestamp): void {
    const ev: EngineEvent<T> = {
      eventId: this.ids.next(),
      ctx: this.cfg.ctx,
      ts,
      payload,
    };
    this.bus.publish(type, ev);
  }

  private findRequest(requestId: string): OrderRequest | undefined {
    // Linear search through open orders is adequate at v0.1 volumes.
    return this.orders.getOpenOrders().find((r) => r.requestId === requestId);
  }

  private deriveMark(ev: MarketEvent): number | null {
    if (ev.type === 'quote') return (ev.bid + ev.ask) / 2;
    if (ev.type === 'trade') return ev.price;
    if (ev.type === 'candle') return ev.c;
    return null;
  }

  private maybeEmitSnapshot(): void {
    const snap = this.snapshotter.maybeEmit(this.clock.now());
    if (snap === null) return;
    this.publish<PnlSnapshot>('snapshot', snap, this.clock.now());
    this.audit.write({ eventId: this.ids.next(), ts: this.clock.now(), runId: this.cfg.ctx.runId, kind: 'snapshot', payload: snap });
  }

  async run(): Promise<void> {
    if (this.done) throw new Error('Engine already ran; construct a new instance');
    await this.cfg.strategy.init(this.buildStrategyContext());
    await this.cfg.adapter.connect();
    await this.cfg.feed.start();
    // Queue.run() exits naturally when entries are drained and no more are
    // being enqueued (feed has already returned from start(); handlers
    // finish their awaits before the next drain iteration).
    await this.queue.run();
    await this.cfg.feed.stop();
    await this.cfg.adapter.disconnect();
    await this.cfg.strategy.shutdown();
    this.done = true;
  }
}
```

- [ ] **Step 2: Export Engine from the barrel**

Modify `trade-arbiter/packages/engine/src/index.ts`:

```typescript
/**
 * Public surface of @trade-arbiter/engine. Plan 2 exposes the Engine class
 * and the JSONL audit writer (used by Plan 3's CLI to write logs to disk).
 * Helpers like InMemoryEventQueue, DefaultRiskManager, DefaultOrderManager
 * are intentionally not re-exported — callers construct Engine with its
 * dependencies already wired.
 */
export { Engine, type EngineConfig } from './engine.js';
export { JsonlAuditWriter } from './audit-writer.js';
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add trade-arbiter/packages/engine/src/engine.ts trade-arbiter/packages/engine/src/index.ts
git commit -m "feat(engine): Engine orchestrator wires all components"
```

---

## Phase J — Integration test and gate

### Task J1: End-to-end determinism integration test

**Files:**
- Create: `trade-arbiter/packages/engine/test/integration/engine-determinism.test.ts`

- [ ] **Step 1: Write the integration test**

Create `trade-arbiter/packages/engine/test/integration/engine-determinism.test.ts`:

```typescript
/**
 * Plan 2 acceptance gate. Build a fake DataFeed, fake Strategy, fake
 * ExecutionAdapter; push 10 MarketEvents through; verify:
 *   1. A deterministic sequence of bus events is emitted.
 *   2. Two runs with the same inputs produce byte-identical JSONL logs.
 *   3. PnlEvent fires on every FillEvent.
 *   4. PnlSnapshot fires at the configured interval.
 */
import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import type {
  DataFeed,
  ExecutionAdapter,
  FillEvent,
  MarketEvent,
  OrderEvent,
  OrderIntent,
  OrderRequest,
  RunContext,
  Strategy,
  StrategyContext,
} from '@trade-arbiter/core';
import { Engine } from '../../src/index.js';

const ctx: RunContext = {
  runId: '00000000000000000000000000',
  strategyId: 'pipeline-test',
  configHash: 'hash',
  mode: 'backtest_l1',
};

class FakeFeed implements DataFeed {
  readonly venue = 'hyperliquid';
  readonly mode = 'backtest_l1';
  private onEv: ((ev: MarketEvent) => void) | null = null;
  private readonly events: MarketEvent[];

  constructor(events: MarketEvent[]) {
    this.events = events;
  }

  subscribe(): void {}

  onEvent(cb: (ev: MarketEvent) => void): void {
    this.onEv = cb;
  }

  async start(): Promise<void> {
    for (const ev of this.events) {
      this.onEv?.(ev);
    }
  }

  async stop(): Promise<void> {}
}

class FakeAdapter implements ExecutionAdapter {
  readonly venue = 'hyperliquid';
  readonly mode = 'backtest_l1';
  private onF: ((f: FillEvent) => void) | null = null;
  private onOE: ((oe: OrderEvent) => void) | null = null;
  private seq = 0;

  async connect(): Promise<void> {}

  async submit(req: OrderRequest): Promise<{ requestId: string }> {
    this.seq += 1;
    const fill: FillEvent = {
      fillId: `fake-fill-${this.seq}`,
      intentId: req.intentId,
      requestId: req.requestId,
      ctx: req.ctx,
      venue: req.venue,
      symbol: req.symbol,
      tsExchange: req.tsCreated + 1,
      tsReceived: req.tsCreated + 1,
      status: 'filled',
      filledSize: req.sizeApproved,
      remainingSize: 0,
      avgPrice: 100,
      feesPaid: 0,
    };
    this.onF?.(fill);
    return { requestId: req.requestId };
  }

  async cancel(): Promise<void> {}
  onFill(cb: (f: FillEvent) => void): void { this.onF = cb; }
  onOrderEvent(cb: (oe: OrderEvent) => void): void { this.onOE = cb; }
  async disconnect(): Promise<void> {}
}

function pipelineStrategy(openIdx: number, closeIdx: number): Strategy {
  let n = 0;
  let sctx: StrategyContext | null = null;
  return {
    id: 'pipeline-test',
    async init(c: StrategyContext): Promise<void> {
      sctx = c;
    },
    onMarketEvent(ev: MarketEvent): void {
      if (sctx === null) return;
      n += 1;
      if (n === openIdx) {
        const intent: OrderIntent = {
          intentId: 'open-1',
          ctx,
          tsCreated: ev.tsExchange,
          venue: 'hyperliquid',
          symbol: 'HYPE-PERP',
          side: 'buy',
          sizeRequested: 1,
          timeInForce: 'GTC',
          reason: 'open',
        };
        sctx.emit(intent);
      }
      if (n === closeIdx) {
        const intent: OrderIntent = {
          intentId: 'close-1',
          ctx,
          tsCreated: ev.tsExchange,
          venue: 'hyperliquid',
          symbol: 'HYPE-PERP',
          side: 'sell',
          sizeRequested: 1,
          timeInForce: 'GTC',
          reason: 'close',
        };
        sctx.emit(intent);
      }
    },
    onFillEvent(): void {
      // no-op; pipeline strategy doesn't react to fills
    },
    async shutdown(): Promise<void> {},
  };
}

function makeEvents(count: number): MarketEvent[] {
  const out: MarketEvent[] = [];
  for (let i = 0; i < count; i++) {
    out.push({
      type: 'quote',
      venue: 'hyperliquid',
      symbol: 'HYPE-PERP',
      tsExchange: (i + 1) * 10,
      tsReceived: (i + 1) * 10,
      bid: 100,
      ask: 100.1,
      bidSize: 10,
      askSize: 10,
    });
  }
  return out;
}

async function runOnce(): Promise<string> {
  const engine = new Engine({
    ctx,
    initialCash: 1000,
    currency: 'USDC',
    pnlSnapshotIntervalMs: 50,
    rules: [],
    feed: new FakeFeed(makeEvents(10)),
    strategy: pipelineStrategy(3, 7),
    adapter: new FakeAdapter(),
  });
  await engine.run();
  return engine.audit.flushToString();
}

test('Plan 2 acceptance: two runs produce byte-identical JSONL', async () => {
  const a = await runOnce();
  const b = await runOnce();
  assert.equal(a, b);
  assert.ok(a.length > 0);
});

test('Plan 2 acceptance: JSONL contains 2 fills, 2 pnl records, ≥1 snapshot', async () => {
  const log = await runOnce();
  const lines = log.split('\n').filter((l) => l.length > 0);
  const kinds = lines.map((l) => (JSON.parse(l).kind as string));
  const count = (k: string) => kinds.filter((x) => x === k).length;
  assert.equal(count('fill'), 2, `fills: ${count('fill')}`);
  assert.equal(count('pnl'), 2, `pnls: ${count('pnl')}`);
  assert.ok(count('snapshot') >= 1, `snapshots: ${count('snapshot')}`);
});

test('Plan 2 acceptance: every market event appears in the audit log', async () => {
  const log = await runOnce();
  const lines = log.split('\n').filter((l) => l.length > 0);
  const markets = lines.filter((l) => JSON.parse(l).kind === 'market');
  assert.equal(markets.length, 10);
});
```

- [ ] **Step 2: Run the integration test**

```bash
npm test --workspace @trade-arbiter/engine
```
Expected: PASS. The three integration assertions plus all prior unit tests.

- [ ] **Step 3: Commit**

```bash
git add trade-arbiter/packages/engine/test/integration/engine-determinism.test.ts
git commit -m "test(engine): end-to-end determinism integration gate"
```

---

### Task J2: Acceptance criteria check + CI green

**Files:** none (read-only verification)

- [ ] **Step 1: Run full CI from workspace root**

```bash
cd trade-arbiter
npm run ci
```
Expected: PASS. Every workspace typechecks; every test passes.

- [ ] **Step 2: Walk the spec's acceptance criteria**

Cross-check each Plan 2 acceptance criterion in
`docs/superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md`:

| # | Criterion | Proof |
|---|-----------|-------|
| 1 | Engine test pushes 10 MarketEvents with fakes, observes deterministic output | `engine-determinism.test.ts` run #1 test |
| 2 | Two runs same inputs → byte-identical JSONL | `engine-determinism.test.ts` byte-identical test |
| 3 | PnlEvent on every FillEvent | same integration test, kind counts |
| 4 | PnlSnapshot on engine-clock interval | same integration test, snapshot count ≥ 1 |
| 5 | PnlEvent/PnlSnapshot/AuditRecord/AuditKind in `public-surface.test.ts` | A1–A3 |
| 6 | Determinism contract: counter IDs, sorted-key JSONL, fixed-precision floats | C1, C2, C3 unit tests + integration byte-match |
| 7 | `npm run ci` exits 0 at workspace root | step 1 above |
| 8 | `[should]` engine has zero runtime deps beyond core | `packages/engine/package.json` dependencies block |

- [ ] **Step 3: Commit the roadmap update**

Update `docs/roadmap.md` to mark Plan 2 as shipped and link to this plan + the commit range.

```bash
git add docs/roadmap.md
git commit -m "docs: mark Plan 2 (engine runtime) as shipped"
```

- [ ] **Step 4: Declare done**

Plan 2 complete. Milestone v0.1 pending — reached at the end of Plan 3.

---

## Self-review notes

Performed after the plan was fully drafted:

- **Spec coverage.** Every item in the spec's "Plan 2 shape — Engine runtime + observability" section maps to at least one task. PnlEvent / PnlSnapshot / AuditRecord additions → A1, A2, A3. EventQueue / EventBus → E1, E2. RiskManager / OrderManager / Portfolio / PnlSnapshotter / AuditWriter → F1, F2, F3, G1, H1. Clock → D1. Engine orchestrator → I1. Integration test → J1. Determinism contract coverage (sorted-key JSONL, fixed-precision floats, counter IDs) → C1, C2, C3.
- **Placeholders.** None — every step has exact code or exact commands.
- **Type consistency.** `IdGen` is defined in `id-gen.ts` (C3) and referenced in F1 (`RiskManager` constructor) and I1 (`Engine`). `InMemoryEventQueue.onDrain()` is defined in E1 and consumed in E2. `PortfolioUpdater.onFillDirected(fill, side)` is defined in F3 and consumed in I1. `JsonlAuditWriter.write(record)` signature matches I1's usage. Spot-checked.
- **Known simplification.** The `RiskManager.onFill` and `OrderManager.tickTimeouts` are intentional no-ops in Plan 2, documented inline and in the task tests. They are wired to the right interface so Plan 7 can fill them in without re-plumbing.
- **Fee handling.** Plan 2's PortfolioUpdater subtracts `feesPaid` from realizedDelta on every fill, including opening fills (per the spec's PnL semantics section, fees realize immediately). The backtest adapter in Plan 3 sets `feesPaid = 0`, so Plan 2 tests exercise both branches.
