# Component Contracts

> How the modular pieces of Trade Arbiter talk to each other.

Trade Arbiter is built from independent components — Engine, Event Bus, Execution Adapter, Risk Manager, Data Feeds, Strategies — that communicate through narrow, well-defined interfaces. Each contract in this directory describes one of those interfaces: the methods, the guarantees, and the error behavior a component must satisfy to be a valid implementation.

**This is what makes the system swappable.** A sim execution adapter and a live broker execution adapter look different inside, but if both honor `execution-adapter.md`, the engine doesn't have to know which one is plugged in. Same story for strategies, data feeds, and risk rules.

## When to write a contract

- A new component boundary is introduced (e.g., a second venue adapter is on the horizon — write the contract before the second implementation exists)
- An existing boundary needs to be tightened because a bug crossed it
- A component is going to have multiple implementations (sim + live, multiple venues, multiple strategy types)

If a component will only ever have one implementation and lives entirely inside one package, it does **not** need a contract doc. The TypeScript interface in the source is enough.

## Format

Use [`_template.md`](_template.md). Each contract should cover:

- **Purpose** — what role this component plays
- **Interface** — methods, types, signatures
- **Guarantees** — what the component promises to its caller (latency, ordering, idempotency, etc.)
- **Error handling** — what failures look like and how the caller should react
- **Lifecycle** — how the component is constructed, started, stopped
- **Implementations** — links to known implementations
- **Testability** — what a contract test suite looks like
- **Change log** — append-only history of breaking and non-breaking changes

## Known component boundaries

| Component | Contract | Implementations |
|-----------|----------|-----------------|
| Execution Adapter | [`execution-adapter.md`](execution-adapter.md) | <!-- e.g., paper, polymarket, kalshi --> |
| Data Feed | <!-- `data-feed.md` --> | <!-- e.g., polymarket-ws, kalshi-ws --> |
| Strategy | <!-- `strategy.md` --> | <!-- e.g., binary-arbitrage, funding-rate --> |
| Risk Rule | <!-- `risk-rule.md` --> | <!-- e.g., max-drawdown, position-limit --> |
| Event Bus | <!-- `event-bus.md` --> | <!-- in-memory, persistent --> |
| Admin Transport | <!-- `admin-transport.md` --> | <!-- http, ipc --> |

<!-- Fill in as contracts and implementations land. -->

## See also

- [../architecture.md](../architecture.md) — how the components fit together at the system level
- [../testing-strategy.md](../testing-strategy.md) — how contracts get tested
