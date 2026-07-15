# Agentic Trading Backend

## Boundary

Convex is the product source of truth. It owns authenticated profiles, versioned policies,
analysis jobs and latest snapshots, proposals and approvals, credit balances/reservations,
and user-facing queries. Python owns ingestion, durable Temporal workflows, provider calls,
history in Timescale, hot state and coordination in Redis, and deterministic preflight.

LLMs can produce evidence, signals, syntheses, and proposals. They cannot receive wallet
credentials or call a venue adapter. The execution gateway obtains a new quote and reruns
policy, balance, health, freshness, quorum, and reconciliation checks before it can ask a
signing adapter to submit.

## Processes

- `api`: health, internal workflow dispatch, policy checks, and push evidence ingestion.
- `worker`: Temporal worker that runs bounded concurrent specialist and synthesis calls.
- `dispatcher`: claims leased Convex jobs, reserves/settles credits, starts workflows, and
  publishes the current visualization snapshot back to Convex.
- `scheduler`: enqueues configured 15m/5m/2m/1m account cycles without account-market overlap.
- `ingestors`: normalizes direct venue/news feeds and stores sanitized evidence.
- `execution-gateway`: quote plus deterministic preflight and credential isolation.
- `execution-sidecar`: official GMX TypeScript SDK boundary and future Uniswap broadcast path.

Focus uses six specialists and one synthesis. Pro uses 12 roles, dual-runs four critical
roles, then critic and synthesis. Max uses 20 roles, dual-runs ten directional/risk roles,
per-provider syntheses, and an arbiter. Model names come from environment variables and are
recorded in every provider-call entry.

## Local start

1. Copy `.env.agents.example` to `.env.agents` and set the shared Convex secret and provider keys.
2. Start the Next/Convex app normally.
3. Run `docker compose -f docker-compose.agents.yml up --build`.
4. Open Temporal UI on `http://localhost:8233`, API health on `http://localhost:8100/health`,
   and execution health on `http://localhost:8200/health`.

The Compose default deliberately uses the example environment so `docker compose config`
works in CI. Set `AGENT_ENV_FILE=.env.agents` for secrets. Never commit the real environment.

## Production

Build the same `agent-service` and `execution-sidecar` images. Point them to Temporal Cloud,
managed Postgres/Timescale and Redis, and an OTLP collector. Replace `LocalMasterKeyWrapper`
with a cloud-KMS `KeyWrapper`; no plaintext private key is stored or logged. Autoscale worker
replicas on Temporal task-queue latency and provider capacity, not only CPU.

Alerts should cover queue dispatch p95 over five seconds, provider failure/quorum rate,
lease retries, credit-reservation age, public snapshot age, execution rejection reason,
venue health, reconciliation drift, and any duplicate idempotency key. Structured logs carry
job, account, market, provider, analysis, and venue fields when available.

## Release gates

`LIVE_EXECUTION_ENABLED` defaults to false. A venue additionally must appear in
`CERTIFIED_VENUES`. Hyperliquid, Lighter, Orderly, GMX, Ostium, and Uniswap must each pass the
venue contract suite on sandbox/testnet and a deliberately small funded mainnet canary before
being added. The checked-in Python adapters for venues lacking certified signing flows remain
`CertificationBlockedAdapter`; this is a release blocker, not a soft warning.

Run verification:

```text
cd agent-service
py -3.12 -m venv .venv
.venv\Scripts\python -m pip install -e ".[test]"
.venv\Scripts\python -m pytest -q

cd ..\execution-sidecar
npm install
npm run typecheck

cd ..
npx convex codegen
npx tsc --noEmit -p convex/tsconfig.json
npm test
docker compose -f docker-compose.agents.yml config --quiet
```

The load profile is `agent-service/loadtest/k6.js`. It drives 1,000 active readers and 200
simultaneous workflow dispatches with the 300 ms public-read and five-second dispatch p95
thresholds. Run it against an isolated environment with provider capacity limits configured.
