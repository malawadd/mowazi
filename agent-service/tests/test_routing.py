from datetime import UTC, datetime, timedelta

from moeazi_agent.routing_contracts import (
    MarketListing,
    PublicVenueSnapshot,
    RouteRequest,
    VenueId,
    VenueLevel,
)
from moeazi_agent.routing_math import build_quote, ranked
from moeazi_agent.routing_adapters import canonical_market, leverage_from_margin_fraction


def snapshot(venue: VenueId, fee_bps: float = 1, observed_at=None):
    return PublicVenueSnapshot(
        venue=venue,
        market_id="BTC",
        mid_price=100,
        bid_price=99.99,
        ask_price=100.01,
        bids=[VenueLevel(price=99.99, size=100)],
        asks=[VenueLevel(price=100.01, size=100)],
        max_leverage=50,
        taker_fee_bps=fee_bps,
        observed_at=observed_at or datetime.now(UTC),
        source="test",
    )


def request(ready=None, override=None):
    return RouteRequest(
        market_id="BTC", side="long", margin_usd=100, leverage=5,
        slippage_cap_bps=75, ready_venues=ready or [], override_venue=override,
    )


MARKET = MarketListing(
    market_id="BTC", label="BTC Perp", base_symbol="BTC", max_leverage=50,
    venues=[VenueId.HYPERLIQUID, VenueId.LIGHTER],
)


def test_cheapest_public_venue_can_require_setup_while_runner_up_is_executable():
    route = request([VenueId.HYPERLIQUID])
    lighter = build_quote(route, MARKET, snapshot(VenueId.LIGHTER, fee_bps=0), VenueId.LIGHTER)
    hyperliquid = build_quote(route, MARKET, snapshot(VenueId.HYPERLIQUID, fee_bps=4.5), VenueId.HYPERLIQUID)
    assert ranked([lighter, hyperliquid])[0].venue == VenueId.LIGHTER
    assert ranked([lighter, hyperliquid], executable_only=True)[0].venue == VenueId.HYPERLIQUID
    assert lighter.setup_requirement == "Enable Lighter for this strategy account."


def test_stale_and_unlisted_quotes_are_excluded():
    route = request([VenueId.HYPERLIQUID])
    stale = snapshot(VenueId.HYPERLIQUID, observed_at=datetime.now(UTC) - timedelta(minutes=2))
    quote = build_quote(route, MARKET, stale, VenueId.HYPERLIQUID)
    assert not quote.market_eligible
    assert quote.reason == "Public quote is stale."


def test_tie_breaker_is_stable_by_priority():
    route = request([VenueId.HYPERLIQUID, VenueId.LIGHTER])
    quotes = [
        build_quote(route, MARKET, snapshot(VenueId.LIGHTER), VenueId.LIGHTER),
        build_quote(route, MARKET, snapshot(VenueId.HYPERLIQUID), VenueId.HYPERLIQUID),
    ]
    assert ranked(quotes)[0].venue == VenueId.HYPERLIQUID


def test_slippage_cap_blocks_insufficient_route():
    route = request([VenueId.HYPERLIQUID])
    route.slippage_cap_bps = 0
    quote = build_quote(route, MARKET, snapshot(VenueId.HYPERLIQUID), VenueId.HYPERLIQUID)
    assert not quote.market_eligible
    assert "slippage cap" in (quote.reason or "")


def test_venue_metadata_normalization_handles_native_formats():
    assert canonical_market("BTC/USD [BTC-USDC]") == "BTC"
    assert canonical_market("PERP_ETH_USDC") == "ETH"
    assert leverage_from_margin_fraction(200) == 50
