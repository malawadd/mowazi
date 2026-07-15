from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel

from .config import get_settings
from .contracts import TradeProposal
from .execution import ExecutionGateway
from .policy import AutomationPolicy, RiskContext


settings = get_settings()
gateway = ExecutionGateway(settings)
app = FastAPI(title="Moeazi Execution Gateway", version="0.1.0")


class PreflightRequest(BaseModel):
    venue: str
    proposal: TradeProposal
    policy: AutomationPolicy
    context: RiskContext
    quote_request: dict
    idempotency_key: str


def authorize(value: str | None) -> None:
    if value != f"Bearer {settings.worker_shared_secret.get_secret_value()}":
        raise HTTPException(status_code=401, detail="Unauthorized")


@app.get("/health")
async def health():
    venues = {name: (await adapter.health()).model_dump() for name, adapter in gateway.adapters.items()}
    return {"status": "ok", "venues": venues}


@app.post("/internal/preflight")
async def preflight(request: PreflightRequest, authorization: str | None = Header(default=None)):
    authorize(authorization)
    decision, quote = await gateway.preflight(
        request.venue, request.proposal, request.policy, request.context,
        request.quote_request, request.idempotency_key,
    )
    return {"decision": decision.model_dump(mode="json"), "quote": quote.model_dump(mode="json")}
