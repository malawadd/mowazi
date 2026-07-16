import type { AgentVisualization } from "@/lib/agentBackend";
import type {
  PaperAgent,
  PaperForceCard,
  PaperScenario,
  PaperVizModel,
  VizGlyphName,
  VizStance,
} from "./vizPaperModel";

const forceSlots = ["momentum", "liquidity", "flow", "funding", "openInterest", "volume"] as const;
const tones = ["sky", "mint", "yellow", "rose", "orange", "lilac"] as const;
const glyphs: VizGlyphName[] = ["link", "faucet", "whale", "gauge", "lock", "globe"];
const scenarioIds = ["squeeze", "range", "flush"] as const;

export function applyAgentVisualization(base: PaperVizModel, payload: AgentVisualization | null): PaperVizModel {
  if (!payload) return base;
  const forceByRole = new Map(payload.forces.map((force) => [force.role, force]));
  const forces = payload.forces.length ? payload.forces.slice(0, 6).map((force, index): PaperForceCard => ({
    id: forceSlots[index], title: title(force.role), stance: stance(force.score),
    value: signed(force.score), detail: `${Math.round(force.confidence * 100)}% calibrated confidence`,
    meta: "Agent signal", score: force.score, tone: tones[index], glyph: glyphs[index],
    column: index < 3 ? "market" : "leverage",
  })) : base.forces;
  const scenarios = payload.scenarios.length ? payload.scenarios.slice(0, 3).map((scenario, index): PaperScenario => ({
    ...base.scenarios[index], id: scenarioIds[index], label: scenario.name,
    stance: index === 0 ? "bullish" : index === 2 ? "bearish" : "neutral",
    probability: Math.round(scenario.probability * 100), trigger: scenario.triggers.join(" · ") || "No trigger supplied",
    invalidation: scenario.invalidations.join(" · ") || "No invalidation supplied",
    disclaimer: scenario.disclaimer,
  })) : base.scenarios;
  const agents = payload.agents.filter((agent) => !agent.role.includes("synthesis") && agent.role !== "arbiter")
    .slice(0, 6).map((agent, index): PaperAgent => {
      const force = forceByRole.get(agent.role);
      return {
        id: `${agent.provider}-${agent.role}-${index}`, title: title(agent.role),
        stance: stance(force?.score ?? 0), confidence: Math.round((force?.confidence ?? 0) * 100),
        evidence: `${agent.provider} · ${agent.model} · ${agent.evidence_ids.length} evidence refs · ${agent.latency_ms} ms`,
        tone: tones[index % tones.length], glyph: glyphs[index % glyphs.length],
      };
    });
  const consensus = payload.consensus ?? average(payload.forces.map((force) => force.score));
  const disagreement = payload.disagreement ?? 0;
  const galaxy = payload.galaxy[0];
  const regime = payload.forces.find((force) => force.role.includes("regime"));
  const catalyst = payload.forces.find((force) => force.role.includes("catalyst"));
  return {
    ...base,
    forces,
    scenarios,
    agents: agents.length ? agents : base.agents,
    story: base.story.map((phase, index) => index === 0 && regime ? {
      ...phase, insight: `Regime agent: ${regime.stance} (${Math.round(regime.confidence * 100)}% confidence).`,
    } : index === 1 && catalyst ? {
      ...phase, catalyst: "Agent catalyst review",
      insight: `Catalyst agent: ${catalyst.stance} (${Math.round(catalyst.confidence * 100)}% confidence).`,
    } : phase),
    synthesis: {
      ...base.synthesis, stance: stance(consensus), label: label(consensus),
      confidence: Math.round((payload.confidence ?? base.synthesis.confidence / 100) * 100),
      disagreement: Math.round(disagreement * 100), reversalRisk: Math.round(Math.min(1, disagreement + Math.abs(consensus) * .2) * 100),
      conflictDrivers: payload.conflicts?.length ? payload.conflicts : ["No material agent conflict reported"],
      netImpact: consensus,
    },
    galaxy: galaxy ? {
      strength: Math.abs(galaxy.strength) >= .6 ? "Strong" : Math.abs(galaxy.strength) >= .25 ? "Firm" : "Mixed",
      sentiment: galaxy.sentiment > .15 ? "Risk-on" : galaxy.sentiment < -.15 ? "Risk-off" : "Balanced",
      volatility: galaxy.volatility >= .65 ? "High" : galaxy.volatility >= .3 ? "Medium" : "Low",
    } : base.galaxy,
  };
}

function title(value: string) { return value.split("_").map((item) => item[0]?.toUpperCase() + item.slice(1)).join(" "); }
function stance(value: number): VizStance { return value > .12 ? "bullish" : value < -.12 ? "bearish" : "neutral"; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}`; }
function label(value: number) { return value > .35 ? "Bullish alignment" : value < -.35 ? "Bearish alignment" : "Mixed regime"; }
function average(values: number[]) { return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0; }
