# Runbook: <short imperative title>

- **Severity:** routine | elevated | incident
- **Owner:** <name or role>
- **Last verified:** YYYY-MM-DD
- **Estimated duration:** <e.g., 5 min>

## When to use this

<!--
One or two sentences describing the trigger. What symptom or task
sends someone to this page? Be concrete enough that a half-awake
on-call responder can recognize the situation.
-->

## Preconditions

<!--
Numbered list of what must be true BEFORE you start. Examples:

1. You have venue API credentials in `~/.config/trade-arbiter/secrets.env`
2. The kill switch is currently active (verify with `trade-arbiter status`)
3. No open positions on the affected venue
-->

## Steps

<!--
Numbered, imperative, with exact commands and expected output.
NEVER write "verify the engine is healthy" — write the command that
proves it and the output you expect.

1. Run `trade-arbiter status`
   Expected: `engine: stopped, kill_switch: active`

2. Inspect the most recent risk event:
   `trade-arbiter events --tail 1 --type risk`
   Expected: a single event with `kind: 'KillSwitchTripped'`

3. ...
-->

## Verification

<!--
How do you confirm the operation succeeded? This is separate from
the steps because the steps may all return success while the system
is still in a bad state. Examples:

- `trade-arbiter status` shows `engine: running, kill_switch: inactive`
- No new error events in the last 60 seconds
- Position reconciliation shows zero divergence with the venue
-->

## Rollback

<!--
What to do if the operation fails or makes things worse. Be honest
about what is recoverable vs what requires human intervention.

If there is no safe rollback, say so explicitly:
"This operation is not reversible. If it fails, escalate to <name>."
-->

## Notes

<!--
Anything weird, version-specific, or learned the hard way that
doesn't fit above. Keep it short.
-->
