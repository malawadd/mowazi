"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMagicWallet } from "@/components/MagicWalletProvider";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { useUniversalAccount } from "@/hooks/useUniversalAccount";
import { formatUsd } from "@/lib/trade/format";
import { useHyperliquidAccount } from "./useHyperliquidAccount";

function compact(address?: string | null) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "No wallet";
}

function initials(name?: string, email?: string | null) {
  const source = name || email || "T";
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "T";
}

export function TradeAccountDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const { session } = useParticleSession();
  const magicWallet = useMagicWallet();
  const ua = useUniversalAccount("eip7702-if-supported");
  const dashboard = useQuery(api.trade.getTradeDashboard, open ? {} : "skip");

  const ownerAddress = ua.ownerAddress ?? dashboard?.accountWallet?.ownerAddress ?? null;
  const hlAccount = useHyperliquidAccount(open ? ownerAddress : null);

  const [walletAction, setWalletAction] = useState<"buy" | "send" | "receive" | null>(null);
  const displayName = magicWallet.email?.split("@")[0] || "Trader";

  const isMagic = session?.authProvider === "magic";

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  const copyAddress = useCallback(async () => {
    const addr = magicWallet.address;
    if (!addr) return;
    await navigator.clipboard.writeText(addr);
  }, [magicWallet.address]);

  const handleWalletAction = useCallback(
    async (action: "buy" | "send" | "receive") => {
      if (walletAction || !magicWallet.magic) return;
      setWalletAction(action);
      try {
        if (action === "buy") {
          await magicWallet.magic.wallet.showOnRamp();
        } else if (action === "send") {
          await magicWallet.magic.wallet.showSendTokensUI();
        } else {
          await magicWallet.magic.wallet.showAddress();
        }
      } catch {
        // User closing the Magic UI is not a real error
      } finally {
        setWalletAction(null);
      }
    },
    [magicWallet.magic, walletAction],
  );

  const handleDisconnect = useCallback(async () => {
    await magicWallet.logout();
    onClose();
    router.push("/sign-in");
  }, [magicWallet, onClose, router]);

  if (!open || !isMagic) return null;

  const queuedIntents = dashboard?.queuedIntents ?? [];
  const settings = dashboard?.settings;
  const accountWallet = dashboard?.accountWallet;

  return (
    <div className="fixed inset-0 z-80">
      {/* Backdrop */}
      <button
        className="absolute inset-0 bg-(--ink)/30"
        onClick={onClose}
        aria-label="Close account drawer"
      />

      {/* Drawer */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="trade-account-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l-[5px] border-(--line) bg-(--surface-paper) p-5 shadow-(--shadow-lg)"
      >
        {/* Header */}
        <header className="mb-6 flex items-start gap-4">
          <div
            className="grid h-20 w-20 place-items-center rounded-lg border-[5px] border-(--line) bg-(--surface-sky) text-3xl font-black text-(--ink)"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            {initials(displayName, magicWallet.email)}
          </div>
          <div className="min-w-0 flex-1">
            <h2
              id="trade-account-drawer-title"
              className="truncate text-2xl font-black"
              style={{ fontFamily: "var(--font-syne), sans-serif" }}
            >
              {displayName}
            </h2>
            <p
              className="truncate text-sm font-bold text-(--muted)"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              {magicWallet.email}
            </p>
          </div>
          <button
            className="text-3xl font-black leading-none hover:text-(--surface-pink)"
            onClick={onClose}
            aria-label="Close"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            &times;
          </button>
        </header>

        {/* Wallet Section */}
        <section className="mb-5 border-[5px] border-(--line) bg-(--surface-sky-tint) p-4 shadow-(--shadow-sm)">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p
              className="text-xs font-black uppercase tracking-widest text-(--muted)"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              Wallet
            </p>
            <button
              className="rounded-full border-[3px] border-(--line) bg-(--surface-paper) px-3 py-1 text-xs font-bold shadow-(--shadow-sm) hover:bg-(--surface-yellow)"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
              onClick={copyAddress}
            >
              {compact(magicWallet.address)}
            </button>
          </div>
          <p
            className="text-center text-xs font-black uppercase tracking-widest text-(--muted)"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            Unified Balance
          </p>
          <p
            className="mb-3 text-center text-5xl font-black"
            style={{ fontFamily: "var(--font-syne), sans-serif" }}
          >
            ${ua.primaryAssets?.totalAmountInUSD?.toFixed(2) ?? accountWallet?.unifiedBalanceUsd?.toFixed(2) ?? "0.00"}
          </p>
          <div className="mb-4 flex items-center justify-center gap-2">
            <span
              className={`inline-flex items-center gap-1 rounded-full border-[3px] border-(--line) px-3 py-1 text-xs font-black shadow-(--shadow-sm) ${
                ua.eip7702Status?.enabled ? "bg-(--surface-mint)" : "bg-(--surface-sky)"
              }`}
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              {ua.eip7702Status?.enabled ? "Arbitrum delegated" : "Arbitrum pending"}
            </span>
          </div>
          {ua.error && (
            <p className="mb-3 text-center text-xs font-bold text-(--surface-red)">{ua.error}</p>
          )}
          <div className="grid grid-cols-3 gap-2">
            <WalletBtn
              action="buy"
              current={walletAction}
              onClick={() => handleWalletAction("buy")}
              hoverColor="var(--surface-mint)"
            />
            <WalletBtn
              action="send"
              current={walletAction}
              onClick={() => handleWalletAction("send")}
              hoverColor="var(--surface-pink)"
            />
            <WalletBtn
              action="receive"
              current={walletAction}
              onClick={() => handleWalletAction("receive")}
              hoverColor="var(--surface-sky)"
            />
          </div>
        </section>

        {/* Account Stats */}
        <section className="mb-5 border-[5px] border-(--line) bg-(--surface-paper) p-4 shadow-(--shadow-sm)">
          <h3
            className="mb-3 text-xs font-black uppercase tracking-widest text-(--muted)"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
          >
            Trading Account
          </h3>
          <div className="grid grid-cols-2 gap-3">
            <Stat label="HL Equity" value={formatUsd(hlAccount.accountValueUsd)} />
            <Stat label="Withdrawable" value={formatUsd(hlAccount.withdrawableUsd)} />
            <Stat label="Leverage" value={`${settings?.defaultLeverage ?? 5}x`} />
            <Stat label="Slippage" value={`${settings?.slippageCapBps ?? 50} bps`} />
          </div>
        </section>

        {/* Positions */}
        <DrawerSection title="Positions" count={hlAccount.positions.length}>
          {!dashboard?.signedIn ? (
            <SmallMuted>Sign in to view.</SmallMuted>
          ) : hlAccount.loading ? (
            <SmallMuted>Loading Hyperliquid...</SmallMuted>
          ) : hlAccount.positions.length === 0 ? (
            <SmallMuted>No open positions.</SmallMuted>
          ) : (
            hlAccount.positions.slice(0, 5).map((pos) => {
              const coin = String(pos.coin ?? pos.name ?? "—");
              const size = String(pos.szi ?? pos.size ?? "—");
              const pnl = pos.unrealizedPnl ?? pos.upnl;
              const pnlNum = Number(pnl);
              return (
                <TradeRow
                  key={coin}
                  label={coin}
                  detail={size}
                  value={Number.isFinite(pnlNum) ? formatUsd(pnlNum) : null}
                  valueMuted={false}
                />
              );
            })
          )}
        </DrawerSection>

        {/* Open Orders */}
        <DrawerSection title="Open Orders" count={hlAccount.openOrders.length}>
          {!dashboard?.signedIn ? (
            <SmallMuted>Sign in to view.</SmallMuted>
          ) : hlAccount.loading ? (
            <SmallMuted>Loading Hyperliquid...</SmallMuted>
          ) : hlAccount.openOrders.length === 0 ? (
            <SmallMuted>No open orders.</SmallMuted>
          ) : (
            hlAccount.openOrders.slice(0, 5).map((order) => {
              const coin = String(order.coin ?? "—");
              const side = String(order.side ?? order.dir ?? "—");
              const sz = String(order.sz ?? order.size ?? "—");
              return <TradeRow key={`${coin}-${side}-${sz}`} label={coin} detail={side} value={sz} valueMuted />;
            })
          )}
        </DrawerSection>

        {/* Recent Intents */}
        <DrawerSection title="Recent Trades" count={queuedIntents.length}>
          {queuedIntents.length === 0 ? (
            <SmallMuted>No trade intents yet.</SmallMuted>
          ) : (
            queuedIntents.slice(0, 5).map((intent) => (
              <TradeRow
                key={intent.id}
                label={intent.coin ?? intent.marketId}
                detail={`${intent.side} ${intent.leverage}x`}
                value={formatUsd(intent.notionalUsd)}
                valueMuted={false}
                badge={intent.status}
              />
            ))
          )}
        </DrawerSection>

        {/* Footer */}
        <div className="mt-auto pt-6">
          <button
            className="w-full border-[5px] border-(--line) bg-(--surface-paper) px-3 py-3 text-center font-black uppercase shadow-(--shadow-sm) hover:bg-(--surface-yellow)"
            style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            onClick={handleDisconnect}
          >
            Disconnect
          </button>
        </div>
      </aside>
    </div>
  );
}

/* ---- Helpers ---- */

function WalletBtn({
  action,
  current,
  onClick,
  hoverColor,
}: {
  action: string;
  current: string | null;
  onClick: () => void;
  hoverColor: string;
}) {
  const label = action[0].toUpperCase() + action.slice(1);
  return (
    <button
      className="flex items-center justify-center gap-1.5 border-[3px] border-(--line) bg-(--surface-paper) px-3 py-2.5 text-sm font-black uppercase shadow-(--shadow-sm) transition-colors disabled:opacity-50"
      style={{
        fontFamily: "var(--font-plex-mono), monospace",
        ...(current ? {} : { "--tw-hover-bg": hoverColor } as React.CSSProperties),
      }}
      onMouseEnter={(e) => {
        if (!current) (e.currentTarget as HTMLElement).style.background = hoverColor;
      }}
      onMouseLeave={(e) => {
        if (!current) (e.currentTarget as HTMLElement).style.background = "";
      }}
      onClick={onClick}
      disabled={!!current}
    >
      {current === action ? (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-(--ink) border-t-transparent" />
      ) : (
        <ActionIcon action={action} />
      )}
      {label}
    </button>
  );
}

function ActionIcon({ action }: { action: string }) {
  if (action === "buy") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
  );
  if (action === "send") return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
  );
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-[3px] border-(--line) bg-(--surface-paper-alt) p-3 shadow-(--shadow-sm)">
      <p
        className="text-xs font-bold uppercase tracking-widest text-(--muted)"
        style={{ fontFamily: "var(--font-plex-mono), monospace" }}
      >
        {label}
      </p>
      <p className="text-lg font-black" style={{ fontFamily: "var(--font-syne), sans-serif" }}>
        {value}
      </p>
    </div>
  );
}

function DrawerSection({
  title,
  count,
  children,
}: {
  title: string;
  count: number;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-0 flex items-center justify-between border-[5px] border-b-[3px] border-(--line) bg-(--surface-yellow) px-3 py-2 shadow-(--shadow-sm)">
        <h3
          className="text-sm font-black uppercase tracking-widest"
          style={{ fontFamily: "var(--font-plex-mono), monospace" }}
        >
          {title}
          {count > 0 && (
            <span
              className="ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full border-[3px] border-(--line) bg-(--surface-paper) px-1.5 text-xs font-black"
              style={{ fontFamily: "var(--font-plex-mono), monospace" }}
            >
              {count}
            </span>
          )}
        </h3>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </section>
  );
}

function TradeRow({
  label,
  detail,
  value,
  valueMuted,
  badge,
}: {
  label: string;
  detail: string;
  value: string | null;
  valueMuted: boolean;
  badge?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-[3px] border-(--line) bg-(--surface-paper-alt) p-3 shadow-(--shadow-sm)">
      <span className="truncate font-black" style={{ fontFamily: "var(--font-syne), sans-serif" }}>
        {label}
      </span>
      <span
        className="shrink-0 text-xs font-bold uppercase text-(--muted)"
        style={{ fontFamily: "var(--font-plex-mono), monospace" }}
      >
        {detail}
      </span>
      {badge ? (
        <span
          className="shrink-0 rounded-full border-[3px] border-(--line) bg-(--surface-sky) px-2 py-0.5 text-xs font-black uppercase shadow-(--shadow-sm)"
          style={{ fontFamily: "var(--font-plex-mono), monospace" }}
        >
          {badge}
        </span>
      ) : null}
      {value !== null && (
        <span
          className={`shrink-0 text-sm font-bold ${valueMuted ? "text-(--muted)" : ""}`}
          style={{ fontFamily: "var(--font-plex-mono), monospace" }}
        >
          {value}
        </span>
      )}
    </div>
  );
}

function SmallMuted({ children }: { children: ReactNode }) {
  return (
    <p
      className="border-2 border-dashed border-(--line) p-3 text-sm font-bold text-(--muted)"
      style={{ fontFamily: "var(--font-plex-mono), monospace" }}
    >
      {children}
    </p>
  );
}
