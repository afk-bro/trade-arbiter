# 0001. Use npm workspaces for the trade-arbiter monorepo

- **Status:** accepted
- **Date:** 2026-04-14
- **Deciders:** afk-bro
- **Related:**
  - [`../superpowers/specs/2026-04-12-trade-arbiter-design.md`](../superpowers/specs/2026-04-12-trade-arbiter-design.md) — design spec, Section 10 (project structure)
  - [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md) — Plan 1, which ships the monorepo scaffold

## Context

Plan 1 stands up a multi-package layout: `@trade-arbiter/core` now, with engine, adapters, strategies, admin, and dashboard packages planned for later plans. Packages share tooling (tsconfig, TypeScript compiler, test runner) and will depend on each other internally. The project has one active maintainer and intentionally minimal CI.

Three realistic options: npm workspaces, pnpm workspaces, or a task-graph tool (Turborepo / Nx / moon) layered over one of them.

## Decision

We will use npm workspaces to manage the `trade-arbiter/` monorepo — a plain `package.json` at the workspace root listing `packages/*`, with `npm install` handling linking.

## Consequences

- **Easier:** Nothing to install beyond Node itself. CI is a single `npm ci && npm run ci`. Any contributor who can run Node can run the repo. No package-manager lockfile arguments.
- **Harder:** No built-in task graph, no incremental / remote caching, no topological parallelism across packages. At larger scales this shows up as slower CI and more hand-written scripts.
- **Traded away:** Advanced dependency graph features (affected-package detection, task pipelines) and the stricter hoisting that pnpm provides.

The decision is cheap to revisit: adopting Turborepo or pnpm later is a mechanical migration, not a redesign. We reassess when the repo has ~5+ packages or CI starts to feel slow.

## Alternatives considered

- **pnpm workspaces** — rejected because it adds a non-default tool and stricter hoisting matters little at current scale; revisit if phantom-dependency bugs appear.
- **Turborepo / Nx / moon** — rejected as overkill for a handful of packages and a single-maintainer team; the task-graph benefits only show up at larger scales.
- **Single package, no monorepo** — rejected because it couples the public contract surface (`@trade-arbiter/core`) to the engine and adapter implementations, and forces circular-dep contortions once strategies and adapters arrive.
