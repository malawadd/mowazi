import type { AgentVisualization } from "@/lib/agentBackend";
import styles from "./agent-lab.module.css";

type View = "forces" | "story" | "scenarios" | "agents" | "galaxy";

export default function AgentResultView({ view, payload }: { view: View; payload?: AgentVisualization }) {
  if (!payload) return <div className={styles.empty}>Run an analysis to see the market summary.</div>;
  if (view === "forces") return <div className={styles.resultGrid}>{payload.forces.map((force) => (
    <article key={`${force.role}-${force.score}`}><span>{title(force.role)}</span><strong>{stance(force.score)}</strong><p>{percent(force.confidence)} confidence · signal strength {signed(force.score)}</p></article>
  ))}</div>;
  if (view === "scenarios") return <div className={styles.resultList}>{payload.scenarios.map((scenario) => (
    <article key={scenario.name}><header><strong>{scenario.name}</strong><b>{percent(scenario.probability)}</b></header><p><b>Watch for:</b> {scenario.triggers.join("; ")}</p><p><b>Invalid if:</b> {scenario.invalidations.join("; ")}</p></article>
  ))}</div>;
  if (view === "agents") return <div className={styles.resultGrid}>{payload.agents.map((agent, index) => (
    <article key={`${agent.role}-${index}`}><span>{title(agent.role)}</span><strong>{agent.status === "completed" ? "Analysis complete" : "Unavailable"}</strong><p>{agent.evidence_ids.length} market sources reviewed{agent.estimated_cost_usd ? ` · about $${agent.estimated_cost_usd.toFixed(4)}` : ""}</p></article>
  ))}</div>;
  if (view === "galaxy") return <div className={styles.resultGrid}>{payload.galaxy.map((node) => (
    <article key={node.market}><span>{node.market}</span><strong>{stance(node.strength)}</strong><p>{sentiment(node.sentiment)} sentiment · {volatility(node.volatility)} volatility</p></article>
  ))}</div>;
  return <div className={styles.empty}>{payload.story.length ? "Historical market narrative is available." : "A market story will appear after enough manual snapshots exist."}</div>;
}

function title(value: string) { return value.split("_").map((word) => word[0]?.toUpperCase() + word.slice(1)).join(" "); }
function stance(value: number) { return value > .12 ? "Bullish pressure" : value < -.12 ? "Bearish pressure" : "Balanced"; }
function sentiment(value: number) { return value > .12 ? "Positive" : value < -.12 ? "Cautious" : "Mixed"; }
function volatility(value: number) { return value > .6 ? "High" : value > .3 ? "Moderate" : "Low"; }
function percent(value: number) { return `${Math.round(value * 100)}%`; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}`; }
