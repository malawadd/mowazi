import pytest

from moeazi_agent.venues import UniswapTradingApiAdapter


def test_swap_body_spreads_quote_and_strips_null_permit():
    quote = {"quote": {"routing": "CLASSIC"}, "permitData": None, "requestId": "q1"}
    body = UniswapTradingApiAdapter.swap_body(quote)
    assert body["quote"] == quote["quote"]
    assert "permitData" not in body


def test_swap_body_adds_signature_for_permit():
    body = UniswapTradingApiAdapter.swap_body({"permitData": {"domain": {}}}, "0xsigned")
    assert body["signature"] == "0xsigned"


def test_prebroadcast_validation_rejects_empty_calldata():
    with pytest.raises(ValueError, match="data"):
        UniswapTradingApiAdapter.validate_transaction({"to": "0x" + "1" * 40, "data": "0x", "value": "0"})
