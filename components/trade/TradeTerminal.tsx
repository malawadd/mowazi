"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useAction, useMutation, useQuery } from "convex/react";
import { useWallets } from "@particle-network/connectkit";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { HYPERLIQUID_BRIDGE_ADDRESS, readHyperliquidAccountState, waitForHyperliquidCredit } from "@/lib/trade/hyperliquidApi";
import { canUseUaForHyperliquid, fundingAmountNeeded } from "@/lib/trade/hyperliquidFunding";
import {
  canonicalHyperliquidCoin,
  findHyperliquidMarket,
  getLiveHyperliquidMarkets,
  tradePathForCoin,
} from "@/lib/trade/hyperliquidMarkets";
import { submitHyperliquidMarketOrder } from "@/lib/trade/hyperliquidOrder";
import { normalizeOptionalHours } from "@/lib/trade/intents";
import { DEFAULT_TRADE_SETTINGS } from "@/lib/trade/markets";
import { buildTradeTicketLimits } from "@/lib/trade/ticketLimits";
import type { BestExecutionQuote, PerpMarket, TradeSettings } from "@/lib/trade/types";
import BestExecutionTable from "./BestExecutionTable";
import LiveChart from "./LiveChart";
import MarketHeader from "./MarketHeader";
import MarketPanel from "./MarketPanel";
import OrderFlowPanel from "./OrderFlowPanel";
import TerminalTabs from "./TerminalTabs";
import TradeTicket, { type TicketState } from "./TradeTicket";
import { useHyperliquidAccount } from "./useHyperliquidAccount";
import { useHyperliquidFeed } from "./useHyperliquidFeed";
import styles from "./trade-ui.module.css";

function ticketFromSettings(settings: TradeSettings): TicketState {
  return {
    side: "long",
    marginUsd: String(settings.defaultMarginUsd),
    leverage: String(settings.defaultLeverage),
    slippageCapBps: String(settings.slippageCapBps),
    expectedHoldHours: settings.expectedHoldHours ? String(settings.expectedHoldHours) : "",
  };
}

const maybeNumber = (value: string) => (value.trim() ? Number(value) : undefined);

export default function TradeTerminal({ initialCoin }: { initialCoin: string }) {
  const router = useRouter();
  const dashboard = useQuery(api.trade.getTradeDashboard, {});
  const publicConfig = useQuery(api.trade.getPublicTradeConfig, {});
  const loadMarkets = useAction(api.trade.getHyperliquidMarkets);
  const previewRoute = useAction(api.trade.previewPerpRoute);
  const recordIntent = useMutation(api.trade.recordTradeIntent);
  const recordFunding = useMutation(api.trade.recordVenueFunding);
  const recordExecution = useMutation(api.trade.recordTradeExecution);
  const saveSettings = useMutation(api.trade.setTradeSettings);
  const { session } = useParticleSession();
  const [primaryWallet] = useWallets();
  const ua = useUniversalAccount("eip7702-if-supported");

  const settings = dashboard?.settings ?? publicConfig?.settings ?? DEFAULT_TRADE_SETTINGS;
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [interval, setInterval] = useState("1h");
  const [selectedCoin, setSelectedCoin] = useState(() => canonicalHyperliquidCoin(initialCoin));
  const [ticket, setTicket] = useState<TicketState>(() => ticketFromSettings(DEFAULT_TRADE_SETTINGS));
  const [quote, setQuote] = useState<BestExecutionQuote | null>(null);
  const [busy, setBusy] = useState<"markets" | "preview" | "submit" | "save" | null>("markets");
  const [message, setMessage] = useState<string | null>(null);

  const selectedMarket = useMemo(
    () => findHyperliquidMarket(markets, selectedCoin) ?? markets[0] ?? null,
    [markets, selectedCoin],
  );
  const feed = useHyperliquidFeed(selectedMarket, interval);
  const ownerAddress = ua.ownerAddress ?? dashboard?.accountWallet?.ownerAddress ?? null;
  const hlAccount = useHyperliquidAccount(session ? ownerAddress : null);
  const accountCollateralUsd = session
    ? (dashboard?.accountWallet?.unifiedBalanceUsd ?? 0) + hlAccount.accountValueUsd
    : null;
  const limits = useMemo(
    () =>
      buildTradeTicketLimits({
        snapshot: feed.snapshot,
        side: ticket.side,
        leverage: Number(ticket.leverage),
        slippageCapBps: Number(ticket.slippageCapBps),
        marketMaxLeverage: selectedMarket?.maxLeverage,
        accountCollateralUsd,
      }),
    [accountCollateralUsd, feed.snapshot, selectedMarket?.maxLeverage, ticket.leverage, ticket.side, ticket.slippageCapBps],
  );

  useEffect(() => {
    setSelectedCoin(canonicalHyperliquidCoin(initialCoin));
  }, [initialCoin]);

  useEffect(() => {
    let cancelled = false;
    async function refreshMarkets() {
      setBusy("markets");
      try {
        const liveMarkets = await getLiveHyperliquidMarkets();
        if (!cancelled) setMarkets(liveMarkets);
      } catch {
        try {
          const result = await loadMarkets({});
          if (!cancelled) setMarkets(result.markets);
        } catch (error) {
          if (!cancelled) setMarketError(error instanceof Error ? error.message : String(error));
        }
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void refreshMarkets();
    return () => {
      cancelled = true;
    };
  }, [loadMarkets]);

  useEffect(() => {
    if (markets.length === 0) return;
    const next = findHyperliquidMarket(markets, selectedCoin);
    if (!next) {
      setMarketError(`Hyperliquid does not list ${selectedCoin}.`);
      router.replace(tradePathForCoin(settings.defaultMarketId));
    } else {
      setMarketError(null);
    }
  }, [markets, router, selectedCoin, settings.defaultMarketId]);

  useEffect(() => {
    if (!dashboard?.settings) return;
    setTicket((current) => ({ ...ticketFromSettings(dashboard.settings), side: current.side }));
  }, [dashboard?.settings]);

  useEffect(() => {
    if (!selectedMarket) return;
    setTicket((current) => {
      const nextLeverage = Math.min(Math.max(1, Number(current.leverage) || 1), selectedMarket.maxLeverage);
      return { ...current, leverage: String(nextLeverage) };
    });
  }, [selectedMarket]);

  const patchTicket = (patch: Partial<TicketState>) => {
    setTicket((current) => ({ ...current, ...patch }));
    setQuote(null);
  };

  const requestQuote = useCallback(
    async (showBusy: boolean) => {
      if (!selectedMarket) return null;
      if (showBusy) setBusy("preview");
      setMessage(null);
      try {
        const nextQuote = (await previewRoute({
          coin: selectedMarket.id,
          side: ticket.side,
          marginUsd: Number(ticket.marginUsd),
          leverage: Number(ticket.leverage),
          expectedHoldHours: maybeNumber(ticket.expectedHoldHours),
          slippageCapBps: Number(ticket.slippageCapBps),
          marketMetadataJson: JSON.stringify(selectedMarket),
        })) as BestExecutionQuote;
        setQuote(nextQuote);
        setMessage(nextQuote.winningVenue ? "Live route preview ready." : "No live venue can execute this trade.");
        return nextQuote;
      } catch (error) {
        setMessage(error instanceof Error ? error.message : String(error));
        return null;
      } finally {
        if (showBusy) setBusy(null);
      }
    },
    [previewRoute, selectedMarket, ticket],
  );

  const saveDefaults = async () => {
    if (!session || !selectedMarket) {
      router.push(`/sign-in?redirect=${encodeURIComponent(tradePathForCoin(selectedCoin))}`);
      return;
    }
    setBusy("save");
    setMessage(null);
    try {
      await saveSettings({
        defaultMarketId: selectedMarket.id,
        defaultLeverage: Number(ticket.leverage),
        defaultMarginUsd: Number(ticket.marginUsd),
        slippageCapBps: Number(ticket.slippageCapBps),
        expectedHoldHours: maybeNumber(ticket.expectedHoldHours),
        requireConfirmation: settings.requireConfirmation,
      });
      setMessage("Trade defaults saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  const submit = async () => {
    if (!session || !selectedMarket) {
      router.push(`/sign-in?redirect=${encodeURIComponent(tradePathForCoin(selectedCoin))}`);
      return;
    }
    if (Number(ticket.marginUsd) > limits.maxMarginUsd) {
      setMessage("Margin exceeds the current live limit.");
      return;
    }
    setBusy("submit");
    setMessage(null);
    let intentId: Id<"tradeIntents"> | null = null;
    try {
      const currentQuote = await requestQuote(false);
      if (!currentQuote?.winningVenue) throw new Error("No fresh executable route is available.");
      const intent = (await recordIntent({
        marketId: selectedMarket.id,
        coin: selectedMarket.id,
        assetIndex: selectedMarket.assetIndex,
        side: ticket.side,
        marginUsd: Number(ticket.marginUsd),
        leverage: Number(ticket.leverage),
        expectedHoldHours: normalizeOptionalHours(maybeNumber(ticket.expectedHoldHours)) ?? undefined,
        slippageCapBps: Number(ticket.slippageCapBps),
        selectedVenue: "hyperliquid",
        marketMetadataJson: JSON.stringify(selectedMarket),
        quoteJson: JSON.stringify(currentQuote),
      })) as { _id: Id<"tradeIntents"> };
      const createdIntentId = intent._id;
      intentId = createdIntentId;
      const refreshed = ua.accountInfo ? null : await ua.refresh();
      const accountInfo = ua.accountInfo ?? refreshed?.accountInfo ?? null;
      const compatibility = canUseUaForHyperliquid({ ownerAddress: ua.ownerAddress, evmUaAddress: accountInfo?.evmSmartAccount });
      if (!compatibility.ok) throw new Error(compatibility.reason ?? "Particle UA is not Hyperliquid-compatible.");
      const owner = ua.ownerAddress!;
      const venueAccount = await readHyperliquidAccountState(owner);
      const fundingNeeded = fundingAmountNeeded({ marginUsd: Number(ticket.marginUsd), venueAccountValueUsd: venueAccount.accountValueUsd });
      if (fundingNeeded > 0) {
        const transfer = await ua.createSettledTransfer({ amount: fundingNeeded.toFixed(2), receiver: HYPERLIQUID_BRIDGE_ADDRESS });
        const fundingResult = await ua.signAndSend(transfer);
        await recordFunding({ intentId: createdIntentId, amountUsd: fundingNeeded, particleTransactionId: fundingResult.transactionId, detailsJson: JSON.stringify(fundingResult) });
        await waitForHyperliquidCredit(owner, Number(ticket.marginUsd));
        await recordFunding({ intentId: createdIntentId, amountUsd: fundingNeeded, confirmed: true });
      }
      await recordExecution({ intentId: createdIntentId, status: "order_submitting" });
      const execution = await submitHyperliquidMarketOrder({
        market: selectedMarket,
        side: ticket.side,
        marginUsd: Number(ticket.marginUsd),
        leverage: Number(ticket.leverage),
        slippageCapBps: Number(ticket.slippageCapBps),
        account: owner,
        walletClient: primaryWallet?.getWalletClient(),
      });
      await recordExecution({ intentId: createdIntentId, status: "open", executionJson: JSON.stringify(execution) });
      setMessage("Hyperliquid order submitted.");
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (intentId) await recordExecution({ intentId, status: "failed", errorMessage }).catch(() => undefined);
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  if (!selectedMarket) return <div className={styles.terminal}><p className={styles.emptyText}>{marketError ?? "Loading Hyperliquid markets..."}</p></div>;

  return (
    <div className={styles.terminal}>
      <MarketHeader market={selectedMarket} markets={markets} snapshot={feed.snapshot} status={feed.status} onSelectMarket={(coin) => { setSelectedCoin(canonicalHyperliquidCoin(coin)); window.history.replaceState(null, "", tradePathForCoin(coin)); }} />
      <div className={styles.terminalGrid}>
        {/* <MarketPanel markets={markets} selectedMarket={selectedMarket} onSelectMarket={(coin) => router.push(tradePathForCoin(coin))} /> */}
        <div className={styles.chartColumn}>
          <LiveChart candles={feed.candles} interval={interval} onIntervalChange={setInterval} onLoadMore={feed.loadMoreCandles} />
          <BestExecutionTable quote={quote} />
        </div>
        <OrderFlowPanel market={selectedMarket} snapshot={feed.snapshot} trades={feed.trades} />
        <TradeTicket
          market={selectedMarket}
          state={ticket}
          quote={quote}
          signedIn={Boolean(session)}
          previewing={busy === "preview" || busy === "markets"}
          submitting={busy === "submit"}
          saving={busy === "save"}
          message={message ?? marketError ?? feed.error}
          limits={limits}
          onChange={patchTicket}
          onPreview={() => void requestQuote(true)}
          onSubmit={submit}
          onSaveDefaults={saveDefaults}
        />
      </div>
      <TerminalTabs signedIn={Boolean(session)} accountWallet={dashboard?.accountWallet ?? null} settings={settings} intents={dashboard?.queuedIntents ?? []} hyperliquid={hlAccount} />
    </div>
  );
}
