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

<!-- Newest first.
- [0001-some-decision.md](0001-some-decision.md) — One-line summary
-->
