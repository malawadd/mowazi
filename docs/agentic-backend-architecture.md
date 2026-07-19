# Agentic Trading Backend Architecture

## Goals and non-negotiable rules
- Analysis starts only after an explicit, price-confirmed user request.
- An idle system performs zero queue polling and zero visualization heartbeats.
- Convex is the product-state authority; Postgres stores detailed analytical history.
- Temporal owns durable long-running work. LLM workers never receive trading credentials.
- LLM output is evidence and proposals, never authority to sign or submit an order.
- Every paid run is bounded by a versioned rate card, model route, evidence limit, and token cap.

## Entire system — simplified
```mermaid
flowchart LR
    U[User] -->|Confirm tier and cost| W[Web application]
    W -->|Create one job| C[Convex control plane]
    W -->|Dispatch exact job ID| A[Python agent API]
    A -->|Start durable workflow| T[Temporal]
    T --> G[Specialist agents]
    G --> S[Synthesis]
    S --> C
    C -->|UI-ready snapshot| W
    S -->|Optional proposal| P[Deterministic policy engine]
    P -->|Approved only| E[Execution gateway]
    E --> V[Trading venues]
```

The important boundary is the split between analysis and execution. Agents can recommend; only deterministic code can authorize, sign, and submit.

## Entire system — detailed
```mermaid
flowchart TB
    subgraph Client["Client and application edge"]
        UI[Five visualization modes]
        SET[Agent settings]
        APR[Approval UI]
        BFF[Next.js backend-for-frontend]
    end

    subgraph Control["Convex control plane"]
        PROFILE[Profiles and policy versions]
        JOB[Analysis jobs]
        SNAP[Latest snapshots]
        CREDIT[Credit reservations and ledger]
        PROPOSAL[Proposals and approvals]
        AUDIT[Material audit events]
    end

    subgraph Agent["Python agent plane"]
        API[Authenticated agent API]
        DISPATCH[Exact-job dispatcher]
        TEMP[Temporal workflows]
        ROUTER[Provider and tier router]
        ROLES[Specialist role workers]
        SYNTH[Synthesis and quorum]
        POLICY[Deterministic risk policy]
    end

    subgraph Data["Market intelligence plane"]
        VENUE[Venue market adapters]
        CHAIN[QuickNode and on-chain]
        NEWS[CryptoPanic and GDELT]
        SOCIAL[X and optional Reddit]
        REDIS[Redis hot state and dedupe]
        PG[(Postgres and Timescale)]
    end

    subgraph Models["Model providers"]
        OPENAI[OpenAI]
        DEEPSEEK[DeepSeek]
    end

    subgraph Execution["Isolated execution plane"]
        GW[Python execution gateway]
        SIDE[TypeScript GMX and Uniswap sidecar]
        KMS[KMS or local key adapter]
        VENUES[Hyperliquid, Lighter, Orderly, GMX, Ostium, Uniswap]
    end

    UI --> BFF
    SET --> BFF
    APR --> BFF
    BFF --> PROFILE
    BFF -->|Manual create| JOB
    BFF -->|Exact job ID| API
    API --> DISPATCH --> TEMP
    TEMP --> ROUTER --> ROLES
    ROLES --> OPENAI
    ROLES --> DEEPSEEK
    ROLES --> SYNTH
    SYNTH --> TEMP
    TEMP --> PG
    TEMP --> SNAP
    TEMP --> CREDIT
    SNAP --> UI

    VENUE --> REDIS
    CHAIN --> REDIS
    NEWS --> PG
    SOCIAL --> PG
    REDIS --> ROLES
    PG --> ROLES

    SYNTH --> PROPOSAL
    PROPOSAL --> POLICY
    POLICY --> GW
    POLICY --> SIDE
    GW --> KMS
    SIDE --> KMS
    GW --> VENUES
    SIDE --> VENUES
    GW --> AUDIT
    SIDE --> AUDIT
```

## Component 1 — manual control and dispatch
```mermaid
sequenceDiagram
    actor User
    participant UI as Web UI
    participant CX as Convex
    participant API as Agent API
    participant TM as Temporal

    User->>UI: Click Run after seeing cost
    UI->>CX: Create job with tier and rate-card proof
    CX-->>UI: Return exact job ID
    UI->>API: Dispatch that job ID once
    API->>CX: Atomically claim exact job
    API->>TM: Start idempotent workflow
    API-->>UI: Accepted
    TM->>CX: Reconcile final snapshot and credits
```

Why this design:

- There is no idle `claimNext` loop, so an idle deployment consumes no queue reads.
- Exact-job claiming prevents one account from taking another account's work.
- The job ID is also the Temporal idempotency key, preventing duplicate workflows.
- Rate-card proof is checked in Convex and again in Python before provider use.

Possible improvements:

- In cloud environments, replace the browser dispatch hop with a signed Convex-to-agent webhook.
- Add an outbox table so failed dispatch notifications are retried without scanning the jobs table.

## Component 2 — durable multi-agent analysis
```mermaid
flowchart LR
    J[Claimed job] --> L[Load bounded evidence]
    L --> R[Tier router]
    R --> F[Focus: 6 roles]
    R --> P[Pro: 16 specialist calls]
    R --> M[Max: 30 specialist calls]
    F --> Q[Quorum and validation]
    P --> Q
    M --> Q
    Q --> Y[Compact synthesis inputs]
    Y --> S[Typed synthesis]
    S --> X[Snapshot and detailed history]
```

Why this design:

- Temporal retries recover from worker failure without duplicating a workflow.
- Tier routing makes cost and latency predictable before the user confirms.
- Typed outputs and quorum checks prevent one malformed provider response from becoming a trade.
- Compact synthesis materials prevent reports from recursively repeating all evidence.

Possible improvements:

- Dynamically skip low-value roles when deterministic data quality is insufficient.
- Use evaluation scores to route each role to the best-performing model.

## Component 3 — evidence ingestion and trust boundary
```mermaid
flowchart LR
    SRC[External feeds] --> N[Normalize]
    N --> S[Sanitize untrusted text]
    S --> H[Hash, timestamp, and provenance]
    H --> D{Storage path}
    D -->|Hot market state| R[(Redis)]
    D -->|History and evidence| P[(Postgres)]
    R --> B[Bounded evidence bundle]
    P --> B
    B --> A[Read-only agent prompt]
```

Why this design:

- Provenance and content hashes make every conclusion auditable.
- News and social text remain data; embedded instructions never become system commands.
- Redis serves current state while Postgres preserves history and evaluation evidence.
- Evidence count and character limits create a hard cost boundary.

Possible improvements:

- Add source-specific freshness service-level objectives.
- Detect duplicate stories across providers with semantic fingerprints.

## Component 4 — credits, policy, and authority
```mermaid
stateDiagram-v2
    [*] --> Estimated
    Estimated --> Reserved: User confirms
    Reserved --> Settled: Valid outputs produced
    Reserved --> Refunded: Failure or invalid output
    Settled --> Proposal
    Proposal --> Insight: Insights mode
    Proposal --> WaitingApproval: Approval-required mode
    Proposal --> PolicyCheck: Autopilot mode
    WaitingApproval --> PolicyCheck: User approves
    PolicyCheck --> Blocked: Any deterministic check fails
    PolicyCheck --> Executable: All checks pass
```

Why this design:

- Reservation prevents a run from exceeding the user's budget.
- Settlement bills validated output only; operational retries are platform cost.
- Versioned policy fields are deterministic and can be reproduced during an audit.
- Authority changes and natural-language policy drafts never activate silently.

Possible improvements:

- Add per-role cost attribution and cost-versus-value reports.
- Let users set a monetary ceiling in addition to integer credits.

## Component 5 — isolated trade execution
```mermaid
flowchart LR
    P[Approved proposal] --> Q[Fresh venue quote]
    Q --> C[Policy, balance, and exposure recheck]
    C --> S[Simulation where supported]
    S --> I[Idempotency and circuit breaker]
    I --> K[Credential unwrap in memory]
    K --> O[Sign and submit]
    O --> R[Confirm and reconcile]
    R --> A[Audit event]
```

Why this design:

- Analysis workers have no execution tools or credentials.
- A fresh quote and second policy check close the gap between analysis time and execution time.
- Idempotency keys and reconciliation prevent duplicate or phantom orders.
- KMS-backed envelope encryption limits credential exposure to one process boundary.

Possible improvements:

- Move signing into isolated short-lived workers or hardware-backed key services.
- Add venue-specific chaos tests and automatic degradation scoring.

## Component 6 — storage and observability
```mermaid
flowchart TB
    APP[API, workflows, workers, gateways] --> OTEL[OpenTelemetry]
    OTEL --> TRACE[Distributed traces]
    OTEL --> METRIC[Metrics and alerts]
    APP --> LOG[Structured logs]
    APP --> PG[(Detailed Postgres history)]
    APP --> CX[(Convex current product state)]
    METRIC --> RUNBOOK[Operator runbooks]
    TRACE --> RUNBOOK
    LOG --> RUNBOOK
```

Why this design:

- Convex stays small and reactive instead of becoming an analytical warehouse.
- Postgres retains provider calls, evidence, evaluations, and time-series syntheses.
- Shared trace IDs connect a user request, Temporal workflow, provider call, and execution.

Possible improvements:

- Add explicit budgets for Convex executions, provider tokens, and venue API calls.
- Alert on idle background traffic greater than zero.
- Add per-market freshness, failure-rate, and reconciliation-drift dashboards.

## Scaling and failure model
| Failure | Expected behavior |
|---|---|
| Browser closes after dispatch | Temporal continues; result reconciles to Convex |
| Duplicate Run click | Convex returns the active job; exact claim and workflow ID deduplicate |
| Agent API restarts | Already-started Temporal workflow continues |
| Provider timeout | Bounded retry; invalid output is not user-billed |
| Worker crashes | Temporal replays and schedules the activity elsewhere |
| Convex unavailable | Workflow reconciliation retries; execution remains blocked |
| Evidence is stale | Quorum/policy blocks proposal or marks analysis degraded |
| Venue is degraded | Circuit breaker prevents submission |

## Improvement roadmap
1. **Now:** event-driven exact-job dispatch, no viewer heartbeat, legacy poller disabled.
2. **Next:** transactional outbox and signed service webhook for browser-independent dispatch.
3. **Scale:** autoscale Temporal workers by task-queue depth and split ingestion by source.
4. **Quality:** continuous role/model evaluations and outcome-calibrated confidence.
5. **Safety:** isolated signing service, independent reconciliation observer, chaos canaries.
6. **Cost:** hard daily Convex, token, and provider budgets with automatic operator alerts.
