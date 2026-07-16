"use client";

import { useState } from "react";
import type { PerpMarket } from "@/lib/trade/types";
import type { PaperVizModel } from "./vizPaperModel";
import type { VizMetrics } from "./vizMetrics";
import ForcesPanel from "./ForcesPanel";
import StoryPanel from "./StoryPanel";
import ScenariosPanel from "./ScenariosPanel";
import AgentConductor from "./AgentConductor";
import GalaxyPanel from "./GalaxyPanel";
import styles from "./viz-ui.module.css";

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
  const selectFromKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const keyOffset = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? TABS.length - 1 : keyOffset ? (index + keyOffset + TABS.length) % TABS.length : index;
    if (nextIndex === index && !["Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setActive(TABS[nextIndex]);
    const buttons = event.currentTarget.parentElement?.querySelectorAll("button");
    buttons?.item(nextIndex).focus();
  };
  return (
    <section className={styles.vizShell}>
      <div className={styles.vizToolbar}>
        <div className={styles.tabButtons} role="tablist" aria-label="Visualization modes">
          {TABS.map((tab, index) => (
            <button key={tab} id={`viz-tab-${tab.toLowerCase()}`} role="tab" aria-selected={active === tab} aria-controls="viz-active-panel" tabIndex={active === tab ? 0 : -1} type="button" onClick={() => setActive(tab)} onKeyDown={(event) => selectFromKeyboard(event, index)}>
              {tab}
            </button>
          ))}
        </div>
        <span className={styles.liveStamp}>{statusMessage ?? "Live public Hyperliquid feed"}</span>
      </div>
      <div id="viz-active-panel" role="tabpanel" aria-labelledby={`viz-tab-${active.toLowerCase()}`}>
        {active === "Forces" ? <ForcesPanel market={selectedMarket} paper={paper} /> : null}
        {active === "Story" ? <StoryPanel interval={interval} phases={paper.story} story={metrics.story} onIntervalChange={onIntervalChange} /> : null}
        {active === "Scenarios" ? <ScenariosPanel paper={paper} /> : null}
        {active === "Agents" ? <AgentConductor paper={paper} /> : null}
        {active === "Galaxy" ? <GalaxyPanel nodes={metrics.galaxy} selectedMarket={selectedMarket} strip={paper.galaxy} /> : null}
      </div>
      <div className={styles.paperFooter}>
        <span>Last updated: {paper.marketState.capturedAt}</span>
        <span>Auto-refresh: ON</span>
        <span>Public-data visualization. Not financial advice.</span>
      </div>
    </section>
  );
}
