"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { DataRow, EmptyState, Panel, StatusBadge } from "@/components/strategy-ui";

type SavedAccountWallet = {
  evmUaAddress: string;
  solanaUaAddress: string;
  lastRefreshedAt: number;
} | null;

function canonicalOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return window.location.origin;
  return "";
}

async function copyToClipboard(value: string) {
  if (typeof navigator === "undefined") return;
  await navigator.clipboard.writeText(value);
}

export default function PaymentLinkPanel({ savedWallet }: { savedWallet: SavedAccountWallet }) {
  const paymentLink = useQuery(api.accountWallets.getViewerPaymentLink, {});
  const getOrCreate = useMutation(api.accountWallets.getOrCreateViewerPaymentLink);
  const disableLink = useMutation(api.accountWallets.disableViewerPaymentLink);
  const rotateLink = useMutation(api.accountWallets.rotateViewerPaymentLink);
  const [busy, setBusy] = useState<"create" | "disable" | "rotate" | "copy" | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const shareUrl = useMemo(() => {
    if (!paymentLink?.slug) return "";
    return `${canonicalOrigin()}/pay/${paymentLink.slug}`;
  }, [paymentLink?.slug]);
  const walletReady = Boolean(savedWallet?.evmUaAddress && savedWallet?.solanaUaAddress);

  const run = async (kind: typeof busy, action: () => Promise<unknown>, success: string) => {
    setBusy(kind);
    setMessage(null);
    try {
      await action();
      setMessage(success);
    } catch (nextError) {
      setMessage(nextError instanceof Error ? nextError.message : String(nextError));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Panel
      title="Shared deposit link"
      description="Create one public link that lets someone else deposit into your Particle account wallet."
      tone="mint"
    >
      {!walletReady ? (
        <EmptyState
          title="Sync your account wallet first."
          body="Moeazi needs your EVM and Solana Universal Account addresses before it can create a public deposit link."
        />
      ) : (
        <div className="stack-list">
          <div className="two-column-grid">
            <div className="stack-list">
              <DataRow
                label="Link status"
                value={
                  <StatusBadge tone={paymentLink ? "positive" : "warning"}>
                    {paymentLink ? paymentLink.status : "not created"}
                  </StatusBadge>
                }
              />
              <DataRow
                label="Wallet synced"
                value={savedWallet?.lastRefreshedAt ? new Date(savedWallet.lastRefreshedAt).toLocaleString() : "Not synced"}
              />
            </div>
            <div className="stack-list">
              {shareUrl ? <p className="mono-label">{shareUrl}</p> : <p className="muted-copy">No active link yet.</p>}
              {message ? <p className="muted-copy">{message}</p> : null}
            </div>
          </div>

          <div className="inline-actions">
            <button
              className="primary-button"
              type="button"
              disabled={busy !== null}
              onClick={() => run("create", () => getOrCreate({}), "Payment link is ready.")}
            >
              {busy === "create" ? "Creating..." : paymentLink ? "Ensure active link" : "Create link"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!shareUrl || busy !== null}
              onClick={() => run("copy", () => copyToClipboard(shareUrl), "Payment link copied.")}
            >
              Copy link
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!paymentLink || busy !== null}
              onClick={() => run("rotate", () => rotateLink({}), "Payment link rotated.")}
            >
              {busy === "rotate" ? "Rotating..." : "Rotate"}
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={!paymentLink || busy !== null}
              onClick={() => run("disable", () => disableLink({}), "Payment link disabled.")}
            >
              {busy === "disable" ? "Disabling..." : "Disable"}
            </button>
          </div>
        </div>
      )}
    </Panel>
  );
}
