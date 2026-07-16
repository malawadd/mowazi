"use client";

import { useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { RotateCcw } from "lucide-react";
import VizGlyph from "./VizGlyphs";
import { PanelTitle, StanceBadge, toneClass } from "./VizPrimitives";
import { normalizePercentages } from "./vizMath";
import type { PaperScenario, PaperVizModel } from "./vizPaperModel";
import common from "./viz-ui.module.css";
import styles from "./scenarios.module.css";

const DEFAULTS = { strength: 2, liquidity: 2, risk: 2 };

export default function ScenariosPanel({ paper }: { paper: PaperVizModel }) {
  const reduceMotion = useReducedMotion();
  const [controls, setControls] = useState(DEFAULTS);
  const scenarios = useMemo(() => adjustScenarios(paper.scenarios, controls), [controls, paper.scenarios]);
  const reset = <button type="button" className={common.iconButton} title="Reset manual tilts" aria-label="Reset manual tilts" onClick={() => setControls(DEFAULTS)}><RotateCcw /></button>;
  return (
    <article className={common.paperPanel}>
      <PanelTitle eyebrow="Plausible paths, not predictions" title="SCENARIO LANDSCAPE" description="Three live-derived branches show triggers, invalidations, and illustrative ranges. Manual tilts affect displayed weights only." actions={reset} />
      <div className={styles.scenarioBoard}>
        <MarketState state={paper.marketState} />
        <svg className={styles.branchMap} viewBox="0 0 300 360" aria-label="Scenario probability branches">
          <circle className={styles.branchRoot} cx="38" cy="180" r="11" />
          {scenarios.map((scenario, index) => {
            const y = 68 + index * 112;
            return <g key={scenario.id} className={toneClass(scenario.tone)}><motion.path className={styles.branchLine} style={{ strokeWidth: 4 + scenario.probability / 10 }} d={`M49 180 C112 180 112 ${y} 176 ${y} L290 ${y}`} initial={reduceMotion ? undefined : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .55, delay: index * .08 }} /><text className={styles.branchPct} x="128" y={y - 14}>{scenario.probability}%</text></g>;
          })}
        </svg>
        <div className={styles.scenarioCards}>{scenarios.map((scenario) => <ScenarioCard key={scenario.id} scenario={scenario} />)}</div>
      </div>
      <div className={styles.assumptionStrip}>
        <div className={styles.assumptionIntro}><strong>Manual tilts</strong><span>Display weights only</span></div>
        <Assumption label={`${paper.marketState.coin} strength`} value={controls.strength} onChange={(strength) => setControls((current) => ({ ...current, strength }))} left="Weaker" right="Stronger" />
        <Assumption label="Liquidity tilt" value={controls.liquidity} onChange={(liquidity) => setControls((current) => ({ ...current, liquidity }))} left="Tighter" right="Looser" />
        <Assumption label="Risk tilt" value={controls.risk} onChange={(risk) => setControls((current) => ({ ...current, risk }))} left="Risk-off" right="Risk-on" />
      </div>
    </article>
  );
}

function MarketState({ state }: { state: PaperVizModel["marketState"] }) {
  return <aside className={styles.marketState}><span>Current {state.coin} state</span><strong>{state.price}</strong><dl><div><dt>Loaded change</dt><dd>{state.change}</dd></div><div><dt>24h volume</dt><dd>{state.volume}</dd></div><div><dt>Open interest</dt><dd>{state.openInterest}</dd></div></dl><small>Captured {state.capturedAt}</small><p>Branches begin from this public market state.</p></aside>;
}

function ScenarioCard({ scenario }: { scenario: PaperScenario }) {
  return (
    <motion.article className={`${styles.scenarioCard} ${toneClass(scenario.tone)}`} layout>
      <div className={styles.scenarioGlyph}><VizGlyph name={scenario.glyph} className={styles.glyph} /></div>
      <div className={styles.scenarioCopy}><h3>{scenario.label}</h3><StanceBadge stance={scenario.stance} /><p>{scenario.trigger}</p><strong>{scenario.target}</strong><small>Invalidation: {scenario.invalidation}</small><em>{scenario.disclaimer}</em></div>
      <MiniPath values={scenario.path} />
    </motion.article>
  );
}

function Assumption({ label, value, onChange, left, right }: { label: string; value: number; onChange: (value: number) => void; left: string; right: string }) {
  return <label className={styles.assumption}><span>{label}</span><input type="range" min="0" max="4" value={value} onChange={(event) => onChange(Number(event.target.value))} /><em>{left}</em><em>{right}</em></label>;
}

function MiniPath({ values }: { values: number[] }) {
  const x = scaleLinear({ domain: [0, Math.max(1, values.length - 1)], range: [10, 150] });
  const min = Math.min(...values); const max = Math.max(...values);
  const y = scaleLinear({ domain: [min, max === min ? min + 1 : max], range: [70, 16] });
  const points = values.map((value, index) => ({ x: x(index), y: y(value) }));
  return <figure className={styles.miniPath}><figcaption>Illustrative path</figcaption><svg viewBox="0 0 160 84" aria-hidden="true"><path className={styles.miniGrid} d="M10 20H150M10 43H150M10 66H150" /><LinePath data={points} x={(point) => point.x} y={(point) => point.y} className={styles.miniTrace} /></svg></figure>;
}

export function adjustScenarios(scenarios: PaperScenario[], adjust: typeof DEFAULTS) {
  const raw = scenarios.map((scenario) => {
    const bias = scenario.id === "squeeze" ? (adjust.strength - 2) + (adjust.liquidity - 2) - (adjust.risk - 2) : scenario.id === "flush" ? (2 - adjust.strength) + (2 - adjust.liquidity) + (2 - adjust.risk) : 2 - Math.abs(adjust.strength - adjust.risk);
    return Math.max(1, scenario.probability + bias * 6);
  });
  const probabilities = normalizePercentages(raw);
  return scenarios.map((scenario, index) => ({ ...scenario, probability: probabilities[index] }));
}
