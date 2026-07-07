"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { useWallets } from "@particle-network/connectkit";
import { api } from "@/convex/_generated/api";
import type { Id } from "@/convex/_generated/dataModel";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import {
  HYPERLIQUID_BRIDGE_ADDRESS,
  readHyperliquidAccountState,
  waitForHyperliquidCredit,
} from "@/lib/trade/hyperliquidApi";
import { canUseUaForHyperliquid, fundingAmountNeeded } from "@/lib/trade/hyperliquidFunding";
import { submitHyperliquidMarketOrder } from "@/lib/trade/hyperliquidOrder";
import { DEFAULT_TRADE_SETTINGS, PERP_MARKETS } from "@/lib/trade/markets";
import { normalizeOptionalHours } from "@/lib/trade/intents";
import { routeBestExecution } from "@/lib/trade/routing";
import type { BestExecutionQuote, TradeSettings } from "@/lib/trade/types";
import BestExecutionTable from "./BestExecutionTable";
import LiveChart from "./LiveChart";
import MarketHeader from "./MarketHeader";
import OrderFlowPanel from "./OrderFlowPanel";
import TerminalTabs from "./TerminalTabs";
import TradeTicket, { type TicketState } from "./TradeTicket";
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

function maybeNumber(value: string) {
  return value.trim() ? Number(value) : undefined;
}

export default function TradeTerminal() {
  const router = useRouter();
  const dashboard = useQuery(api.trade.getTradeDashboard, {});
  const publicConfig = useQuery(api.trade.getPublicTradeConfig, {});
  const recordIntent = useMutation(api.trade.recordTradeIntent);
  const recordFunding = useMutation(api.trade.recordVenueFunding);
  const recordExecution = useMutation(api.trade.recordTradeExecution);
  const saveSettings = useMutation(api.trade.setTradeSettings);
  const { session } = useParticleSession();
  const [primaryWallet] = useWallets();
  const ua = useUniversalAccount("eip7702-if-supported");
  const [interval, setInterval] = useState("1h");
  const [selectedMarketId, setSelectedMarketId] = useState(DEFAULT_TRADE_SETTINGS.defaultMarketId);
  const [ticket, setTicket] = useState<TicketState>(() => ticketFromSettings(DEFAULT_TRADE_SETTINGS));
  const [quote, setQuote] = useState<BestExecutionQuote | null>(null);
  const [busy, setBusy] = useState<"preview" | "submit" | "save" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const settings = dashboard?.settings ?? publicConfig?.settings ?? DEFAULT_TRADE_SETTINGS;
  const markets = dashboard?.markets ?? publicConfig?.markets ?? PERP_MARKETS;
  const selectedMarket = useMemo(
    () => markets.find((market) => market.id === selectedMarketId) ?? markets[0] ?? PERP_MARKETS[0],
    [markets, selectedMarketId],
  );
  const feed = useHyperliquidFeed(selectedMarket, interval);

  useEffect(() => {
    if (!dashboard?.settings) return;
    setSelectedMarketId(dashboard.settings.defaultMarketId);
    setTicket((current) => ({ ...ticketFromSettings(dashboard.settings), side: current.side }));
  }, [dashboard?.settings]);

  const patchTicket = (patch: Partial<TicketState>) => {
    setTicket((current) => ({ ...current, ...patch }));
    setQuote(null);
  };

  const buildInput = () => ({
    marketId: selectedMarket.id,
    side: ticket.side,
    marginUsd: Number(ticket.marginUsd),
    leverage: Number(ticket.leverage),
    holdTimeHours: normalizeOptionalHours(maybeNumber(ticket.expectedHoldHours)),
    slippageCapBps: Number(ticket.slippageCapBps),
    now: Date.now(),
  });

  const preview = () => {
    setBusy("preview");
    setMessage(null);
    try {
      const nextQuote = routeBestExecution(buildInput(), feed.snapshot ? [feed.snapshot] : []);
      setQuote(nextQuote);
      setMessage(nextQuote.winningVenue ? "Live route preview ready." : "No live venue can execute this trade yet.");
      return nextQuote;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
      return null;
    } finally {
      setBusy(null);
    }
  };

  const saveDefaults = async () => {
    if (!session) {
      router.push("/sign-in?redirect=/trade");
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
    if (!session) {
      router.push("/sign-in?redirect=/trade");
      return;
    }
    const currentQuote = quote ?? preview();
    if (!currentQuote?.winningVenue) return;
    const winner = currentQuote.quotes.find((item) => item.venue === currentQuote.winningVenue);
    if (winner?.venue !== "hyperliquid") {
      setMessage("Only Hyperliquid is live-enabled right now.");
      return;
    }

    setBusy("submit");
    setMessage(null);
    let intentId: Id<"tradeIntents"> | null = null;
    try {
      const intent = (await recordIntent({
        marketId: selectedMarket.id,
        side: ticket.side,
        marginUsd: Number(ticket.marginUsd),
        leverage: Number(ticket.leverage),
        expectedHoldHours: maybeNumber(ticket.expectedHoldHours),
        slippageCapBps: Number(ticket.slippageCapBps),
        selectedVenue: "hyperliquid",
        quoteJson: JSON.stringify(currentQuote),
      })) as { _id: Id<"tradeIntents"> };
      const createdIntentId = intent._id;
      intentId = createdIntentId;

      const refreshed = ua.accountInfo ? null : await ua.refresh();
      const accountInfo = ua.accountInfo ?? refreshed?.accountInfo ?? null;
      const compatibility = canUseUaForHyperliquid({
        ownerAddress: ua.ownerAddress,
        evmUaAddress: accountInfo?.evmSmartAccount,
      });
      if (!compatibility.ok) throw new Error(compatibility.reason ?? "Particle UA is not Hyperliquid-compatible.");

      const owner = ua.ownerAddress!;
      const venueAccount = await readHyperliquidAccountState(owner);
      const fundingNeeded = fundingAmountNeeded({
        marginUsd: Number(ticket.marginUsd),
        venueAccountValueUsd: venueAccount.accountValueUsd,
      });
      if (fundingNeeded > 0) {
        const transfer = await ua.createSettledTransfer({
          amount: fundingNeeded.toFixed(2),
          receiver: HYPERLIQUID_BRIDGE_ADDRESS,
        });
        const fundingResult = await ua.signAndSend(transfer);
        await recordFunding({
          intentId: createdIntentId,
          amountUsd: fundingNeeded,
          particleTransactionId: fundingResult.transactionId,
          detailsJson: JSON.stringify(fundingResult),
        });
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

  return (
    <div className={styles.terminal}>
      <MarketHeader
        market={selectedMarket}
        markets={markets}
        snapshot={feed.snapshot}
        status={feed.status}
        onSelectMarket={(marketId) => {
          setSelectedMarketId(marketId);
          setQuote(null);
        }}
      />
      <div className={styles.terminalGrid}>
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
          previewing={busy === "preview"}
          submitting={busy === "submit"}
          saving={busy === "save"}
          message={message ?? feed.error}
          onChange={patchTicket}
          onPreview={preview}
          onSubmit={submit}
          onSaveDefaults={saveDefaults}
        />
      </div>
      <TerminalTabs
        signedIn={Boolean(session)}
        accountWallet={dashboard?.accountWallet ?? null}
        settings={settings}
        intents={dashboard?.queuedIntents ?? []}
      />
    </div>
  );
}
