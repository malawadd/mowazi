"use client";

import { useEffect, useMemo, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { DEFAULT_TRADE_SETTINGS, PERP_MARKETS } from "@/lib/trade/markets";
import type { BestExecutionQuote, TradeSettings } from "@/lib/trade/types";
import BestExecutionTable from "./BestExecutionTable";
import MarketPanel from "./MarketPanel";
import TradeSidePanels from "./TradeSidePanels";
import TradeTicket, { type TicketState } from "./TradeTicket";
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

function optionalNumber(value: string) {
  if (!value.trim()) return undefined;
  return Number(value);
}

export default function TradeTerminal() {
  const dashboard = useQuery(api.trade.getTradeDashboard, {});
  const previewRoute = useAction(api.trade.previewPerpRoute);
  const queueIntent = useMutation(api.trade.queueTradeIntent);
  const cancelIntent = useMutation(api.trade.cancelTradeIntent);
  const saveSettings = useMutation(api.trade.setTradeSettings);
  const [selectedMarketId, setSelectedMarketId] = useState(DEFAULT_TRADE_SETTINGS.defaultMarketId);
  const [ticket, setTicket] = useState<TicketState>(() => ticketFromSettings(DEFAULT_TRADE_SETTINGS));
  const [quote, setQuote] = useState<BestExecutionQuote | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [queueing, setQueueing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [showFallback, setShowFallback] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShowFallback(true), 1600);
    return () => window.clearTimeout(timer);
  }, []);

  const viewModel =
    dashboard ??
    (showFallback
      ? {
          markets: PERP_MARKETS,
          settings: DEFAULT_TRADE_SETTINGS,
          accountWallet: null,
          queuedIntents: [],
        }
      : null);
  const settings = viewModel?.settings ?? DEFAULT_TRADE_SETTINGS;
  const markets = viewModel?.markets ?? PERP_MARKETS;
  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? markets[0] ?? PERP_MARKETS[0],
    [markets, selectedMarketId],
  );

  useEffect(() => {
    if (!dashboard?.settings) return;
    setSelectedMarketId(dashboard.settings.defaultMarketId);
    setTicket((current) => ({ ...ticketFromSettings(dashboard.settings), side: current.side }));
  }, [dashboard?.settings]);

  const patchTicket = (patch: Partial<TicketState>) => {
    setTicket((current) => ({ ...current, ...patch }));
    setQuote(null);
  };

  const preview = async () => {
    setPreviewing(true);
    setMessage(null);
    try {
      const nextQuote = await previewRoute({
        marketId: selectedMarket.id,
        side: ticket.side,
        marginUsd: Number(ticket.marginUsd),
        leverage: Number(ticket.leverage),
        expectedHoldHours: optionalNumber(ticket.expectedHoldHours),
        slippageCapBps: Number(ticket.slippageCapBps),
      });
      setQuote(nextQuote as BestExecutionQuote);
      setMessage(nextQuote.winningVenue ? "Route preview ready." : "No eligible venue for this trade.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewing(false);
    }
  };

  const queue = async () => {
    if (!quote?.winningVenue) return;
    setQueueing(true);
    setMessage(null);
    try {
      await queueIntent({
        marketId: selectedMarket.id,
        side: ticket.side,
        marginUsd: Number(ticket.marginUsd),
        leverage: Number(ticket.leverage),
        expectedHoldHours: optionalNumber(ticket.expectedHoldHours),
        slippageCapBps: Number(ticket.slippageCapBps),
        selectedVenue: quote.winningVenue,
        quoteJson: JSON.stringify(quote),
      });
      setMessage("Trade intent queued. No collateral moved in V1.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setQueueing(false);
    }
  };

  const saveDefaults = async () => {
    setSaving(true);
    setMessage(null);
    try {
      await saveSettings({
        defaultMarketId: selectedMarket.id,
        defaultLeverage: Number(ticket.leverage),
        defaultMarginUsd: Number(ticket.marginUsd),
        slippageCapBps: Number(ticket.slippageCapBps),
        expectedHoldHours: optionalNumber(ticket.expectedHoldHours),
        requireConfirmation: settings.requireConfirmation,
      });
      setMessage("Trade defaults saved.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const cancelQueuedIntent = async (intentId: string) => {
    setCancellingId(intentId);
    setMessage(null);
    try {
      await cancelIntent({ intentId: intentId as Id<"tradeIntents">, reason: "Cancelled from /trade." });
      setMessage("Queued intent cancelled.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setCancellingId(null);
    }
  };

  if (!viewModel) {
    return (
      <section className={styles.panel}>
        <div className={styles.panelBody}>
          <p className={styles.muted}>Loading trading account...</p>
        </div>
      </section>
    );
  }

  return (
    <div className={styles.grid}>
      <MarketPanel
        markets={markets}
        selectedMarket={selectedMarket}
        onSelectMarket={(marketId) => {
          setSelectedMarketId(marketId);
          setQuote(null);
        }}
      />

      <div className={styles.middle}>
        <BestExecutionTable quote={quote} />
        <TradeSidePanels
          accountWallet={viewModel.accountWallet}
          settings={settings}
          queuedIntents={viewModel.queuedIntents}
          cancellingId={cancellingId}
          onCancelIntent={cancelQueuedIntent}
        />
      </div>

      <TradeTicket
        market={selectedMarket}
        state={ticket}
        quote={quote}
        previewing={previewing}
        queueing={queueing}
        saving={saving}
        message={message}
        onChange={patchTicket}
        onPreview={preview}
        onQueue={queue}
        onSaveDefaults={saveDefaults}
      />
    </div>
  );
}
