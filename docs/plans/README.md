# Implementation Plans

> The "how". Step-by-step execution plans, one per shipped or queued unit of work.

## Relationship to `docs/superpowers/plans/`

The `docs/superpowers/plans/` tree is where the `superpowers:writing-plans` skill drops its plan documents. Those files are the source of truth for the actual step-by-step task lists. **This directory does not duplicate them.** It holds:

1. **The plan index** (this README) — points at the canonical plan files in `superpowers/plans/`
2. **Cross-plan notes** — anything that spans multiple plans, like a sequencing diagram or shared scaffolding doc, that doesn't belong inside any single plan file

Plan numbering is **stable forever**. Once Plan 5 is allocated, it stays Plan 5 even if it gets reordered, paused, or dropped. Re-numbering breaks every existing reference.

## Index

<!-- Newest plan number first. Mirror the roadmap.md status column. -->

| # | Title | Status | Plan doc |
|---|-------|--------|----------|
| 1 | Core contracts and scaffold | in flight | [`../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](../superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md) |

<!-- Add rows as plans are written. -->

## See also

- [../roadmap.md](../roadmap.md) — high-level delivery schedule with PR links
- [../decisions/](../decisions/) — ADRs that re-order or scope-cut plans
