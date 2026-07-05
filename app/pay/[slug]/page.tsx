"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useQuery } from "convex/react";
import PublicPaymentForm from "@/components/PublicPaymentForm";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

function getSlug(param: string | string[] | undefined) {
  return Array.isArray(param) ? param[0] : param;
}

export default function PublicPaymentPage() {
  const params = useParams<{ slug?: string | string[] }>();
  const slug = getSlug(params.slug);
  const paymentLink = useQuery(api.payments.getPublicPaymentLink, slug ? { slug } : "skip");

  return (
    <main className="marketing-shell">
      {paymentLink === undefined ? (
        <Panel title="Loading payment link" tone="sky">
          <EmptyState title="Checking link." body="Loading the shared Moeazi account wallet." />
        </Panel>
      ) : !paymentLink ? (
        <Panel title="Payment link unavailable" tone="rose">
          <EmptyState
            title="This deposit link is not active."
            body="Ask the Moeazi account owner for a fresh link."
            action={
              <Link className="secondary-button" href="/">
                Go home
              </Link>
            }
          />
        </Panel>
      ) : !paymentLink.walletReady ? (
        <Panel title="Recipient wallet not ready" tone="orange">
          <EmptyState
            title="The account owner needs to sync their Particle wallet."
            body="This link exists, but the receiving Universal Account addresses are not ready yet."
          />
        </Panel>
      ) : (
        <PublicPaymentForm paymentLink={paymentLink} />
      )}
    </main>
  );
}
