"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useQuery, useConvexAuth } from "convex/react";
import { api } from "@/convex/_generated/api";
import { useMagicAuth } from "@/components/auth/MagicAuthProvider";
import { useUniversalAccount } from "@/components/auth/useUniversalAccount";
import { NeoBadge } from "@/components/ui/NeoBadge";
import { NeoButton } from "@/components/ui/NeoButton";
import { useToast } from "@/components/ui/NeoToast";
import { formatCents } from "@/lib/funding-math";
import { getMagic } from "@/lib/magic-client";

function compact(address?: string) {
  return address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "No wallet";
}

function initials(name?: string, email?: string) {
  const source = name || email || "N";
  return source
    .split(/\s|@/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "N";
}

export function AccountDrawer({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { logout, user } = useMagicAuth();
  const { isAuthenticated: convexReady } = useConvexAuth();
  const profile = useQuery(api.users.getProfile, open && convexReady ? {} : "skip");
  const projects = useQuery(api.projects.listMine, open && convexReady ? {} : "skip");
  const funds = useQuery(api.funds.listMine, open && convexReady ? {} : "skip");
  const contributions = useQuery(api.contributions.listMine, open && convexReady ? {} : "skip");
  const ua = useUniversalAccount(open);
  const { showToast } = useToast();
  const [walletAction, setWalletAction] = useState<"buy" | "send" | "receive" | null>(null);
  const displayName = profile?.displayName || "Naseeg account";
  const avatar = profile?.avatarUrl;
  const paid = (contributions || []).filter((item) =>
    ["paid", "signal_pending", "signaled", "badge_claimed", "settled"].includes(item.status),
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, open]);

  async function copyWallet() {
    if (!user?.walletAddress) return;
    await navigator.clipboard.writeText(user.walletAddress);
    showToast("Wallet copied", "success");
  }

  const handleWalletAction = useCallback(async (action: "buy" | "send" | "receive") => {
    if (walletAction) return; // prevent double-clicks
    setWalletAction(action);
    try {
      const magic = getMagic();
      if (action === "buy") {
        await magic.wallet.showOnRamp();
      } else if (action === "send") {
        await magic.wallet.showSendTokensUI();
      } else {
        await magic.wallet.showAddress();
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : `${action} action failed`;
      // User closing the Magic UI is not a real error
      if (!message.toLowerCase().includes("closed") && !message.toLowerCase().includes("user")) {
        showToast(message, "danger");
      }
    } finally {
      setWalletAction(null);
    }
  }, [walletAction, showToast]);

  async function disconnect() {
    await logout();
    onClose();
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <button className="absolute inset-0 bg-foreground/30" onClick={onClose} aria-label="Close account drawer" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="account-drawer-title"
        className="absolute right-0 top-0 flex h-full w-full max-w-[440px] flex-col overflow-y-auto border-l-4 border-foreground bg-white p-5 shadow-[-8px_0_0_0_var(--foreground)]"
      >
        <header className="mb-6 flex items-start gap-4">
          {avatar ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={avatar} alt="" className="h-20 w-20 rounded-lg border-4 border-foreground object-cover" />
          ) : (
            <div className="grid h-20 w-20 place-items-center rounded-lg border-4 border-foreground bg-accent text-3xl font-black">
              {initials(displayName, user?.email)}
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h2 id="account-drawer-title" className="truncate text-2xl font-black">{displayName}</h2>
            <p className="truncate font-bold text-gray-600">{profile?.email || user?.email}</p>
          </div>
          <button className="text-3xl font-black leading-none hover:text-danger" onClick={onClose} aria-label="Close">
            x
          </button>
        </header>

        <section className="mb-5 border-4 border-foreground bg-secondary bg-opacity-30 p-4">
          <div className="mb-4 flex items-center justify-between gap-3">
            <p className="font-black uppercase">Wallet</p>
            <button
              className="rounded-full border-2 border-foreground bg-white px-3 py-1 font-mono text-xs font-bold hover:bg-accent"
              onClick={copyWallet}
            >
              {compact(user?.walletAddress)}
            </button>
          </div>
          <p className="text-center text-sm font-black uppercase text-gray-600">Unified Balance</p>
          <p className="mb-3 text-center text-5xl font-black">
            ${ua.assets?.totalAmountInUSD?.toFixed(2) ?? "0.00"}
          </p>
          <div className="mb-4 flex items-center justify-center gap-2">
            <NeoBadge variant={ua.delegated ? "success" : "accent"}>
              {ua.loading.delegation ? "Checking Arbitrum" : ua.delegated ? "Arbitrum delegated" : "Arbitrum pending"}
            </NeoBadge>
          </div>
          {ua.error && <p className="mb-3 text-center text-xs font-bold text-danger">{ua.error}</p>}
          <div className="grid grid-cols-3 gap-2">
            <button
              className="flex items-center justify-center gap-1.5 border-2 border-foreground bg-white px-3 py-2.5 text-sm font-black uppercase hover:bg-success hover:text-foreground disabled:opacity-50"
              onClick={() => handleWalletAction("buy")}
              disabled={!!walletAction}
            >
              {walletAction === "buy" ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
              )}
              Buy
            </button>
            <button
              className="flex items-center justify-center gap-1.5 border-2 border-foreground bg-white px-3 py-2.5 text-sm font-black uppercase hover:bg-accent disabled:opacity-50"
              onClick={() => handleWalletAction("send")}
              disabled={!!walletAction}
            >
              {walletAction === "send" ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
              )}
              Send
            </button>
            <button
              className="flex items-center justify-center gap-1.5 border-2 border-foreground bg-white px-3 py-2.5 text-sm font-black uppercase hover:bg-secondary disabled:opacity-50"
              onClick={() => handleWalletAction("receive")}
              disabled={!!walletAction}
            >
              {walletAction === "receive" ? (
                <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-foreground border-t-transparent" />
              ) : (
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
              )}
              Receive
            </button>
          </div>
        </section>

        <div className="mb-5 grid grid-cols-2 gap-3">
          <QuickLink href="/profile/settings" label="Settings" onClose={onClose} />
          <QuickLink href="/projects/new" label="New Project" onClose={onClose} />
          <QuickLink href="/creator" label="Creator Studio" onClose={onClose} />
          <QuickLink href="/sponsor" label="Fund Account" onClose={onClose} />
        </div>

        <DrawerSection title="Projects" href="/creator" onClose={onClose}>
          {projects === undefined ? (
            <SmallMuted>Loading projects...</SmallMuted>
          ) : projects.length === 0 ? (
            <SmallMuted>No projects yet.</SmallMuted>
          ) : (
            projects.slice(0, 3).map((project) => (
              <Row key={project._id} title={project.title} meta={project.status} href={`/projects/${project.slug}`} onClose={onClose} />
            ))
          )}
        </DrawerSection>

        <DrawerSection title="Funds" href="/sponsor" onClose={onClose}>
          {funds === undefined ? (
            <SmallMuted>Loading funds...</SmallMuted>
          ) : funds.length === 0 ? (
            <SmallMuted>No fund-account pools yet.</SmallMuted>
          ) : (
            funds.slice(0, 2).map((fund) => (
              <Row key={fund._id} title={fund.name} meta={formatCents(fund.totalPoolCents)} href={`/funds/${fund.slug}`} onClose={onClose} />
            ))
          )}
        </DrawerSection>

        <DrawerSection title="Artifacts" href="/profile" onClose={onClose}>
          {contributions === undefined ? (
            <SmallMuted>Loading artifacts...</SmallMuted>
          ) : paid.length === 0 ? (
            <SmallMuted>No collected artifacts yet.</SmallMuted>
          ) : (
            paid.slice(0, 3).map((item) => (
              <Row key={item._id} title={item.artifactTitle} meta={item.projectTitle} href="/profile" onClose={onClose} />
            ))
          )}
        </DrawerSection>

        <div className="mt-auto pt-6">
          <NeoButton variant="secondary" className="w-full" onClick={disconnect}>
            Disconnect
          </NeoButton>
        </div>
      </aside>
    </div>
  );
}

function QuickLink({ href, label, onClose }: { href: string; label: string; onClose: () => void }) {
  return (
    <Link href={href} onClick={onClose} className="border-4 border-foreground bg-white px-3 py-3 text-center font-black hover:bg-accent">
      {label}
    </Link>
  );
}

function DrawerSection({ title, href, onClose, children }: {
  title: string;
  href: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="font-black uppercase">{title}</h3>
        <Link href={href} onClick={onClose} className="text-xs font-black underline">View all</Link>
      </div>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Row({ title, meta, href, onClose }: {
  title: string;
  meta?: string;
  href: string;
  onClose: () => void;
}) {
  return (
    <Link href={href} onClick={onClose} className="flex items-center justify-between gap-3 border-2 border-foreground bg-white p-3 hover:bg-accent">
      <span className="truncate font-black">{title}</span>
      {meta && <span className="shrink-0 text-xs font-bold text-gray-600">{meta}</span>}
    </Link>
  );
}

function SmallMuted({ children }: { children: ReactNode }) {
  return <p className="border-2 border-dashed border-foreground p-3 text-sm font-bold text-gray-600">{children}</p>;
}
