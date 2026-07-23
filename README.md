# Moeazi

Moeazi is an Arbitrum-first autonomous trading application built from:

- Next.js 15 and React 19 for the public terminal and signed-in portal
- Convex for users, agent configuration, credits, proposals, and current UI state
- Python 3.12 workers and Temporal for durable agent workflows
- Postgres/Timescale for evidence, traces, and analysis history
- Redis for runtime controls, budgets, demand state, and concurrency limits
- isolated Python and TypeScript execution services for venue access

Users sign with Particle or Magic. Agent workers never receive wallet keys, venue
credentials, or signing tools.

## Local Services

| Service | Local address | Purpose |
| --- | --- | --- |
| Web app | `http://127.0.0.1:3002` | Terminal, portal, Agent Lab, and API proxies |
| Convex | Configured by `CONVEX_DEPLOYMENT` | Canonical application state |
| Agent API | `http://127.0.0.1:8100/health` | Agent, BYOK, monitoring, and runtime-control APIs |
| Execution gateway | `http://127.0.0.1:8200/health` | Python venue preflight and execution |
| Execution sidecar | `http://127.0.0.1:8300/health` | GMX and Uniswap TypeScript integrations |
| Temporal UI | `http://127.0.0.1:8233` | Workflow inspection |
| Temporal gRPC | `127.0.0.1:7233` | Workflow coordination |
| Timescale/Postgres | `127.0.0.1:5432` | Detailed agent history |
| Redis | `127.0.0.1:6379` | Hot state and development safeguards |

## Safety Defaults

Local development is intentionally resource-safe:

- Manual Guard is **ON**: scheduled and event-triggered analysis is blocked.
- Lite Mode is **ON**: runs use at most two provider calls with strict daily caps.
- Live execution is **OFF**: Autopilot exercises the workflow but simulates submission.
- Background ingestion is **OFF**.

Use `/agent-lab` to run agents manually or inspect the effective controls. Turning
off a safeguard requires confirmation. Do not enable live execution merely to test
the UI.

## Prerequisites

- Windows PowerShell 5.1 or PowerShell 7
- Node.js 20 or newer and npm
- Docker Desktop with Docker Compose
- a Convex development deployment
- Python 3.12 only if running Python tests outside Docker
- Particle project credentials, or a Magic key, for authenticated wallet flows
- an Arbitrum RPC URL for wallet, token, venue, and execution features
- at least a DeepSeek key for the current local agent bootstrap

The all-in-one launcher is currently a PowerShell script. The application services
themselves are portable containers.

## First-Time Setup

### 1. Install JavaScript dependencies

```powershell
npm install
```

### 2. Create local environment files

```powershell
Copy-Item .env.example .env.local
Copy-Item .env.agents.example .env.agents
```

Both files are ignored by Git. Never put real secrets in the example files.

### 3. Configure `.env.local`

At minimum, set:

```env
CONVEX_DEPLOYMENT=dev:your-deployment
NEXT_PUBLIC_CONVEX_URL=https://your-deployment.convex.cloud
NEXT_PUBLIC_APP_URL=http://127.0.0.1:3002

NEXT_PUBLIC_PROJECT_ID=...
NEXT_PUBLIC_CLIENT_KEY=...
NEXT_PUBLIC_APP_ID=...
PARTICLE_PROJECT_SERVER_KEY=...

PARTICLE_CONVEX_JWT_ISSUER=http://127.0.0.1:3002
PARTICLE_CONVEX_JWKS_URL=http://127.0.0.1:3002/api/auth/jwks
PARTICLE_CONVEX_JWT_PRIVATE_KEY_PEM="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
PARTICLE_CONVEX_JWT_PUBLIC_KEY_PEM="-----BEGIN PUBLIC KEY-----\n...\n-----END PUBLIC KEY-----"

WORKER_SHARED_SECRET=use-a-long-random-value
ARBITRUM_RPC_URL=https://your-arbitrum-rpc
AGENT_API_URL=http://127.0.0.1:8100
AGENT_LAB_ENABLED=true
MAINNET_VENUE_SETUP_ENABLED=false
LIVE_EXECUTION_ENABLED=false
```

Magic is optional. To enable it, set `NEXT_PUBLIC_MAGIC_API_KEY`,
`NEXT_PUBLIC_MAGIC_DELEGATION_CHAIN_ID=42161`, and
`NEXT_PUBLIC_MAGIC_RPC_URL`.

Convex must be able to fetch `PARTICLE_CONVEX_JWKS_URL`. A loopback URL works
for page development but not authenticated Convex sessions; use a secure tunnel or
deployed app URL when testing sign-in end to end.

### 4. Configure `.env.agents`

Required local values are:

```env
WORKER_SHARED_SECRET=the-exact-same-value-used-by-convex
CONVEX_WORKER_URL=https://your-deployment.convex.site/worker
DEEPSEEK_API_KEY=...
PROVIDER_MODE=deepseek_only

BYOK_ENABLED=true
BYOK_SECRET_BACKEND=local
MASTER_KEY=a-32-byte-urlsafe-base64-key

ARBITRUM_RPC_URL=https://your-arbitrum-rpc
AGENT_DEV_CONTROLS_ENABLED=true
AGENT_MANUAL_GUARD_DEFAULT=true
AGENT_LITE_MODE_DEFAULT=true
MAINNET_VENUE_SETUP_ENABLED=false
LIVE_EXECUTION_ENABLED=false
```

`PROVIDER_MODE=deepseek_only` is the least expensive bootstrap. For balanced
platform routing, change it to `balanced` and add `OPENAI_API_KEY`.

OpenRouter is BYOK-only. Do not add an OpenRouter key to an environment file;
connect it from `/agents/models` so it is encrypted in the provider vault.

Generate a local provider-vault key with:

```powershell
node -e "const c=require('crypto'); console.log(c.randomBytes(32).toString('base64').replace(/\+/g,'-').replace(/\//g,'_'))"
```

### 5. Configure the Convex deployment

Set the server-side values in the Convex dashboard or with `npx convex env set`:

- `PARTICLE_CONVEX_JWT_ISSUER`
- `PARTICLE_CONVEX_JWKS_URL`
- `WORKER_SHARED_SECRET`
- `ARBITRUM_RPC_URL`
- `MAINNET_VENUE_SETUP_ENABLED=false`
- `LIVE_EXECUTION_ENABLED=false`

The worker secret must match `.env.local` and `.env.agents`.

## Run Everything

From the repository root:

```powershell
npm run stack:start
```

This command:

1. starts the Next.js app on port `3002`;
2. starts `convex dev`;
3. rebuilds the current agent and execution images;
4. applies Postgres migrations;
5. starts Temporal, Timescale, Redis, the Agent API, two workers, and both
   execution services;
6. removes the obsolete polling dispatcher and background ingestor containers.

The launcher is idempotent. Running it again keeps existing services and rebuilds
the backend source when necessary.

Open:

- app: `http://127.0.0.1:3002`
- safe development controls: `http://127.0.0.1:3002/agent-lab`
- model connections and OpenRouter BYOK: `http://127.0.0.1:3002/agents/models`
- workflow history: `http://127.0.0.1:8233`

## Stop Everything

```powershell
npm run stack:stop
```

This stops the website, Convex development process, and Docker services. Postgres
and Redis volumes are preserved.

## Run Only Part of the Stack

| Command | Purpose |
| --- | --- |
| `npm run dev:frontend` | Next.js only on port `3002` |
| `npm run dev:backend` | Convex development process only |
| `npm run dev` | Next.js and Convex; does not start agent containers |
| `powershell -File scripts/start-agent-stack.ps1` | Rebuild and start agent/execution services |
| `powershell -File scripts/start-agent-stack.ps1 -InfrastructureOnly` | Start only Temporal, Postgres, and Redis |

The old `123strk/convex_supervisor.py` loop is not part of the normal agent runtime.
Temporal schedules and workflows replaced Convex job polling.

## Inspect the Running Stack

```powershell
docker compose -f docker-compose.agents.yml ps
docker compose -f docker-compose.agents.yml logs -f api worker execution-gateway execution-sidecar
Get-Content .data\website-frontend.err.log -Tail 50
Get-Content .data\website-backend.err.log -Tail 50
```

If a backend change appears missing, run `npm run stack:start` again. The launcher
rebuilds normal agent starts so a stale Docker image is not reused.

## Tests and Checks

```powershell
npm test
npx tsc --noEmit
npm run build
```

For Python tests outside Docker:

```powershell
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -e "./agent-service[test]"
python -m pytest agent-service/tests
```

Type-check the execution sidecar with:

```powershell
npm --prefix execution-sidecar install
npm --prefix execution-sidecar run typecheck
```

## Repository Map

| Path | Purpose |
| --- | --- |
| `app/` | Next.js routes, portal, terminal, and server proxies |
| `components/` | Shared UI and agent monitoring interfaces |
| `convex/` | Canonical product state, APIs, credits, policies, and audit events |
| `agent-service/` | Python API, Temporal workflows, agents, providers, and gateway |
| `execution-sidecar/` | TypeScript GMX and Uniswap execution adapter |
| `docker-compose.agents.yml` | Local durable-agent infrastructure |
| `scripts/start-all.ps1` | Complete local startup |
| `scripts/shutdown-all.ps1` | Complete local shutdown |
| `tests/` | TypeScript contract and application tests |
| `docs/` | Architecture, routing, and operational runbooks |
| `123strk/` | Legacy strategy-engine reference code |

## Mainnet and Security Notes

- Arbitrum `42161` is the only active EVM strategy execution chain.
- Optimism support is read/migration-only.
- Particle and Magic owner keys are never stored by Moeazi.
- Provider keys are encrypted locally with `MASTER_KEY`; production must use KMS.
- BYOK keys never enter Convex, traces, prompts, or agent-visible state.
- `MAINNET_VENUE_SETUP_ENABLED` and `LIVE_EXECUTION_ENABLED` are independent.
- Keep `CERTIFIED_VENUES` empty in development.
- Never expose the Agent API, execution ports, Redis, Postgres, or Temporal directly
  to the public internet.

See [docs/agent-runbook.md](docs/agent-runbook.md) for operations and
[docs/agentic-backend-architecture.md](docs/agentic-backend-architecture.md) for
the detailed system design.
