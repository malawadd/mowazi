from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import get_settings
from .contracts import ExecutionDecision, TradeProposal
from .execution import ExecutionGateway
from .credentials import LocalMasterKeyWrapper
from .policy import AutomationPolicy, RiskContext


settings = get_settings()
master_key = settings.master_key.get_secret_value()
gateway = ExecutionGateway(
    settings,
    LocalMasterKeyWrapper(master_key) if master_key else None,
)
app = FastAPI(title="Moeazi Execution Gateway", version="0.1.0")


class PreflightRequest(BaseModel):
    venue: str
    proposal: TradeProposal
    policy: AutomationPolicy
    context: RiskContext
    quote_request: dict
    idempotency_key: str


class QuoteRequest(BaseModel):
    venue: str
    request: dict


class DispatchRequest(BaseModel):
    venue: str
    request: dict
    decision: dict
    idempotency_key: str
    wrapped_credential: str | None = None
    account_context: str | None = None


class VenueMutationRequest(BaseModel):
    venue: str
    request: dict
    idempotency_key: str
    wrapped_credential: str
    account_context: str


class ReconcileRequest(BaseModel):
    venue: str
    account: str


def authorize(value: str | None) -> None:
    if value != f"Bearer {settings.worker_shared_secret.get_secret_value()}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    venues = {name: (await adapter.health()).model_dump() for name, adapter in gateway.adapters.items()}
    return {"status": "ok", "venues": venues}


@app.post("/internal/quote")
async def quote(request: QuoteRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    try:
        result = await gateway.quote(request.venue, request.request)
        return result.model_dump(mode="json")
    except (KeyError, RuntimeError, ValueError) as exc:
        raise HTTPException(status_code=409, detail=str(exc)) from exc


@app.post("/internal/preflight")
async def preflight(request: PreflightRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    decision, quote = await gateway.preflight(
        request.venue, request.proposal, request.policy, request.context,
        request.quote_request, request.idempotency_key,
    )
    return {"decision": decision.model_dump(mode="json"), "quote": quote.model_dump(mode="json")}


@app.post("/internal/dispatch")
async def dispatch(request: DispatchRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    decision = ExecutionDecision.model_validate(request.decision)
    return await gateway.execute_or_simulate(
        request.venue, request.request, decision, request.idempotency_key,
        request.wrapped_credential, request.account_context,
    )


@app.post("/internal/cancel")
async def cancel(request: VenueMutationRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    return await gateway.credential_mutation(
        "cancel", request.venue, request.request,
        request.wrapped_credential, request.account_context,
    )


@app.post("/internal/close")
async def close(request: VenueMutationRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    return await gateway.credential_mutation(
        "close", request.venue, request.request,
        request.wrapped_credential, request.account_context,
    )


@app.post("/internal/reconcile")
async def reconcile(request: ReconcileRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    if request.venue not in gateway.adapters:
        raise HTTPException(status_code=404, detail="Venue not found")
    return await gateway.adapters[request.venue].reconcile(request.account)
