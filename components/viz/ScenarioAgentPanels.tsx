"use client";

import { useMemo, useState } from "react";
import { interpolateNumber } from "d3-interpolate";
import { motion, useReducedMotion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import VizGlyph from "./VizGlyphs";
import AgentConductor from "./AgentConductor";
import type { PaperScenario, PaperVizModel } from "./vizPaperModel";
import type { VizTone } from "./vizMetrics";
import styles from "./viz-ui.module.css";

const TONES: Record<VizTone, string> = {
  yellow: styles.toneYellow,
  sky: styles.toneSky,
  mint: styles.toneMint,
  orange: styles.toneOrange,
  lilac: styles.toneLilac,
  rose: styles.toneRose,
  paper: styles.tonePaper,
};

export function ScenariosPanel({ paper }: { paper: PaperVizModel }) {
  const reduceMotion = useReducedMotion();
  const [strength, setStrength] = useState(3);
  const [liquidity, setLiquidity] = useState(2);
  const [risk, setRisk] = useState(2);
  const scenarios = useMemo(() => adjustScenarios(paper.scenarios, { strength, liquidity, risk }), [liquidity, paper.scenarios, risk, strength]);

  return (
    <article className={styles.paperPanel}>
      <div className={styles.panelTitle}>
        <div>
          <h2>SCENARIO LANDSCAPE</h2>
          <p>Probabilistic branches from live market forces. Not guaranteed outcomes.</p>
        </div>
      </div>
      <div className={styles.scenarioBoard}>
        <MarketState state={paper.marketState} />
        <svg className={styles.branchMap} viewBox="0 0 300 270" aria-hidden="true">
          <circle className={styles.branchRoot} cx="40" cy="134" r="10" />
          {scenarios.map((scenario, index) => {
            const y = 44 + index * 90;
            return (
              <g key={scenario.id} className={TONES[scenario.tone]}>
                <motion.path className={styles.branchLine} d={`M50 134 C112 134 110 ${y} 170 ${y} S236 ${y} 290 ${y}`} initial={reduceMotion ? undefined : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.55, delay: index * 0.08 }} />
                <text className={styles.branchPct} x="112" y={y - 12}>{scenario.probability}%</text>
              </g>
            );
          })}
        </svg>
        <div className={styles.scenarioCards}>{scenarios.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} />)}</div>
      </div>
      <div className={styles.assumptionStrip}>
        <strong>ADJUST ASSUMPTIONS</strong>
        <Assumption label={`${paper.marketState.coin} Strength`} value={strength} onChange={setStrength} left="Weaker" right="Stronger" />
        <Assumption label="Global Liquidity Proxy" value={liquidity} onChange={setLiquidity} left="Tighter" right="Looser" />
        <Assumption label="Risk Sentiment" value={risk} onChange={setRisk} left="Risk-off" right="Risk-on" />
      </div>
    </article>
  );
}

export function AgentsPanel({ paper }: { paper: PaperVizModel }) {
  return <AgentConductor paper={paper} />;
}

function MarketState({ state }: { state: PaperVizModel["marketState"] }) {
  return (
    <aside className={styles.marketStateCard}>
      <h3>Current {state.coin} State</h3>
      <strong>{state.price}</strong>
      <dl>
        <div><dt>Loaded Change</dt><dd>{state.change}</dd></div>
        <div><dt>24h Volume</dt><dd>{state.volume}</dd></div>
        <div><dt>Open Interest</dt><dd>{state.openInterest}</dd></div>
      </dl>
      <small>Captured: {state.capturedAt}</small>
    </aside>
  );
}

function ScenarioCard({ scenario }: { scenario: PaperScenario }) {
  return (
    <motion.article className={`${styles.scenarioCard} ${TONES[scenario.tone]}`} layout whileHover={{ y: -3 }}>
      <div className={styles.glyphBox}><VizGlyph name={scenario.glyph} className={styles.glyph} /></div>
      <div>
        <h3>{scenario.label}</h3>
        <span className={`${styles.stanceBadge} ${styles[scenario.stance]}`}>{scenario.probability}% probability</span>
        <p>{scenario.trigger}</p>
        <strong>{scenario.target}</strong>
        <small>Invalidation: {scenario.invalidation}</small>
      </div>
      <MiniPath values={scenario.path} />
    </motion.article>
  );
}

function Assumption({ label, value, onChange, left, right }: { label: string; value: number; onChange: (value: number) => void; left: string; right: string }) {
  return (
    <label className={styles.assumption}>
      <span>{label}</span>
      <input type="range" min="0" max="4" value={value} onChange={(event) => onChange(Number(event.target.value))} />
      <em>{left}</em>
      <em>{right}</em>
    </label>
  );
}

function MiniPath({ values }: { values: number[] }) {
  const xScale = scaleLinear({ domain: [0, Math.max(1, values.length - 1)], range: [8, 104] });
  const min = Math.min(...values);
  const max = Math.max(...values);
  const yScale = scaleLinear({ domain: [min, max === min ? min + 1 : max], range: [58, 12] });
  const points = values.map((value, index) => ({ x: xScale(index), y: yScale(value) }));
  return (
    <svg className={styles.miniPath} viewBox="0 0 112 70" aria-hidden="true">
      <path d="M8 15H104M8 35H104M8 55H104" />
      <LinePath data={points} x={(point) => point.x} y={(point) => point.y} className={styles.miniTrace} />
    </svg>
  );
}

function adjustScenarios(scenarios: PaperScenario[], adjust: { strength: number; liquidity: number; risk: number }) {
  const rows = scenarios.map((scenario) => {
    const bias = scenario.id === "squeeze" ? adjust.strength + adjust.liquidity - adjust.risk : scenario.id === "flush" ? adjust.risk - adjust.strength : 2 - Math.abs(adjust.strength - adjust.risk);
    return { ...scenario, raw: Math.max(1, interpolateNumber(scenario.probability, scenario.probability + bias * 5)(0.65)) };
  });
  const total = rows.reduce((sum, row) => sum + row.raw, 0) || 1;
  return rows.map(({ raw, ...row }) => ({ ...row, probability: Math.round((raw / total) * 100) }));
}
