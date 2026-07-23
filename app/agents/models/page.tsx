"use client";

import Link from "next/link";
import { useConvexAuth, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { useParticleSession } from "@/components/ParticleConnectKitProvider";
import { EmptyState } from "@/components/strategy-ui";
import ProviderConnectionPanel from "@/components/agents/ProviderConnectionPanel";
import ModelRoutingEditor from "@/components/agents/ModelRoutingEditor";
import { api } from "@/convex/_generated/api";
import type { ModelRoutingDocument, ProviderConnection } from "@/lib/modelProviders";

type EffectiveRoute = {
  routes?: ModelRoutingDocument;
  preset?: "economy" | "balanced" | "quality" | "custom";
  version?: number;
  status?: string;
};

export default function AgentModelsPage() {
  const { status } = useParticleSession();
  const convexAuth = useConvexAuth();
  const canUseConvex = status === "authenticated" && convexAuth.isAuthenticated;
  const settings = useQuery(api.agentModels.getModelSettings, canUseConvex ? {} : "skip");
  if (!canUseConvex || settings === undefined) return <StrategyShell title="Models & keys" subtitle="Your providers, your models, your limits">
    <EmptyState title={status === "unauthenticated" ? "Sign in to configure models." : "Loading model controls…"}
      body="Reading encrypted connection metadata and the active route."
      action={status === "unauthenticated" ? <Link className="primary-button" href="/sign-in?redirect=/agents/models">Sign in</Link> : null} />
  </StrategyShell>;
  if (!settings) return <StrategyShell title="Models & keys" subtitle="Your providers, your models, your limits">
    <EmptyState title="Create a strategy account first."
      body="Model credentials are isolated to your signed-in strategy account."
      action={<Link className="primary-button" href="/dashboard">Continue setup</Link>} />
  </StrategyShell>;
  return <StrategyShell title="Models & keys" subtitle="Your providers, your models, your limits">
    <ProviderConnectionPanel connections={settings.connections as unknown as ProviderConnection[]} />
    <ModelRoutingEditor connections={settings.connections as unknown as ProviderConnection[]}
      effective={settings.effective as unknown as EffectiveRoute} tier={settings.tier} />
  </StrategyShell>;
}
