# Architecture Decision Records (ADRs)

> Append-only log of architecturally significant decisions.

## When to write one

- The decision is hard to reverse
- Two reasonable engineers could pick differently
- The reasoning will be lost in 6 months without writing it down
- A previous decision is being superseded

## Format

Use [`0000-template.md`](0000-template.md) as a starting point. Number ADRs sequentially and never re-number. Title format: `NNNN-kebab-case-title.md`.

ADR status transitions: `proposed` → `accepted` → (later) `superseded by NNNN` or `deprecated`. Never edit the `Decision` and `Consequences` sections of an accepted ADR — write a new ADR that supersedes it.

## Index

Newest first.

- [0004-opaque-string-aliases-and-as-const-enums.md](0004-opaque-string-aliases-and-as-const-enums.md) — Plain string aliases for IDs, `as const satisfies readonly T[]` for enumerations; format validation at boundaries, not in the type system.
- [0003-core-is-pure-types-with-compile-check-tests.md](0003-core-is-pure-types-with-compile-check-tests.md) — `@trade-arbiter/core` ships zero runtime behavior; contracts are validated by literal-construction tests that fail `tsc` on drift.
- [0002-no-build-tsx-and-node-test-runner.md](0002-no-build-tsx-and-node-test-runner.md) — Run TypeScript source directly via `tsx` and test via `node --test`; no emit, no bundler, no Vitest.
- [0001-monorepo-npm-workspaces.md](0001-monorepo-npm-workspaces.md) — Use npm workspaces over pnpm / Turborepo / single-package; minimal tooling now, easy to revisit.
