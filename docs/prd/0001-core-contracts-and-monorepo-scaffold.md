# 0001. Core contracts and monorepo scaffold

- **Status:** shipped
- **Owner:** afk-bro
- **Date:** 2026-04-14
- **Related:**
  - [`../superpowers/specs/2026-04-12-trade-arbiter-design.md`](../superpowers/specs/2026-04-12-trade-arbiter-design.md) — foundational design spec, Section 4 is the source of truth for contract shapes
  - [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md) — Plan 1 implementation plan (15 tasks)
  - [`../decisions/0001-monorepo-npm-workspaces.md`](../decisions/0001-monorepo-npm-workspaces.md)
  - [`../decisions/0002-no-build-tsx-and-node-test-runner.md`](../decisions/0002-no-build-tsx-and-node-test-runner.md)
  - [`../decisions/0003-core-is-pure-types-with-compile-check-tests.md`](../decisions/0003-core-is-pure-types-with-compile-check-tests.md)
  - [`../decisions/0004-opaque-string-aliases-and-as-const-enums.md`](../decisions/0004-opaque-string-aliases-and-as-const-enums.md)

> Retro PRD written after Plan 1 shipped (PR #1). Captures the scope, acceptance criteria, and risks that guided the work so future plans have a single-page reference for what Plan 1 was and was not.

## Problem

Before Plan 1, the project had a design spec (Section 4 defined ~30 interfaces that every later package would implement or consume) and nothing else — no monorepo, no package, no CI, no importable types. Any work on the engine, adapters, strategies, or risk manager would either fork its own copy of the contracts or block on somebody stamping them out. Contract drift would not surface until a later package tried to wire something up, which is the most expensive place to catch it.

The operator (me) needs a foundation that: (a) makes the Section 4 contracts importable from one place, (b) fails loudly when any contract shape changes accidentally, and (c) is ready to host the engine, adapters, and strategy packages in later plans without a restructure.

## Goals

- **G1.** Every interface, type alias, and runtime enumeration from Section 4 of the design spec is exported from `@trade-arbiter/core` and importable by future workspace packages.
- **G2.** Accidental contract drift (rename, removed field, changed shape) produces a failing `npm run ci` — no silent downstream breakage.
- **G3.** The repo layout is structurally ready to host later packages (engine, adapters, strategies, admin, dashboard) as additional workspaces without restructuring the root.
- **G4.** `@trade-arbiter/core` has zero runtime dependencies so any consumer can import it without paying for transitive weight.
- **G5.** A green CI pipeline runs on every PR and push to `master`, gating merges.

## Non-goals

Scope is strictly the contract layer and the scaffolding around it. The following are explicitly out of Plan 1 and deferred to later plans:

- Engine event-loop implementation (Plan 2)
- Data flow wiring between engine, risk, order manager, adapters (Plan 2)
- Persistence schemas — SQLite, Parquet, log files (Plan 2)
- Real strategy config loader (Plan 2/3; Plan 1 only defines the context shape)
- `LiveArmRule` rule *implementation* (Plan 2; Plan 1 only ships the `RiskRule` interface it satisfies)
- `AdminService` runtime implementation (Plan 6; Plan 1 ships only the types in `admin.ts`)
- Runtime validators / schema libraries — format validation lives at adapter boundaries, not in core (see [ADR 0004](../decisions/0004-opaque-string-aliases-and-as-const-enums.md))
- ESLint / Prettier / bundler — deferred until there is runtime code to lint
- Publishable distribution artifacts (no `tsc` emit; see [ADR 0002](../decisions/0002-no-build-tsx-and-node-test-runner.md))
- Dashboard, replay tools, backtest harness, venue adapters

## Users / personas

- **Operator (afk-bro)** — runs the bot, writes strategies, responds when things break. Plan 1's deliverable lands in their lap directly.
- **Downstream plan author (future self)** — the next person to open a plan file, who needs the Section 4 contracts to be stable, discoverable from one import, and enforced by CI.
- **Reviewer** — reads PRs and needs a single place to point at when litigating "does this match the spec?". The `public-surface.test.ts` and compile-check tests serve that role; this PRD pins the expectation.

## Acceptance criteria

Numbered and tagged `[must]`, `[should]`, or `[nice]`. Each item is independently verifiable against the shipped repo.

1. **[must]** `npm run ci` (equivalent to `npm run typecheck && npm run test`) exits 0 at the workspace root on a clean clone.
2. **[must]** `@trade-arbiter/core` exports — as named exports from its barrel — every interface, type alias, discriminated-union member, and runtime constant defined in Section 4 of the design spec. Completeness is enforced by `packages/core/test/public-surface.test.ts`, which imports every exported name.
3. **[must]** Renaming or removing any required field on a core contract causes at least one compile-check test to fail `npm run typecheck`. This is the drift signal described in [ADR 0003](../decisions/0003-core-is-pure-types-with-compile-check-tests.md).
4. **[must]** `packages/core/package.json` lists zero entries under `dependencies`. Only `devDependencies` (TypeScript, tsx, @types/node) are permitted.
5. **[must]** The TypeScript compiler runs in `strict` mode with `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`, and `verbatimModuleSyntax` all enabled via `tsconfig.base.json`.
6. **[must]** Module resolution uses NodeNext and source files import siblings with `.js` extensions (resolved to `.ts` at typecheck time and at runtime by `tsx`).
7. **[must]** A GitHub Actions workflow at `.github/workflows/ci.yml` runs `npm ci && npm run ci` on every pull request and push to `master`, and merges are gated on it passing.
8. **[must]** Every contract file under `packages/core/src/` has a matching `test/*.test.ts` compile-check test that constructs a literal of each exported type.
9. **[should]** Contract files are split by responsibility (primitives, context, events, intents, portfolio, strategy, adapter, risk, bus, order-manager, admin) rather than one monolithic `types.ts` — so edits remain local and reviewable.
10. **[should]** Runtime constants (`MODES`, `VENUES`, `MARKET_EVENT_TYPES`, `ORDER_STATUSES`, `FILL_STATUSES`) use the `as const satisfies readonly T[]` pattern and each has a runtime-assertion test over its exact contents.
11. **[should]** Adding a new workspace package later (`packages/engine/`, `packages/adapters/*`) requires only a new `packages/<name>/package.json` and an entry under the root workspaces array — no restructuring of tooling, tsconfig, or CI.
12. **[nice]** The full CI run (install + typecheck + test) completes in under 60 seconds on a cold GitHub runner, so the feedback loop on PRs stays tight.

## Risks

Retro-framed: these are known quirks of Plan 1's design that later plans must account for. Each has an owner (which plan or boundary handles it) and a mitigation.

| # | Risk | Mitigation | Owner |
|---|------|------------|-------|
| R1 | Opaque string aliases (`RunId`, `ConfigHash`, `Symbol`) let any string satisfy the type — invalid ULIDs, wrong-length hashes, or empty symbols can propagate unseen. | Boundary validation at config load, engine init, and adapter ingress. Failure mode is a rejected start, not a silent bad run. Rationale is locked in [ADR 0004](../decisions/0004-opaque-string-aliases-and-as-const-enums.md). | Plan 2 (config loader), Plan 2+ (adapters) |
| R2 | Adding a new `Mode` or `Venue` union variant without appending to `MODES`/`VENUES` compiles silently because `as const satisfies` does not enforce exhaustiveness. | Reviewer discipline; variants are rare and deliberate. Accepted risk, [ADR 0004](../decisions/0004-opaque-string-aliases-and-as-const-enums.md). | Reviewer on any future PR touching primitives.ts |
| R3 | Compile-check tests pass trivially at runtime (`void intent;`). A reader could mistake a green `node --test` run for meaningful behavior coverage of core. | Each test file has a short header comment explaining the compile-check intent; [ADR 0003](../decisions/0003-core-is-pure-types-with-compile-check-tests.md) documents the pattern. The real signal is `npm run typecheck`. | Docs + ADR 0003 |
| R4 | `tsx` is a single point of failure for the entire test suite — if it breaks on a new Node version, every test stops running. | `tsx` is widely used and actively maintained; fallback is a mechanical revert to `tsc` emit + compiled test run. Not worth preempting. | Reassess if tsx stalls |
| R5 | No publishable distribution artifacts exist. `@trade-arbiter/core` cannot be `npm publish`ed today. | Intentional; no consumer needs it yet. When one does, a later plan adds a build step. [ADR 0002](../decisions/0002-no-build-tsx-and-node-test-runner.md) flags this. | Whatever plan first needs to publish |
| R6 | `Symbol` type shadows the global `Symbol` constructor at the type level. A consumer doing `import { Symbol } from '@trade-arbiter/core'` hits a name clash surprise. | Alias-on-import pattern (`import type { Symbol as InstrumentSymbol }`) is documented in `primitives.ts` and [ADR 0004](../decisions/0004-opaque-string-aliases-and-as-const-enums.md). | Documentation |
| R7 | If `public-surface.test.ts` is incomplete — i.e., it misses an export — Plan 1 could ship with a silent gap in the Section 4 contract surface. | `public-surface.test.ts` imports every name and any later package depending on `@trade-arbiter/core` will trip on a missing export. Plan 2 is the natural backstop. | Plan 2 integration work |
| R8 | The monorepo uses npm workspaces, which lacks a task graph. As packages multiply, cross-package rebuilds may become slow or order-sensitive. | Reassessed at ~5+ packages, per [ADR 0001](../decisions/0001-monorepo-npm-workspaces.md). Migration to pnpm or Turborepo is mechanical. | Future scale review |

## Shipped

Plan 1 merged as PR #1 on `master`. The ADR set (PR #4) documents the non-obvious decisions. The component inventory diagram in [`../architecture.md`](../architecture.md) shows where the core contracts sit in the overall system map.
