# Agent Platform Runbook

## Development safe defaults

Open `/agent-lab` and verify Manual Guard and Lite Mode are ON. “Restore safe defaults” pauses
agent schedules, cancels queued automatic jobs, and restores Lite limits. If Redis is unavailable,
the API reports safe defaults; do not disable a safeguard until Redis health is restored.

## Production autonomous start

Disable development controls at deployment, synchronize every active profile schedule, and verify
schedule count matches enabled subscriptions. Keep `LIVE_EXECUTION_ENABLED=false` until all six
venue certifications exist. Watch dispatch latency, provider budget, credit reservations, snapshot
freshness, and reconciliation drift during rollout.

## Lite Mode budget exhausted

Keep Lite Mode on. Confirm Redis daily run and provider-microusd keys match Agent Lab. Do not reset
counters to continue testing; wait for the UTC boundary or deliberately raise the environment ceiling
with an operator audit record.

## Provider quorum failure

Pause autopilot for affected accounts, inspect provider-call status by analysis ID, and check
rate limits/timeouts. Focus requires four valid specialist outputs. Pro and Max require two
canonical model families, their minimum valid-output count, and every critical role. For OpenRouter,
inspect the served model, selected upstream host, fallback attempts, and missing routing metadata.
Invalid or failed calls
are operational cost and must not be settled against user credits.

## BYOK connection or budget failure

Open `/agents/models`, refresh the provider catalog, and run the compatibility probe. Rotation first
verifies the replacement key and only then revokes the previous credential. Revocation pauses any
agent whose active route depends on that connection. Never copy a credential into Convex or a
Temporal input while debugging. If the Redis daily provider-cost reservation is exhausted, keep the
run blocked until the UTC reset or an audited budget change; do not fall back to a platform key.

## Monitoring trace review

Use `/agents/monitoring` for account-scoped usage and open a run to inspect its evidence-to-action
graph. Technical details include structured inputs, outputs, usage, latency, and errors. Hidden model
reasoning is intentionally unavailable; investigate using the recorded decision summary, factors,
uncertainties, evidence IDs, and deterministic check results. Detailed nodes expire after seven days,
while aggregate usage remains available.

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

## Manual Guard race

Turning Manual Guard on pauses schedules and cancels queued automatic Convex jobs. A workflow already
inside a provider call stops at the next safe checkpoint; do not terminate an activity that may be
reconciling state. Explicit manual runs remain allowed.

## Emergency stop race

Emergency stop wins even after proposal approval. The gateway must fetch current account state
and rerun deterministic checks immediately before signing. If a transaction was already
broadcast, reconcile it; never describe an accepted transaction as cancelled.

## Venue degradation

Remove the venue from `CERTIFIED_VENUES` or open its runtime circuit breaker, then restart only
the execution gateway. Analysis may continue with degraded evidence, but Pro/Max execution
requires quorum and healthy critical inputs. Re-enable only after sandbox replay, reconnect,
nonce/idempotency checks, and a funded canary succeed.

## Read-only venue routing

- Open `/agent-lab` and use **Venue routing lab** to exercise mainnet public quotes without a transaction.
- Open `/venues` to configure account readiness. Enabling a venue records setup intent only; it does not
  create credentials, fund an account, or authorize trading.
- Open `/trade/BTC`, preview a route, and verify the table distinguishes **ready**, **setup needed**, and
  **excluded** venues. The simulation button must state that no funds moved.
- Open `/swap` to request a Uniswap quote. Do not enable approval, signing, or broadcast during this phase.
- If a venue adapter degrades, leave it excluded. Do not substitute a fixture or claim executable depth.
- Redis keys use `routing:markets:v1` and `routing:preview:v1:*`; clearing them forces safe rediscovery.
