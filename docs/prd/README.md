# Product Requirement Documents

> The "what" and "why" before the "how". Stable, slow-moving.

## Relationship to `docs/superpowers/specs/`

The `docs/superpowers/specs/` tree is where the `superpowers:brainstorming` skill drops its design artifacts. Those files are the source of truth for what was decided. **This directory does not duplicate them.** It holds:

1. **The PRD index** (this README) — points at the canonical specs in `superpowers/specs/`
2. **Per-feature PRDs** — narrow PRDs written ahead of a plan when scope needs to be locked down independently of a brainstorm session

## When to write a new PRD here

- A feature ships in a single plan and doesn't warrant a full brainstorm
- A stakeholder needs a one-pager before any design work begins
- A retro PRD is needed to document an undocumented existing feature

## Format

Use [`0000-template.md`](0000-template.md). Title format: `NNNN-kebab-case-title.md`.

## Index

Newest first.

- [0001-core-contracts-and-monorepo-scaffold.md](0001-core-contracts-and-monorepo-scaffold.md) — Retro PRD for Plan 1: types-only `@trade-arbiter/core` package, npm-workspaces monorepo, green CI. Shipped.
- [trade-arbiter design spec](../superpowers/specs/2026-04-12-trade-arbiter-design.md) — foundational design (lives in `superpowers/specs/`, not duplicated here).
