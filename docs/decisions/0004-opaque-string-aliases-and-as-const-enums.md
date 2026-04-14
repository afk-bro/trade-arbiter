# 0004. Opaque string aliases for identifiers, `as const satisfies` arrays for enumerations

- **Status:** accepted
- **Date:** 2026-04-14
- **Deciders:** afk-bro
- **Related:**
  - [`../superpowers/specs/2026-04-12-trade-arbiter-design.md`](../superpowers/specs/2026-04-12-trade-arbiter-design.md) — Section 4.1 (Primitives)
  - [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md)
  - [`0003-core-is-pure-types-with-compile-check-tests.md`](0003-core-is-pure-types-with-compile-check-tests.md)

## Context

`@trade-arbiter/core` has to encode two closely related kinds of primitive:

1. **Identifier and hash types** — `RunId`, `StrategyId`, `ConfigHash`, `Symbol`, `Timestamp`. All are strings at runtime. The question is whether the type system should enforce that a given string is a valid instance (branded types, constructor validators) or whether format validation should live at system boundaries.
2. **Closed enumerations** — `Mode`, `Venue`, `Side`, `OutcomeToken`, `OrderStatus`, `FillStatus`, `MarketEventType`. Each is a finite set whose members need to be both typed *and* enumerable at runtime (for config validation, dropdown population, completeness checks).

There are two reasonable encodings for each kind, and they interact.

## Decision

We will use:

1. **Plain string type aliases** (`type RunId = string`, `type ConfigHash = string`, etc.) for every identifier and hash type. Format validation (ULID shape, sha256 length, symbol regex, etc.) happens at system boundaries — engine init, config load, admin command parsing — not in the type system.
2. **`as const satisfies readonly T[]` runtime arrays** for closed enumerations, paired with a union type for the variants. Example: `export const MODES = ['backtest_l1', 'backtest_l2', 'paper', 'live'] as const satisfies readonly Mode[]`.

We explicitly accept that adding a new `Mode` variant without also appending it to `MODES` will compile silently. New enumeration variants are deliberate reviewed edits, so the risk is bounded.

The `Symbol` type intentionally shadows the global `Symbol` constructor at the type level. Consumers that need both do `import type { Symbol as InstrumentSymbol } from '@trade-arbiter/core'`. This is the project standard and is documented in `primitives.ts`.

## Consequences

- **Easier:** No constructor ceremony at call sites. Adapters, strategies, and test helpers pass strings freely. JSDoc stays short — no "this is not enforced" disclaimers, since TypeScript engineers already know the limitations of string aliases and `as const satisfies`. The type layer stays flat and readable.
- **Harder:** You cannot tell, from the type alone, whether a `RunId` string is a valid ULID — you must trust that whoever handed it to you went through a boundary validator. Adding a `Mode` or `Venue` variant requires remembering to update both the union and the runtime array; this is caught in review, not by the compiler. Anyone doing `import { Symbol } from '@trade-arbiter/core'` without aliasing gets a name clash surprise.
- **Traded away:** Compile-time proof that identifiers were constructed through a validator. Compile-time exhaustiveness enforcement on the enumeration arrays.

This ADR exists in part so that future reviewers do not re-litigate these choices — they are deliberate, and the rationale is captured here rather than re-explained on every PR.

## Alternatives considered

- **Branded types (`Opaque<string, 'RunId'>`)** — rejected because every adapter, strategy, and test helper would need constructor calls for values already known to be valid at the boundary; the ceremony outweighs the benefit for a project with a single maintainer and boundary-validated inputs.
- **TypeScript `enum`** — rejected for its well-known footguns, poor interaction with `verbatimModuleSyntax`, and awkward composition with union types.
- **zod schemas as the source of truth for enumerations** — rejected because it pulls a runtime dependency into the contract layer (see [ADR 0003](0003-core-is-pure-types-with-compile-check-tests.md)) and degrades "go to definition" in editors.
- **Rename `Symbol` to `Ticker` or `InstrumentSymbol`** — rejected because the domain language is "symbol"; the alias-on-import workaround is cheap and preserves the vocabulary used everywhere else in the project.
