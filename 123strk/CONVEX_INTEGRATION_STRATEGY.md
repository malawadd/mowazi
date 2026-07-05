# Convex Integration Strategy for User Wallets + Strategy Execution

## Bottom line

Yes, Convex can fit this product well, but **as the control plane**, not as the high-frequency trading engine.

That means:

- **Convex** should manage users, strategy settings, wallet metadata, deposits, permissions, job state, logs, and reporting.
- **A separate worker service** should run the trading loop and call chain / exchange APIs.
- **Per-user wallets** should be created with a wallet infrastructure provider, not by storing raw private keys in Convex.

This is the safest and most realistic architecture for this repo.

---

## Why Convex fits

Convex is a strong match for:

- real-time app state
- user-specific settings and dashboards
- authenticated backend functions
- scheduling durable jobs and workflows
- webhook endpoints
- operational logs and strategy state

It is a weak match for running this strategy loop itself because the current bot is a continuous external-system trader:

- it polls every 2 seconds
- it calls Uniswap, RPC, and HyperLiquid repeatedly
- it needs long-running wallet and strategy state
- failed external calls may need custom retries and reconciliation

For this repo, Convex should orchestrate, not trade directly.

---

## Best architecture

## 1. Frontend

Use Convex for:

- auth
- user profiles
- strategy enrollment
- wallet status
- live dashboard
- deposits / withdrawals UI
- PnL, exposure, and position history

Each user sees:

- their strategy wallet address
- deposit status
- current LP status
- hedge status
- exposure
- IL / fee / PnL analytics

## 2. Convex backend

Use Convex for:

- storing user records
- storing wallet metadata
- strategy configuration per user
- portfolio state snapshots
- trade intents
- execution logs
- deposit events
- kill switches
- scheduling low-frequency maintenance jobs

Good Convex responsibilities:

- create a user strategy account
- persist whether the strategy is enabled
- store target risk settings
- expose HTTP endpoints for webhooks
- coordinate worker tasks
- keep a durable audit trail

## 3. Strategy worker

Run the actual strategy in a separate worker service:

- Python is fine because this repo is already Python
- the worker reads assignments from Convex
- the worker writes back positions, fills, and errors to Convex
- one worker can manage many user wallets, but execution should still be isolated per wallet

This worker is where:

- arb scanning runs
- LP health checks run
- hedge decisions run
- exchange / RPC calls happen
- retries and reconciliation happen

## 4. Wallet layer

Use a wallet provider for each user wallet.

The best pattern is:

- user gets a dedicated wallet address
- user deposits funds to that address
- the strategy is authorized to trade from that wallet under explicit rules

Convex stores wallet metadata and permissions, but **not the raw signing key**.

---

## The key custody decision

This is the most important product choice:

### Option A: User-controlled wallet

The user owns the wallet and must approve trades or grant delegated permissions/session authority.

Pros:

- strongest user ownership story
- best if you want “their own wallet” to be literally true

Cons:

- fully autonomous trading is hard unless the user grants pre-authorization
- strategy uptime depends on delegation/session validity

### Option B: App-controlled strategy wallet per user

Each user gets a dedicated wallet/account, but the app is allowed to trade it under agreed policy.

Pros:

- easiest for full automation
- cleanest strategy operations
- easiest to support LP management, hedging, and rebalancing

Cons:

- weaker self-custody story
- larger compliance and trust burden

### Recommended choice

For this strategy, the best practical model is:

**dedicated user wallet with delegated trading authority**

That keeps a separate wallet per user while still allowing the strategy to run without constant manual approvals.

---

## Recommended wallet providers

Convex is not the wallet custodian. Pair it with a wallet provider.

Two good fits:

### Turnkey

Best if you want:

- embedded wallets
- strong delegated access controls
- app-controlled or shared-control wallet patterns
- secure signing infrastructure

This is a very strong fit for “strategy wallet per user.”

### Privy

Best if you want:

- embedded user wallets
- easier end-user onboarding
- user wallet creation tied closely to auth flows

This is a strong fit if the product experience is more consumer-facing.

### My recommendation

If the goal is autonomous trading from a user-dedicated wallet, I would lean **Turnkey first** because the delegated-access model is especially useful for trading automation.

---

## How deposits should work

Recommended deposit flow:

1. User signs up in the app.
2. Convex creates a strategy account record for that user.
3. Wallet provider creates a dedicated wallet/account for that user.
4. Convex stores:
   - wallet address
   - provider wallet ID
   - custody mode
   - strategy permissions
5. User deposits USDC / LINK / ETH to that wallet.
6. Deposit watcher confirms balances and marks funds available.
7. Strategy worker begins trading only after:
   - deposit confirmed
   - risk settings accepted
   - automation permission enabled

If you later support LP NFTs or multiple chains, keep those as linked resources in Convex rather than overloading the wallet record.

---

## How the strategy should connect to Convex

There are two viable patterns.

### Pattern 1: Keep the Python bot, add Convex as control plane

This is the best fit for the current repo.

Flow:

- Convex stores user and strategy state
- Python workers fetch wallet assignments from Convex
- workers run the existing bot logic per wallet
- workers push fills, exposure, and health snapshots back to Convex

Why this is best:

- minimal rewrite
- preserves existing Python integrations
- avoids forcing the trading loop into Convex action runtime

### Pattern 2: Rewrite core orchestration into TypeScript + Convex actions

Possible, but not ideal for this repo.

Why not ideal:

- this bot is external-API heavy
- it wants continuous operation
- Convex actions are better for discrete tasks than for running your main HFT-ish loop

Use Convex actions for:

- rebalance trigger
- deposit handling
- health check tasks
- strategy start/stop
- report generation

Not for:

- the main every-2-second execution loop

---

## Suggested Convex data model

At minimum:

### `users`

- auth identity
- profile
- status

### `strategyAccounts`

- `userId`
- `walletAddress`
- `walletProvider`
- `walletProviderId`
- `strategyEnabled`
- `custodyMode`
- `riskProfile`
- `createdAt`

### `strategyConfigs`

- thresholds
- allowed markets
- max capital
- max leverage
- allowed actions
- toxic flow / IL controls

### `deposits`

- `strategyAccountId`
- token
- amount
- tx hash
- chain
- status

### `positions`

- LP position IDs
- hedge positions
- token balances
- notional exposure

### `executions`

- wallet
- action type
- venue
- amount
- result
- tx hash / order id
- timestamp

### `snapshots`

- NAV
- fee accrual
- IL proxy
- hedge PnL
- exposure
- utilization

### `alerts`

- strategy paused
- toxic flow detected
- wallet underfunded
- hedge failure
- rebalance needed

---

## Suggested Convex functions

Public / client-facing:

- `createStrategyAccount`
- `getStrategyDashboard`
- `enableStrategy`
- `pauseStrategy`
- `getDepositInstructions`
- `requestWithdrawal`

Internal / worker-facing:

- `listRunnableAccounts`
- `lockAccountForExecution`
- `recordExecution`
- `recordSnapshot`
- `markDepositConfirmed`
- `raiseAlert`
- `setStrategyState`

HTTP actions:

- wallet provider webhook
- chain indexer / deposit webhook
- exchange webhook if later needed

Crons / scheduled jobs:

- stale account reconciliation
- periodic PnL rollups
- stuck execution recovery checks
- daily reporting

---

## What I would not do

I would not:

- store raw per-user private keys directly in Convex tables
- run the 2-second trading loop purely inside Convex actions
- couple one global bot wallet to all users
- let deposits hit a shared omnibus wallet unless you deliberately want fund pooling

Those choices make security, accounting, and per-user isolation much worse.

---

## Best implementation plan

### Phase 1: Convex as dashboard + control plane

- add Convex project
- model users, strategy accounts, configs, snapshots, executions
- connect existing Python bot to Convex using the Python client or HTTP API
- support one test strategy account first

### Phase 2: Dedicated wallet per user

- integrate Turnkey or Privy
- create a wallet when user enables strategy
- store provider IDs and wallet addresses in Convex
- add deposit monitoring

### Phase 3: Multi-account execution worker

- one worker process manages many strategy accounts
- isolate state per wallet
- add account locks so only one execution loop runs per wallet at a time

### Phase 4: IL and toxic-flow controls

- add regime state into Convex
- store LP health / toxicity metrics
- pause or widen strategy automatically

### Phase 5: Withdrawals and reporting

- add user withdrawal requests
- unwind positions safely
- settle balances
- generate downloadable statements

---

## Final recommendation

If you want to “implement this into Convex” and give each user their own strategy wallet:

**Use Convex for app state, orchestration, and observability; use Turnkey-backed dedicated wallets for users; keep the trading engine as an external Python worker that trades each user wallet under delegated authority.**

That is the cleanest architecture, the safest custody model, and the best fit for this repo as it exists today.
