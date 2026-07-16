from contextlib import asynccontextmanager

from fastapi import FastAPI, Header, HTTPException
from opentelemetry.instrumentation.fastapi import FastAPIInstrumentor
from pydantic import BaseModel
from redis.asyncio import Redis
from temporalio.client import Client, WorkflowExecutionStatus

from .config import get_settings
from .contracts import ExecutionDecision, TradeProposal
from .credits import estimated_credits
from .policy import AutomationPolicy, RiskContext, evaluate_policy
from .observability import configure_observability
from .roles import assignments_for_tier
from .temporal_app import MarketAnalysisWorkflow
from .data_adapters import PushEvidenceAdapter
from .storage import AnalysisRepository


settings = get_settings()
configure_observability(settings.service_name, settings.otel_exporter_otlp_endpoint)


@asynccontextmanager
async def lifespan(app: FastAPI):
    app.state.temporal = await Client.connect(settings.temporal_address, namespace=settings.temporal_namespace)
    app.state.repository = AnalysisRepository(settings.postgres_dsn)
    app.state.redis = Redis.from_url(settings.redis_url)
    yield


app = FastAPI(title="Moeazi Agent Platform", version="0.1.0", lifespan=lifespan)
FastAPIInstrumentor.instrument_app(app)


class WorkflowRequest(BaseModel):
    job_id: str
    market: str
    tier: str
    scope: str
    account_id: str | None = None
    evidence: str = ""


class PolicyCheckRequest(BaseModel):
    policy: AutomationPolicy
    proposal: TradeProposal
    context: RiskContext
    quote_reference: str
    idempotency_key: str


class PushEvidenceRequest(BaseModel):
    source: str
    market: str
    reference: str
    payload: str
    quality_score: float = 0.7


def authorize(value: str | None) -> None:
    if value != f"Bearer {settings.worker_shared_secret.get_secret_value()}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    return {
        "status": "ok", "live_execution": settings.live_execution_enabled,
        "provider_mode": settings.provider_mode,
        "degraded": settings.provider_mode != "balanced",
    }


@app.get("/v1/tiers/{tier}")
async def tier_contract(tier: str):
    assignments = assignments_for_tier(tier)
    return {"tier": tier, "calls": len(assignments), "estimatedCredits": estimated_credits(tier)}


@app.post("/internal/workflows")
async def start_workflow(request: WorkflowRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    handle = await app.state.temporal.start_workflow(
        MarketAnalysisWorkflow.run,
        {
            "market": request.market, "tier": request.tier, "scope": request.scope,
            "account_id": request.account_id, "evidence": request.evidence, "freshness_ms": 0,
        },
        id=f"analysis-{request.job_id}", task_queue=settings.temporal_task_queue,
    )
    return {"workflowId": handle.id}


@app.get("/internal/workflows/{workflow_id}")
async def workflow_status(workflow_id: str, authorization: str | None = Header(default=None)):
    authorize(authorization)
    handle = app.state.temporal.get_workflow_handle(workflow_id)
    description = await handle.describe()
    status = description.status.name.lower()
    response = {"workflowId": workflow_id, "status": status}
    if description.status == WorkflowExecutionStatus.COMPLETED:
        response["result"] = await handle.result()
    return response


@app.post("/internal/policy/check", response_model=ExecutionDecision)
async def check_policy(request: PolicyCheckRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    return evaluate_policy(request.policy, request.proposal, request.context, request.quote_reference, request.idempotency_key)


@app.post("/internal/evidence")
async def push_evidence(request: PushEvidenceRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    if request.source not in {"quicknode", "cryptopanic", "gdelt", "x_filtered_stream", "reddit"}:
        raise HTTPException(status_code=400, detail="Unsupported evidence source")
    adapter = PushEvidenceAdapter(request.source, max(0, min(1, request.quality_score)))
    item = adapter.normalize(request.payload, request.reference)
    item.metadata["market"] = request.market.upper()
    await app.state.repository.save_evidence(item)
    await app.state.redis.setex(
        f"evidence:hot:{request.market.upper()}:{item.ref.id}", 300,
        item.ref.model_dump_json(),
    )
    return {"evidenceId": item.ref.id, "contentHash": item.ref.content_hash}
