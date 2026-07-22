import json
from typing import Literal

from fastapi import APIRouter, Header, HTTPException
from pydantic import BaseModel, Field, SecretStr
from sqlalchemy.ext.asyncio import create_async_engine

from .config import get_settings
from .convex import ConvexWorkerClient
from .provider_catalog import list_models, probe_model
from .provider_credentials import ProviderSecretVault, zero_secret


router = APIRouter(prefix="/v1/providers", tags=["model providers"])
settings = get_settings()
engine = create_async_engine(settings.postgres_dsn, pool_pre_ping=True)
vault = ProviderSecretVault(settings, engine)


class ConnectionCreate(BaseModel):
    provider: Literal["openai", "deepseek"]
    label: str = Field(min_length=2, max_length=60)
    api_key: SecretStr


class ConnectionRotate(BaseModel):
    api_key: SecretStr


class ModelProbeRequest(BaseModel):
    model: str = Field(pattern=r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")


def authorize(value: str | None, subject: str | None) -> str:
    if value != f"Bearer {settings.worker_shared_secret.get_secret_value()}" or not subject:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not settings.byok_enabled:
        raise HTTPException(status_code=404, detail="BYOK is disabled")
    if (
        settings.byok_secret_backend == "local"
        and not settings.master_key.get_secret_value()
    ):
        raise HTTPException(status_code=503, detail="Local BYOK vault requires MASTER_KEY")
    if settings.byok_secret_backend == "aws_kms" and not settings.byok_aws_kms_key_id:
        raise HTTPException(status_code=503, detail="BYOK vault requires an AWS KMS key")
    return subject


async def details(subject: str, connection_id: str) -> dict:
    row = await ConvexWorkerClient(settings).command(
        "getProviderConnectionForWorker", subject=subject, connectionId=connection_id,
    )
    if not row:
        raise HTTPException(status_code=404, detail="Provider connection not found")
    return row


async def with_secret(row: dict, operation):
    secret = await vault.retrieve(row["secretRef"])
    try:
        return await operation(secret.decode())
    finally:
        zero_secret(secret)


@router.post("/connections")
async def create_connection(
    request: ConnectionCreate, authorization: str | None = Header(default=None),
    x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    api_key = request.api_key.get_secret_value()
    try:
        models = await list_models(request.provider, api_key, settings)
        if not models:
            raise RuntimeError("Provider returned no accessible models")
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Provider key could not be verified") from exc
    stored = await vault.store(subject, request.provider, api_key)
    payload = {
        "subject": subject, "provider": request.provider, "label": request.label.strip(),
        "secretRef": stored.secret_ref, "keyFingerprint": stored.fingerprint,
        "keyLast4": stored.last4, "modelsJson": json.dumps(models, separators=(",", ":")),
        "capabilitiesJson": '{"compatibleModels":[]}', "status": "verified",
    }
    try:
        connection_id = await ConvexWorkerClient(settings).command("recordProviderConnection", **payload)
    except Exception:
        await vault.revoke(stored.secret_ref)
        raise
    return {"connectionId": connection_id, "status": "verified", "models": models}


@router.get("/connections/{connection_id}/models")
async def refresh_models(
    connection_id: str, authorization: str | None = Header(default=None),
    x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    row = await details(subject, connection_id)
    if row["status"] == "revoked":
        raise HTTPException(status_code=409, detail="Provider connection is revoked")
    try:
        models = await with_secret(row, lambda key: list_models(row["provider"], key, settings))
    except Exception as exc:
        await ConvexWorkerClient(settings).command(
            "updateProviderConnection", subject=subject, connectionId=connection_id,
            status="invalid", failureReason=str(exc)[:300],
        )
        raise HTTPException(status_code=400, detail="Provider model discovery failed") from exc
    await ConvexWorkerClient(settings).command(
        "updateProviderConnection", subject=subject, connectionId=connection_id,
        status="verified", modelsJson=json.dumps(models, separators=(",", ":")),
    )
    return {"models": models}


@router.post("/connections/{connection_id}/probe")
async def test_model(
    connection_id: str, request: ModelProbeRequest,
    authorization: str | None = Header(default=None), x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    row = await details(subject, connection_id)
    try:
        result = await with_secret(
            row, lambda key: probe_model(row["provider"], request.model, key, settings),
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail="Model failed the structured-output probe") from exc
    capabilities = json.loads(row.get("capabilitiesJson") or "{}")
    compatible = set(capabilities.get("compatibleModels") or [])
    compatible.add(request.model)
    capabilities["compatibleModels"] = sorted(compatible)
    await ConvexWorkerClient(settings).command(
        "updateProviderConnection", subject=subject, connectionId=connection_id,
        status="verified", capabilitiesJson=json.dumps(capabilities, separators=(",", ":")),
    )
    return {"compatible": True, "model": request.model, "probe": result}


@router.patch("/connections/{connection_id}")
async def rotate_connection(
    connection_id: str, request: ConnectionRotate,
    authorization: str | None = Header(default=None), x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    current = await details(subject, connection_id)
    api_key = request.api_key.get_secret_value()
    stored = await vault.store(subject, current["provider"], api_key)
    try:
        models = await list_models(current["provider"], api_key, settings)
        if not models:
            raise RuntimeError("Provider returned no accessible models")
    except Exception as exc:
        await vault.revoke(stored.secret_ref)
        raise HTTPException(status_code=400, detail="Replacement key could not be verified") from exc
    await ConvexWorkerClient(settings).command(
        "updateProviderConnection", subject=subject, connectionId=connection_id,
        status="verified", secretRef=stored.secret_ref, keyFingerprint=stored.fingerprint,
        keyLast4=stored.last4, modelsJson=json.dumps(models, separators=(",", ":")),
        capabilitiesJson='{"compatibleModels":[]}',
    )
    await vault.revoke(current["secretRef"])
    return {"connectionId": connection_id, "status": "verified", "models": models}


@router.delete("/connections/{connection_id}")
async def revoke_connection(
    connection_id: str, authorization: str | None = Header(default=None),
    x_moeazi_subject: str | None = Header(default=None),
):
    subject = authorize(authorization, x_moeazi_subject)
    row = await details(subject, connection_id)
    await vault.revoke(row["secretRef"])
    return await ConvexWorkerClient(settings).command(
        "updateProviderConnection", subject=subject, connectionId=connection_id, status="revoked",
    )
