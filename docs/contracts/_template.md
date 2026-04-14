# <Component name> Contract

- **Status:** draft | accepted | superseded by <other contract>
- **Owner:** <name>
- **Last updated:** YYYY-MM-DD
- **Source of truth:** <link to the TypeScript interface this contract documents>

## Purpose

<!--
One paragraph: what role does this component play in the system? Who
calls it? Who does it call? Why is this a boundary worth fencing in?
-->

## Interface

<!--
The methods the component exposes. Copy the TypeScript signature
verbatim from the source so they don't drift. Example:

```ts
interface ExecutionAdapter {
  submitOrder(order: Order): Promise<ExecutionResult>;
  cancelOrder(orderId: OrderId): Promise<void>;
}
```

For each method, describe inputs, outputs, and side effects.
-->

## Guarantees

<!--
What the component promises to its caller. Be specific. Example:

- `submitOrder` must return within 500ms or throw `TimeoutError`
- The same `clientOrderId` submitted twice must produce one venue order (idempotency)
- Partial fills must surface as multiple `Fill` events with the same `orderId`
- Events must be emitted in monotonic timestamp order per `orderId`
-->

## Error handling

<!--
The caller needs to know:

- Which errors are recoverable vs terminal?
- What does a rejection look like? (exception type, error code, event)
- Is there retry behavior? Is it the component's job or the caller's?
- What state is the component left in after a failure?
-->

## Lifecycle

<!--
- How is the component constructed? What dependencies does it need?
- Does it have a `start()` / `stop()` phase?
- What happens to in-flight work on shutdown?
- Is it safe to construct multiple instances? Per-process? Per-venue?
-->

## Implementations

<!--
Bullet list of every known implementation of this contract, with a link
to the source file. Mark which one is the reference implementation
that contract tests run against.
-->

## Testability

<!--
- What does a contract test suite look like for this component?
- Where do the contract tests live? (e.g.,
  `packages/<pkg>/test/contracts/`)
- How does a new implementation prove it conforms? (Run the suite.)
- Are there fixtures or recorded fixtures the suite depends on?
-->

## Related

<!--
- ADRs that shaped this contract
- PRDs / specs that motivated it
- Other contracts it composes with
-->

## Change log

<!--
Append-only. Date + one line per change. Mark breaking changes clearly.

- 2026-04-13 — initial draft
-->
