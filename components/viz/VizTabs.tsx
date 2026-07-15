"use client";

import type { PerpMarket } from "@/lib/trade/types";
import type { PaperVizModel } from "./vizPaperModel";
import type { VizMetrics } from "./vizMetrics";
import { ForcesPanel, StoryPanel } from "./ForceStoryPanels";
import GalaxyPanel from "./GalaxyPanel";
import { AgentsPanel, ScenariosPanel } from "./ScenarioAgentPanels";
import styles from "./viz-ui.module.css";
import { useState } from "react";

type Tab = "Forces" | "Story" | "Scenarios" | "Agents" | "Galaxy";

const TABS: Tab[] = ["Forces", "Story", "Scenarios", "Agents", "Galaxy"];

export default function VizTabs({
  interval,
  metrics,
  paper,
  selectedMarket,
  statusMessage,
  onIntervalChange,
}: {
  interval: string;
  metrics: VizMetrics;
  paper: PaperVizModel;
  selectedMarket: PerpMarket;
  statusMessage: string | null;
  onIntervalChange: (interval: string) => void;
}) {
  const [active, setActive] = useState<Tab>("Forces");
  return (
    <section className={styles.vizShell}>
      <div className={styles.vizToolbar}>
        <div className={styles.tabButtons} role="tablist" aria-label="Visualization modes">
          {TABS.map((tab) => (
            <button key={tab} aria-pressed={active === tab} type="button" onClick={() => setActive(tab)}>
              {tab}
            </button>
          ))}
        </div>
        <span className={styles.liveStamp}>{statusMessage ?? "Live public Hyperliquid feed"}</span>
      </div>
      {active === "Forces" ? <ForcesPanel market={selectedMarket} paper={paper} /> : null}
      {active === "Story" ? <StoryPanel interval={interval} phases={paper.story} story={metrics.story} onIntervalChange={onIntervalChange} /> : null}
      {active === "Scenarios" ? <ScenariosPanel paper={paper} /> : null}
      {active === "Agents" ? <AgentsPanel paper={paper} /> : null}
      {active === "Galaxy" ? <GalaxyPanel nodes={metrics.galaxy} selectedMarket={selectedMarket} strip={paper.galaxy} /> : null}
      <div className={styles.paperFooter}>
        <span>Last updated: {paper.marketState.capturedAt}</span>
        <span>Auto-refresh: ON</span>
        <span>Public-data visualization. Not financial advice.</span>
      </div>
    </section>
  );
}
