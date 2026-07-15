# Agent Platform Runbook

## Provider quorum failure

Pause autopilot for affected accounts, inspect provider-call status by analysis ID, and check
rate limits/timeouts. Focus requires four valid specialist outputs. Pro and Max require both
providers, their minimum valid-output count, and every critical role. Invalid or failed calls
are operational cost and must not be settled against user credits.

## Stale evidence or analysis

Check ingestor logs and Redis `evidence:hot:*` TTLs, then verify Timescale evidence timestamps.
Do not extend a snapshot expiry manually. Let a fresh workflow complete. Autopilot stays
blocked while critical evidence is stale or incomplete.

## Reconciliation drift

Open the account/venue circuit breaker, prevent new submissions, and compare venue orders,
fills, balances, and positions with proposal/execution audit records. Resolve or explicitly
write off the drift before closing the breaker. Retrying must reuse the original idempotency
key; never generate a new key for an uncertain submission.

## Credit reservation stuck

Find the analysis job and Temporal workflow. If the workflow is active, restore its worker.
If it is terminal without a validated synthesis, fail the job and release the full reservation.
Settle only validated successful specialist/synthesis outputs and refund the remainder.

## Emergency stop race

Emergency stop wins even after proposal approval. The gateway must fetch current account state
and rerun deterministic checks immediately before signing. If a transaction was already
broadcast, reconcile it; never describe an accepted transaction as cancelled.

## Venue degradation

Remove the venue from `CERTIFIED_VENUES` or open its runtime circuit breaker, then restart only
the execution gateway. Analysis may continue with degraded evidence, but Pro/Max execution
requires quorum and healthy critical inputs. Re-enable only after sandbox replay, reconnect,
nonce/idempotency checks, and a funded canary succeed.
