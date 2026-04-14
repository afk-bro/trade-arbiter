# 0002. No build step: tsx loader plus Node's native test runner

- **Status:** accepted
- **Date:** 2026-04-14
- **Deciders:** afk-bro
- **Related:**
  - [`0001-monorepo-npm-workspaces.md`](0001-monorepo-npm-workspaces.md)
  - [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md)

## Context

Plan 1 needs a TypeScript execution model and a test framework. The tradeoff space is (a) whether to emit JS via `tsc` before running, and (b) which test runner to use. Constraints: Node 22+ ships a stable native test runner (`node --test`) and has first-class ESM + loader support; Plan 1 has zero runtime behavior, so tests are mostly literal-construction compile checks; the team is one maintainer, so every tool added is a maintenance burden.

## Decision

We will run TypeScript source directly under Node via the `tsx` loader and use `node --test` as the test framework. No `tsc` emit, no bundler, no Vitest / Jest in Plan 1. Source files use `.js` extensions in import paths so NodeNext resolves `.ts` at type-check time and `tsx` resolves `.ts` at runtime.

## Consequences

- **Easier:** Zero build step. `node --test` points at `src/` directly, so the edit-test loop is one hop. `tsx` is one dev dependency. `package.json` scripts are three lines.
- **Harder:** `node --test` has fewer ergonomics than Vitest (no watch mode, no snapshot matchers, fewer parallelism knobs). Some editor integrations assume a `dist/` directory. Publishable distribution artifacts, when we need them, will require a real build step added in a later plan.
- **Traded away:** Snapshot tests, rich matcher DX, pre-compiled packages. These can come back as deliberate additions if a package ever needs to publish to a registry or ship to a non-tsx consumer.

We revisit if (a) any package needs to publish compiled output, or (b) `node --test` gets in the way of writing the tests we actually want.

## Alternatives considered

- **`tsc` emit to `dist/` + run compiled JS** — rejected because it doubles the edit loop and introduces a generated directory to manage, with no payoff while there is no runtime code and nothing to publish.
- **Vitest** — rejected because it brings a large dependency tree for DX wins that Plan 1's compile-check tests do not need; reconsider when we have real behavior tests and want watch mode.
- **Jest** — rejected for slow ESM handling and heavier config than Vitest.
- **Bun test** — rejected because adopting Bun adds a second runtime to the project and the ecosystem risk is not warranted for a marginal DX gain.
