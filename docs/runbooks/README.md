# Runbooks

> Step-by-step operational procedures for running, monitoring, and recovering Trade Arbiter.

A runbook is the document you reach for when something is happening **right now** and you don't have time to think from first principles. Each one should answer: how do I do this safely, what should I see if it's working, and how do I roll back if it isn't.

## When to write one

- You hit an incident and had to figure out the recovery from scratch — write the runbook **after** so the next person doesn't
- You're about to perform a high-stakes operation (live arming, kill switch reset, credential rotation) and want a checklist you trust
- An operation is performed often enough that the steps are starting to drift across attempts

## When NOT to write one

- One-off operations that will never repeat — leave them in the relevant ADR or update entry
- Anything fully automated by a script — the script is the runbook
- General "how the system works" explanations — those belong in `architecture.md`

## Format

Use [`_template.md`](_template.md). Keep runbooks **terse and imperative**: numbered steps, exact commands, expected output. Skip background unless it directly affects the next action.

Every runbook must have a **last verified** date. If a runbook hasn't been verified in 90 days, treat its commands as suspect and re-verify before relying on them.

## Index

<!-- Group by category. Newest within each group first. -->

### Daily operations

<!-- - [start-engine.md](start-engine.md) — bring the engine up from a clean state -->

### Incident response

<!-- - [kill-switch-tripped.md](kill-switch-tripped.md) — diagnose and reset -->

### Maintenance

<!-- - [rotate-venue-credentials.md](rotate-venue-credentials.md) -->

## See also

- [../architecture.md](../architecture.md) — system structure (background, not procedures)
- [../updates/](../updates/) — operational history and incident write-ups
