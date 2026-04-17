# Trade Arbiter — Roadmap

> Plan-by-plan delivery schedule. Update when a plan starts, ships, or slips.
>
> Structure follows the re-planned roadmap in [`superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md`](superpowers/specs/2026-04-17-roadmap-revision-and-backtest-vertical-slice-design.md), which integrates the 8 improvements from [`polymarket-bot-comparison.md`](polymarket-bot-comparison.md).

## Status legend

- `shipped` — merged to the default branch
- `in flight` — PR open or branch active
- `queued` — planned, not started
- `frozen` — deferred indefinitely

## Plans

| # | Title | Status | Completed | Plan doc | Link |
|---|-------|--------|-----------|----------|------|
| 1 | Core contracts and scaffold | shipped | 2026-04-13 | [`superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md`](superpowers/plans/2026-04-13-01-core-contracts-and-scaffold.md) | [PR #1](https://github.com/afk-bro/trade-arbiter/pull/1) |
| 2 | Engine runtime + observability | in flight | — | [`superpowers/plans/2026-04-17-02-engine-runtime-and-observability.md`](superpowers/plans/2026-04-17-02-engine-runtime-and-observability.md) | — |
| 3 | Synthetic backtest vertical slice | queued | — | — | — |
| 4 | First real strategy (MA crossover) | queued | — | — | — |
| 5 | Hyperliquid recorded-data adapter | queued | — | — | — |
| 6 | Persistence (SQLite + Parquet) | queued | — | — | — |
| 7 | Admin service + kill switch + safe defaults | queued | — | — | — |
| 8 | Prediction-market contract extensions | queued | — | — | — |
| 9 | Live arming | queued | — | — | — |
| 10 | Python analytics sidecar | queued | — | — | — |

<!-- Add rows as plans are written. Plan numbers are stable — never renumber. -->

## Milestones

- **v0.1 — green end-to-end backtest.** Reached at the end of Plan 3. Synthetic data → deterministic bus → JSONL audit → PnL. Validates the engine foundations.
- **v0.2 — replayable runs with persistence.** Reached at the end of Plan 6. SQLite + Parquet back the audit stream.
- **v0.3 — live trading gated.** Reached at the end of Plan 9. `arm_live` flipped; Hyperliquid orders flow.
- **v1.0 — analytics sidecar.** Reached at the end of Plan 10.

## Decision log pointer

<!--
Roadmap changes (re-orderings, freezes, scope cuts) get an ADR in `decisions/`.
Link the latest few here.
-->
