# Trade Arbiter — Overview

> Trade Arbiter is an event-driven trading research and execution system designed to make strategy quality falsifiable.
>
> The system enforces strict constraints on data flow, execution behavior, and testability so that backtest results cannot hide structural weaknesses.
>
> This repository contains the full system design, contracts, and implementation.

## Status

**Plan 1 — Core contracts and scaffold**

- **Status:** Shipped
- **Completed:** 2026-04-13
- **Link:** [PR #1](https://github.com/afk-bro/trade-arbiter/pull/1)

`@trade-arbiter/core` exports the full type surface for primitives, events, intents, requests, fills, portfolio, risk, admin, and the contract interfaces (Strategy, RiskRule, ExecutionAdapter, DataFeed, OrderManager, EventBus, AdminService, AdminTransport). It is a contracts-only package with zero runtime dependencies and zero behavior — every "test" is a TypeScript compile-shape check that locks the public surface against silent drift.

**Next:** Plan 2 — Engine runtime. Wires the EventQueue, EventBus, and dispatcher loop behind the contracts that Plan 1 locked down.

Authoritative plan-by-plan status lives in [roadmap.md](roadmap.md).

## Goals

The project exists to produce these outcomes. Each is load-bearing — drop any of them and the system stops being trustworthy.

- **Backtest → paper → live parity by construction.** The same strategy code produces the same `OrderIntent` given the same observable inputs across `backtest_l1`, `backtest_l2`, `paper`, and `live`. Execution outcomes may differ; intents must not. A backtest result that doesn't reproduce in paper is a structural bug, not a tuning issue.
- **An unbypassable risk layer.** Every `OrderIntent` flows through the risk manager before becoming an `OrderRequest`. No execution adapter accepts an order that didn't come from risk; no strategy can emit anything other than an intent. The kill switch is owned by exactly one component and propagates through the same event bus everything else uses.
- **A deterministic, replayable event loop.** All events drain through one ordered queue, with timestamps drawn from an injected clock rather than `Date.now()`. Given the same recorded market log and the same config hash, two replays produce byte-identical fills.
- **Operator trust before real capital.** Live trading is gated behind explicit arming. Before that gate is reached, the operator must have a backtest pipeline they actually believe — recorded market data, full audit trail, structured trade ledger, and a research surface for after-the-fact analysis.
- **Multi-venue and multi-strategy from day one.** The contracts assume parallel runs across venues (Polymarket, Kalshi, Binance, Hyperliquid) and concurrent strategies in one process. Single-venue is a special case, not the design center.

## Non-goals

These are scope fences the project intentionally maintains — each one is a deliberate trade, not a value judgment about projects that take the other path.

- **Trade Arbiter is not a public framework.** It is a private monorepo. There is no `npm publish`, no semver discipline for external consumers, no plugin marketplace. Internal stability matters; external API stability does not.
- **It is not a low-latency / HFT system.** Targets are millisecond-class, not microsecond-class. Strategies that need sub-millisecond decision loops are out of scope.
- **It is not a multi-tenant or multi-operator service.** One operator runs the engine on one machine (or one container stack). The only access control is Unix socket file permissions on the admin transport.
- **The UI is not a load-bearing component.** The engine is the system of record; the dashboard and CLI are clients of an in-process admin service. If either goes down, the engine keeps trading.
- **Python is not used in the latency-sensitive execution path.** It may be used for research, offline analytics, and the Plan 8 sidecar — all of which read the same SQLite + Parquet storage as the engine without participating in the event loop.
- **Integration tests prioritize real data flows over mocked persistence layers.** SQLite (in-memory or on disk) is the substrate; tests that pass against a mock and fail against the real engine are the failure mode this project most wants to avoid.

## Audience

This repository is written for:

- Engineers evaluating the system design and implementation
- Future contributors extending the system
- AI coding assistants operating on the codebase

**Primary reader (current state):** the system designer and maintainer.

## Where to start

- [architecture.md](architecture.md) — system map
- [roadmap.md](roadmap.md) — what's planned and in what order
- [testing-strategy.md](testing-strategy.md) — how we know it works
- [contracts/](contracts/) — interface boundaries between internal components
- [prd/](prd/) — product requirements (the "what" and "why")
- [plans/](plans/) — implementation plans (the "how")
- [decisions/](decisions/) — architecturally significant decisions and their rationales
- [runbooks/](runbooks/) — operational procedures
- [updates/](updates/) — append-only project status log
- [`superpowers/specs/2026-04-12-trade-arbiter-design.md`](superpowers/specs/2026-04-12-trade-arbiter-design.md) — foundational design spec
