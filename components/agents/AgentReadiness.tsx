"use client";

import Link from "next/link";
import { useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import styles from "./agent-portal.module.css";

const steps = [
  { key: "wallet", label: "Wallet", href: "/profile/wallet" },
  { key: "strategy", label: "Strategy account", href: "/dashboard" },
  { key: "agent", label: "Agent", href: "/agents/create" },
  { key: "credits", label: "Credits", href: "/credits" },
  { key: "activate", label: "Activate", href: "/agents" },
] as const;

export default function AgentReadiness({ hasWallet, hasStrategy }: { hasWallet: boolean; hasStrategy: boolean }) {
  const settings = useQuery(api.agentQueries.getAgentSettings, hasStrategy ? {} : "skip");
  const readiness = {
    wallet: hasWallet,
    strategy: hasStrategy,
    agent: Boolean(settings?.profile),
    credits: (settings?.credits?.available ?? 0) > 0,
    activate: settings?.profile?.lifecycleStatus === "active" && !settings.profile.paused,
  };
  const complete = Object.values(readiness).filter(Boolean).length;
  return (
    <section className={styles.summaryCard} aria-labelledby="agent-readiness-title">
      <div className={styles.cardHead}><div><p className={styles.eyebrow}>Autonomous readiness</p>
        <h3 id="agent-readiness-title">{complete === 5 ? "Your agent is operating" : `${complete} of 5 ready`}</h3>
        <p>Finish these in order. Trading configuration stays here in the portal.</p></div>
        <span className={styles.statusDot} data-blocked={complete !== 5}>{complete === 5 ? "Ready" : "Setup needed"}</span>
      </div>
      <div className={styles.progress} aria-label={`${complete} of 5 onboarding tasks complete`}
        style={{ gridTemplateColumns: "repeat(5, 1fr)" }}>
        {steps.map((step, index) => <Link key={step.key} href={step.href}
          style={{ textDecoration: "none", color: "inherit" }}>
          <span data-active={readiness[step.key]}>{index + 1}. {readiness[step.key] ? "✓ " : ""}{step.label}</span>
        </Link>)}
      </div>
    </section>
  );
}
