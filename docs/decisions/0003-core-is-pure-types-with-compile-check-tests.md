# 0003. `@trade-arbiter/core` is a pure-types package validated by compile-check tests

- **Status:** accepted
- **Date:** 2026-04-14
- **Deciders:** afk-bro
- **Related:**
  - [`../superpowers/specs/2026-04-12-trade-arbiter-design.md`](../superpowers/specs/2026-04-12-trade-arbiter-design.md) — Section 4 (Core Contracts)
  - [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md)
  - [`0002-no-build-tsx-and-node-test-runner.md`](0002-no-build-tsx-and-node-test-runner.md)
  - [`0004-opaque-string-aliases-and-as-const-enums.md`](0004-opaque-string-aliases-and-as-const-enums.md)

## Context

Section 4 of the design spec defines the interfaces that every later package (engine, adapters, strategies, risk, admin) implements or consumes. These are the load-bearing API of the system — unintended drift in any one of them cascades into every caller and silently breaks contracts at the boundary. We want a fast, visible signal when a contract shape changes accidentally. And Plan 1 has zero runtime behavior by design: the actual engine, the queue, the risk composition loop, everything behavioral — all of it lives in Plan 2 and later.

## Decision

We will ship `@trade-arbiter/core` as a types-only package (plus a small set of `as const` runtime arrays for closed enumerations — see [ADR 0004](0004-opaque-string-aliases-and-as-const-enums.md)) and validate contract shapes with compile-check tests: each test constructs a literal value of the relevant type, then does `void literal;`. The assertion is that `tsc` successfully type-checks the literal. Shape drift manifests as a `npm run typecheck` failure, not a runtime assertion failure.

## Consequences

- **Easier:** Contract drift cannot merge without a deliberate edit to both the interface and the literal in its test. `npm run typecheck` is effectively the test suite for core. Zero runtime dependencies in the contract layer, so any consumer can depend on `@trade-arbiter/core` without pulling anything transitive.
- **Harder:** The test files look strange — a literal followed by `void x;` — and need a short header comment explaining the compile-check intent. A passing `node --test` run for core is not the meaningful signal; the `tsc` pass is. Invariants that are not expressible in the type system (e.g., "`OrderIntent.quantity` is positive") cannot be enforced here; they belong in a runtime validator at the boundary.
- **Traded away:** Runtime behavior tests inside core (there is no behavior to test). Schema-level runtime validation of the contracts (see Alternatives).

The "tests look empty" surprise is real and worth a one-paragraph explanation at the top of each test file, which we already do.

## Alternatives considered

- **Types-only with no tests at all** — rejected because it loses the "shape drift shows up as a red test" signal, which is useful during code review and catches accidental interface renames that nothing else would flag.
- **Runtime schema validation (e.g., zod) inside core** — rejected because it couples the contract layer to a runtime dependency, forces every consumer to pay the validation cost, and muddles the "core is the interface, engine is the implementation" split.
- **Contract tests live in each consumer package instead of in core** — rejected because the contract is not owned by any single consumer; a single source of truth is more maintainable and keeps drift visible in one place.
