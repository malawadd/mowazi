# Moeazi

Moeazi is a `Next.js + Convex + Particle` app for managed strategy accounts.

The current product direction is:

- one user identity via Particle Auth
- one visible Particle Universal Account wallet per user strategy account
- one managed strategy account per user in Convex
- three managed venue wallets per account:
  - Optimism execution wallet
  - HyperLiquid master wallet
  - HyperLiquid agent wallet
- one external Python supervisor that decides what to do
- Convex-owned signing and execution actions that broadcast the actual trades

The legacy strategy engine still lives in the `123strk/` folder as internal code, but the public product name is `Moeazi`.

## Current Status

| Area | Status | Notes |
| --- | --- | --- |
| Next.js app shell and pages | Working | Dashboard, deposits, positions, risk, activity, settings, emergency stop are live |
| Particle auth | Working | Particle Auth signs app challenges, then Moeazi mints Convex `customJwt` sessions |
| Convex schema + managed account model | Working | Managed tables are in `convex/schema.ts` |
| Managed wallet generation + encryption | Working | Wallets are generated in Convex Node actions and encrypted with `WALLET_MASTER_KEY` |
| Strategy account provisioning | Working | Creates user record, strategy account, venue accounts, wallet secrets, default config |
| Strategy config save / enable / pause / emergency stop | Working | Backed by Convex mutations and audit events |
| Account wallet UI | Working | `/profile/wallet` shows Particle UA addresses, unified balance, receive instructions, and share link controls |
| Deposit instructions UI | Working | Shows managed strategy funding addresses for Optimism + HyperLiquid master wallet |
| Particle Universal Account funding | Working | Receives funds into UA, supports public payment links, and sends supported UA transfers into strategy rails |
| Worker HTTP gateway + execution leases | Working | Exposed through `convex/http.ts` |
| Uniswap execution actions | Implemented | Needs live funded-wallet validation before treating as production-ready |
| HyperLiquid approval / order / withdrawal actions | Implemented | Needs live funded-wallet validation before treating as production-ready |
| External multi-account supervisor | Partial | Runs, leases accounts, reads markets, records activity, but still reuses some legacy reader code |
| Position syncing | Partial | UI and schema are ready, but automated LP / hedge syncing is not fully ported yet |
| Deposit detection | Partial | `markDepositConfirmed` exists, but no automated chain watcher is wired yet |
| Withdrawal UX | Partial | Backend exists, but no dedicated frontend flow yet |
| Legacy single-wallet bot | Legacy | Not part of the managed Moeazi app path |

## What Is Connected

These files are part of the current managed Moeazi path:

- `app/`
  - public marketing page
  - authenticated dashboard pages
  - legacy route redirects for old URLs
- `components/`
  - app shell and shared UI
- `convex/`
  - schema, queries, mutations, public actions
  - Node execution actions for signing and broadcasting
  - `/worker` HTTP endpoint for the external supervisor
- `123strk/convex_supervisor.py`
  - external worker loop
- `123strk/convex_worker_client.py`
  - HTTP client for Convex worker commands
- `123strk/managed_runtime.py`
  - account-level runtime and decision helpers
- `123strk/uniswap_client.py`
  - currently reused for market reads
- `123strk/hyperliquid_client.py`
  - currently reused for market reads

## What Is Not Connected

These files are still in the repo, but they are not the current Moeazi execution path:

- `123strk/main.py`
- `123strk/arbitrage_engine.py`
- `123strk/executor.py`
- `123strk/hedger.py`
- `123strk/rebalance.py`
- `123strk/balance_tracker.py`
- `123strk/exposure_scanner.py`

Treat those as legacy internal bot code or reference material unless you intentionally decide to port them into the managed system.

## Repo Map

| Path | Purpose |
| --- | --- |
| `app/` | Next.js pages and route redirects |
| `components/` | Shared UI shell and primitives |
| `convex/schema.ts` | Managed data model |
| `convex/queries.ts` | Client-facing read APIs |
| `convex/mutations.ts` | Client-facing state changes |
| `convex/publicActions.ts` | Provisioning and user-triggered actions |
| `convex/actions.ts` | Internal Node actions for signing and execution |
| `convex/http.ts` | Worker HTTP gateway |
| `convex/private.ts` | Internal queries for managed wallet contexts |
| `convex/helpers/walletCrypto.ts` | AES-256-GCM encryption / decryption and wallet generation |
| `123strk/convex_supervisor.py` | External worker loop |
| `123strk/managed_runtime.py` | Account context and decision helpers |
| `tests/` | Lease and wallet crypto tests |

## Requirements

- Node.js 20+
- npm
- Python 3.10+ if you want to run the external supervisor
- a Convex deployment
- a Particle Network project
- an Optimism RPC endpoint
- a HyperLiquid account if you want to validate live hedge flows
- a Uniswap API key if your environment requires one

## Environment Variables

Start from `.env.example`. It documents the current variables without exposing live secrets.

### Local Next.js app

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONVEX_DEPLOYMENT` | Yes | Convex deployment selector used by local tooling |
| `NEXT_PUBLIC_CONVEX_URL` | Yes | Convex URL used by the browser client |
| `NEXT_PUBLIC_PROJECT_ID` | Yes | Particle project ID |
| `NEXT_PUBLIC_CLIENT_KEY` | Yes | Particle browser client key |
| `NEXT_PUBLIC_APP_ID` | Yes | Particle app ID |
| `PARTICLE_PROJECT_SERVER_KEY` | Yes | Particle server key used to verify project users |

### Convex deployment environment

Set these in the Convex dashboard or via `npx convex env set`.

| Variable | Required | Purpose |
| --- | --- | --- |
| `PARTICLE_CONVEX_JWT_ISSUER` | Yes | Issuer used by Moeazi app-owned Convex JWTs |
| `PARTICLE_CONVEX_JWKS_URL` | Yes | Public JWKS URL Convex fetches for JWT validation |
| `PARTICLE_CONVEX_JWT_PRIVATE_KEY_PEM` | Yes | RS256 private key used by Next.js to mint Convex JWTs |
| `PARTICLE_CONVEX_JWT_PUBLIC_KEY_PEM` | Yes | Matching RS256 public key exposed from `/api/auth/jwks` |
| `PARTICLE_CONVEX_JWT_KID` | Optional | JWKS key ID, defaults to `particle-convex` |
| `WALLET_MASTER_KEY` | Yes | Master key used to encrypt managed private keys |
| `WORKER_SHARED_SECRET` | Yes | Shared secret protecting the `/worker` HTTP route |
| `OPTIMISM_RPC_URL` | Yes | Optimism RPC for managed signing actions |
| `QUICKNODE_HTTP` | Optional | Fallback alias for `OPTIMISM_RPC_URL` |
| `UNISWAP_API_KEY` | Optional | Used by Uniswap Trading API quote / swap helpers |
| `UNISWAP_API_URL` | Optional | Defaults to `https://trade-api.gateway.uniswap.org/v1` |

### External Python supervisor

| Variable | Required | Purpose |
| --- | --- | --- |
| `CONVEX_WORKER_URL` | Yes | Full URL to the Convex `/worker` HTTP endpoint |
| `WORKER_SHARED_SECRET` | Yes | Must match the Convex deployment secret |
| `QUICKNODE_HTTP` | Yes | Used by the reused Uniswap market reader |
| `QUICKNODE_WSS` | Optional | Present in legacy config; not required by the current supervisor loop |
| `UNISWAP_API_KEY` | Optional | Used by reused Uniswap quote utilities |

### Legacy-only variables

These are not required for the managed Moeazi flow unless you intentionally run the old single-wallet bot:

- `PRIVATE_KEY`
- `HL_PRIVATE_KEY`
- `HL_WALLET_ADDRESS`
- `LP_WALLET_ADDRESS`

### Variables that appear stale for the current app

These showed up in local env state but are not used by the managed Moeazi path:

- `HEDERA_PRIVATE_KEY`
- `OPENAI_API_KEY`

## Particle Setup

1. Create or open a project in the Particle Dashboard.
2. Copy the project ID, client key, app ID, and server key into `.env.local`.
3. Generate an RS256 keypair for Moeazi JWTs and set the private/public PEM env values.
4. Set `PARTICLE_CONVEX_JWT_ISSUER` to your app origin and `PARTICLE_CONVEX_JWKS_URL` to `<origin>/api/auth/jwks`.
5. Set the same issuer and JWKS values in Convex with `npx convex env set`.
6. Start the app and verify `/sign-in` opens Particle Auth before provisioning a strategy account.

For deployed Convex, the JWKS URL must be publicly reachable by Convex.

## Running The App

### One-time install

```bash
npm install
```

### Start the web app and Convex backend

If you want the normal all-in-one dev flow:

```bash
npm run dev
```

Notes:

- `npm run dev` runs both Next.js and Convex.
- the current `predev` script also opens the Convex dashboard once the backend is reachable.

If you want separate terminals:

```bash
npm run dev:backend
npm run dev:frontend
```

Open:

- `http://localhost:3000`

## Running The External Supervisor

The web app can run without this, but live automated strategy behavior needs it.

```bash
python -m venv .venv
.venv\Scripts\activate
pip install -r 123strk/requirements.txt
python 123strk/convex_supervisor.py
```

The supervisor currently:

- fetches runnable accounts from Convex
- acquires a per-account lease
- reads Uniswap and HyperLiquid market prices
- records snapshots
- decides whether to trigger a Uniswap swap or HyperLiquid hedge order
- releases the lease

## First Manual Smoke Test

1. Start Convex and Next.js.
2. Sign in with Particle.
3. Open `/dashboard`.
4. Click `Create strategy account`.
5. Confirm three venue wallets appear.
6. Open `/profile/wallet` and confirm the Particle account wallet shows owner EOA, EVM UA, Solana UA, and unified balance.
7. Sync the account wallet, create/copy the shared payment link, and open `/pay/<slug>` in a public browser context.
8. On the public payment page, connect a Particle payer wallet and preview a supported deposit into the owner UA.
9. Move funds from the owner UA into the supported strategy rails, then refresh managed funding state.
10. Open `/deposits` and confirm the managed funding addresses and refreshed balances render.
11. Approve the HyperLiquid agent wallet from the dashboard.
12. Enable the strategy.
13. Start the external supervisor if you want automated activity.
14. Check `/risk` and `/activity` for snapshots, alerts, and execution events.

## Useful Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start Next.js + Convex together |
| `npm run dev:frontend` | Start Next.js only |
| `npm run dev:backend` | Start Convex only |
| `npx convex codegen` | Refresh generated Convex types |
| `npm run build` | Production build |
| `npm test` | Run unit tests |
| `python 123strk/convex_supervisor.py` | Start the external supervisor |

## Known Gaps

- There is no automated deposit watcher yet.
- Public payment links record intent metadata, but balances still come from Particle UA and managed wallet refreshes.
- Position syncing is not complete, so positions may stay empty until data is explicitly recorded.
- Withdrawal requests exist at the backend level, but there is no dedicated withdrawal page yet.
- The supervisor still reuses legacy market-reader modules from `123strk/`.
- Live HyperLiquid and Uniswap execution paths still need validation with funded accounts.
- Legacy compatibility routes still exist under paths like `/copilot-trading`, `/agents`, `/audit`, and `/styleguide`, but they only redirect into the new app.

## Recommended Next Steps

1. Remove tracked local secrets from version control and rotate any credentials that have been shared.
2. Add a real `.env.local` bootstrap process based on `.env.example`.
3. Add automated deposit detection and confirmation.
4. Port LP / hedge state syncing into the managed supervisor path.
5. Build a real withdrawal UI on top of `requestWithdrawal`.
6. Add integration tests for onboarding, execution, and multi-account isolation.
7. Decide whether the legacy single-wallet bot files should be archived, ported, or deleted.

## Security Notes

- Managed private keys are encrypted at rest in Convex with AES-256-GCM, but this is still app-controlled custody.
- The current repo state includes a tracked `.env.local`. Treat any real secrets that ever lived there as exposed if this repo has been pushed or shared.
- `WORKER_SHARED_SECRET` should be a different value from `WALLET_MASTER_KEY`.

## Source Of Truth

Use this root `README.md` as the source of truth for the managed Moeazi app.

The older docs in `123strk/README.md` and `convex/README.md` are historical context unless they are explicitly updated to match the managed architecture.
