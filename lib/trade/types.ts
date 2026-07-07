export type TradeVenueId = "hyperliquid" | "lighter" | "orderly" | "gmx" | "ostium";

export type TradeSide = "long" | "short";

export type MarketCategory = "crypto" | "rwa";

export type CostBreakdown = {
  entryFeeUsd: number;
  exitFeeUsd: number;
  transferCostUsd: number;
  entrySlippageUsd: number;
  exitSlippageUsd: number;
  fundingUsd: number;
  totalCostUsd: number;
};

export type PerpMarket = {
  id: string;
  label: string;
  baseSymbol: string;
  quoteSymbol: "USDC";
  category: MarketCategory;
  pricePrecision: number;
  maxLeverage: number;
  venues: TradeVenueId[];
};

export type VenueCapabilities = {
  venue: TradeVenueId;
  label: string;
  kind: "clob" | "onchain";
  maxLeverage: number;
  minNotionalUsd: number;
  takerFeeBps: number;
  makerFeeBps: number;
  transferCostUsd: number;
};

export type VenueSnapshot = {
  venue: TradeVenueId;
  marketId: string;
  midPrice: number;
  bidPrice: number;
  askPrice: number;
  entryImpactBps: number;
  exitImpactBps: number;
  fundingRateHourly: number;
  openInterestUsd: number;
  volume24hUsd: number;
  fetchedAt: number;
  source: "public" | "fixture";
};

export type RouteInput = {
  marketId: string;
  side: TradeSide;
  marginUsd: number;
  leverage: number;
  holdTimeHours?: number | null;
  slippageCapBps: number;
  now?: number;
};

export type VenueQuote = {
  venue: TradeVenueId;
  venueLabel: string;
  kind: "clob" | "onchain";
  eligible: boolean;
  reason?: string;
  source: "public" | "fixture";
  midPrice: number | null;
  estimatedEntryPrice: number | null;
  estimatedExitPrice: number | null;
  notionalUsd: number;
  marginUsd: number;
  maxLeverage: number;
  feeRateBps: number;
  freshnessMs: number | null;
  costs: CostBreakdown;
};

export type BestExecutionQuote = {
  input: RouteInput;
  market: PerpMarket;
  notionalUsd: number;
  benchmarkVenue: TradeVenueId | null;
  winningVenue: TradeVenueId | null;
  quotes: VenueQuote[];
  createdAt: number;
};

export type TradeSettings = {
  defaultMarketId: string;
  defaultLeverage: number;
  defaultMarginUsd: number;
  slippageCapBps: number;
  expectedHoldHours: number | null;
  requireConfirmation: boolean;
};

export type PerpVenueAdapter = {
  venue: TradeVenueId;
  getQuote(input: RouteInput): Promise<VenueSnapshot | null>;
};
