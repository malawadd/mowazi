"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import {
  canonicalHyperliquidCoin,
  findHyperliquidMarket,
  tradePathForCoin,
  vizPathForCoin,
} from "@/lib/trade/hyperliquidMarkets";
import { formatNumber } from "@/lib/trade/format";
import { DEFAULT_TRADE_SETTINGS } from "@/lib/trade/markets";
import { loadRoutingMarkets, previewBestRoute } from "@/lib/trade/routeBackend";
import { buildTradeTicketLimits } from "@/lib/trade/ticketLimits";
import type { BestExecutionQuote, PerpMarket, TradeSettings, TradeVenueId } from "@/lib/trade/types";
import BestExecutionTable from "./BestExecutionTable";
import AgentStatusRail from "./AgentStatusRail";
import LiveChart from "./LiveChart";
import MarketHeader from "./MarketHeader";
// import MarketPanel from "./MarketPanel";
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
  const integrations = useQuery(api.venueIntegrations.getVenueIntegrations, {});
  const saveSettings = useMutation(api.trade.setTradeSettings);
  const { session } = useParticleSession();

  const settings = dashboard?.settings ?? publicConfig?.settings ?? DEFAULT_TRADE_SETTINGS;
  const [markets, setMarkets] = useState<PerpMarket[]>([]);
  const [marketError, setMarketError] = useState<string | null>(null);
  const [interval, setInterval] = useState("1h");
  const [selectedCoin, setSelectedCoin] = useState(() => canonicalHyperliquidCoin(initialCoin));
  const [ticket, setTicket] = useState<TicketState>(() => ticketFromSettings(DEFAULT_TRADE_SETTINGS));
  const [quote, setQuote] = useState<BestExecutionQuote | null>(null);
  const [overrideVenue, setOverrideVenue] = useState<TradeVenueId | null>(null);
  const [busy, setBusy] = useState<"markets" | "preview" | "submit" | "save" | null>("markets");
  const [message, setMessage] = useState<string | null>(null);

  const selectedMarket = useMemo(
    () => findHyperliquidMarket(markets, selectedCoin) ?? markets[0] ?? null,
    [markets, selectedCoin],
  );
  const feed = useHyperliquidFeed(selectedMarket, interval);
  const ownerAddress = dashboard?.accountWallet?.ownerAddress ?? null;
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
    const price = feed.snapshot?.markPrice ?? selectedMarket?.markPrice ?? null;
    const label = selectedCoin
      ? price !== null
        ? `${selectedCoin} | $${formatNumber(price, selectedMarket?.pricePrecision ?? 2)} | Moeazi`
        : `${selectedCoin} · Moeazi`
      : "Moeazi";
    document.title = label;
  }, [selectedCoin, feed.snapshot?.markPrice, selectedMarket?.markPrice, selectedMarket?.pricePrecision]);

  useEffect(() => {
    setSelectedCoin(canonicalHyperliquidCoin(initialCoin));
  }, [initialCoin]);

  useEffect(() => {
    let cancelled = false;
    async function refreshMarkets() {
      setBusy("markets");
      try {
        const liveMarkets = await loadRoutingMarkets();
        if (!cancelled) setMarkets(liveMarkets);
      } catch (error) {
        if (!cancelled) setMarketError(error instanceof Error ? error.message : String(error));
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void refreshMarkets();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (markets.length === 0) return;
    const next = findHyperliquidMarket(markets, selectedCoin);
    if (!next) {
      setMarketError(`No connected routing venue lists ${selectedCoin}.`);
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
        const readyVenues = (integrations?.integrations ?? [])
          .filter((item) => item.ready)
          .map((item) => item.venue as TradeVenueId);
        const nextQuote = await previewBestRoute({
          input: {
            marketId: selectedMarket.id, side: ticket.side,
            marginUsd: Number(ticket.marginUsd), leverage: Number(ticket.leverage),
            holdTimeHours: maybeNumber(ticket.expectedHoldHours),
            slippageCapBps: Number(ticket.slippageCapBps),
          },
          readyVenues,
          overrideVenue,
        });
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
    [integrations?.integrations, overrideVenue, selectedMarket, ticket],
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
    try {
      const currentQuote = await requestQuote(false);
      if (!currentQuote?.winningVenue) throw new Error("No fresh executable route is available.");
      const venue = currentQuote.quotes.find((item) => item.venue === currentQuote.winningVenue);
      setMessage(`Read-only simulation selected ${venue?.venueLabel ?? currentQuote.winningVenue}. No funds moved and nothing was signed.`);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      setMessage(errorMessage);
    } finally {
      setBusy(null);
    }
  };

  if (!selectedMarket) return <div className={styles.terminal}><p className={styles.emptyText}>{marketError ?? "Loading Hyperliquid markets..."}</p></div>;

  return (
    <div className={styles.terminal}>
      <MarketHeader market={selectedMarket} markets={markets} snapshot={feed.snapshot} status={feed.status} action={{ href: vizPathForCoin(selectedCoin), label: "View Viz", kind: "viz" }} onSelectMarket={(coin) => { setSelectedCoin(canonicalHyperliquidCoin(coin)); window.history.replaceState(null, "", tradePathForCoin(coin)); }} />
      <AgentStatusRail marketId={selectedMarket.id} />
      <div className={styles.terminalGrid}>
        {/* <MarketPanel markets={markets} selectedMarket={selectedMarket} onSelectMarket={(coin) => router.push(tradePathForCoin(coin))} /> */}
        <div className={styles.chartColumn}>
          <LiveChart candles={feed.candles} interval={interval} onIntervalChange={setInterval} onLoadMore={feed.loadMoreCandles} />
          <BestExecutionTable quote={quote} overrideVenue={overrideVenue} onOverride={(venue) => { setOverrideVenue(venue); setQuote(null); }} />
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
