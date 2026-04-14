# Trade Arbiter — Testing Strategy

> What we test, where, and why. Update when a new test layer or tool is introduced.

## Layers

### Compile-shape tests

<!--
What they do, where they live, what to use them for.
The Plan 1 `@trade-arbiter/core` package is built on these:
the only "test" is a TypeScript compile that has to validate a literal
against an interface. If a future task drops a required field, every
compile-shape test that constructs that interface fails to typecheck.
That is the only line of defense against silent contract drift in a
contracts-only package.
-->

### Unit tests

<!--
Pure-function tests for individual rule, strategy, and utility logic.
Conventions, fixtures, where they live, naming.
-->

### Integration tests

<!--
Multi-component tests that exercise the bus, risk pipeline, and order manager
together. Use a real SQLite database, not mocks. Spin up a fake adapter that
records calls instead of mocking the network.
-->

### Replay / determinism tests

<!--
Backtest-driven regression tests: feed a recorded market log, assert the
same fills come out byte-for-byte. The bedrock guarantee that backtests
match paper which match live (modulo venue noise).
-->

### Property-based tests

<!--
Where used (e.g. risk rule invariants, lineage graph properties),
tooling (fast-check), conventions for shrinking and seed reproduction.
-->

## Tools

<!--
- `node --test` (built-in test runner)
- `tsx` (TS source loader, no build step)
- `fast-check` (property tests) — when added
- `c8` (coverage) — when added
-->

## CI gates

<!--
What runs in GitHub Actions:
- typecheck (`tsc --noEmit` across all workspaces)
- tests (`node --test --import tsx`)
- lint (when added in Plan 3)

What must pass before merge.
What runs on a schedule (nightly replay regression, etc.).
-->

## Anti-patterns

<!--
Things we explicitly do NOT do. Examples:
- No mocking the database — use real SQLite in-memory or on disk
- No `setTimeout` in tests — inject the clock
- No network calls in unit tests — use a fake adapter
- No snapshot tests for fill output — assert structural fields, not blobs
-->

## See also

- [contracts/](contracts/) — every contract should describe its testability
- [decisions/](decisions/) — testing-related ADRs
