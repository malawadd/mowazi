from datetime import datetime, timedelta, timezone

from .contracts import MarketSynthesis, ProtectiveExits, TradeProposal


def proposal_from_synthesis(
    synthesis: MarketSynthesis,
    reports: list[dict],
    account_id: str,
    policy: dict,
) -> TradeProposal | None:
    if abs(synthesis.consensus) < 0.12 or synthesis.confidence < 0.35:
        return None
    evidence_ids = []
    for report in reports:
        for item in report.get("evidence", []):
            identifier = item.get("id")
            if identifier and identifier not in evidence_ids:
                evidence_ids.append(identifier)
    venues = policy.get("allowedVenues") or ["hyperliquid"]
    size = min(float(policy.get("maxOrderUsd", 25)), 25.0)
    leverage = min(float(policy.get("maxLeverage", 2)), 2.0)
    return TradeProposal(
        account_id=account_id,
        market=synthesis.market,
        side="long" if synthesis.consensus > 0 else "short",
        candidate_venues=venues,
        size_usd=max(1.0, size),
        leverage=max(1.0, leverage),
        order_type="market",
        max_slippage_bps=min(int(policy.get("maxSlippageBps", 75)), 75),
        protective_exits=ProtectiveExits(),
        evidence_ids=evidence_ids[:30],
        analysis_id=synthesis.analysis_id,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=2),
    )
