"use client";

import { extent } from "d3-array";
import { motion, useReducedMotion } from "motion/react";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { formatUsd } from "@/lib/trade/format";
import VizGlyph from "./VizGlyphs";
import { PanelTitle, toneClass } from "./VizPrimitives";
import type { PaperStoryPhase } from "./vizPaperModel";
import type { StorySegment } from "./vizMetrics";
import common from "./viz-ui.module.css";
import styles from "./story.module.css";

const CHART = { left: 82, right: 962, top: 78, bottom: 376 };

export default function StoryPanel({ interval, phases, story, onIntervalChange }: { interval: string; phases: PaperStoryPhase[]; story: StorySegment[]; onIntervalChange: (interval: string) => void }) {
  const controls = (
    <div className={styles.storyControls}>
      <span>Timeframe</span>
      {['5m', '15m', '1h', '1d'].map((item) => <button key={item} type="button" aria-pressed={interval === item} onClick={() => onIntervalChange(item)}>{item}</button>)}
    </div>
  );
  return (
    <article className={common.paperPanel}>
      <PanelTitle eyebrow="Candle-derived chronology" title="PRICE STORY" description="Five chronological windows show the actual loaded price path, detected phase, activity, and strongest event." actions={controls} />
      <StoryChart phases={phases} story={story} />
      <div className={styles.phaseEvidence}>
        {phases.map((phase, index) => <PhaseEvidence key={phase.id} phase={phase} index={index} />)}
      </div>
      <div className={styles.storyInsight}>
        <strong>Current read</strong>
        <p>{phases.at(-1)?.insight ?? "Waiting for enough candles to classify the current window."}</p>
        <span>Public candle data only</span>
      </div>
    </article>
  );
}

function StoryChart({ phases, story }: { phases: PaperStoryPhase[]; story: StorySegment[] }) {
  const reduceMotion = useReducedMotion();
  const points = buildPoints(story);
  const last = points.at(-1) ?? { x: CHART.right, y: (CHART.top + CHART.bottom) / 2, row: story[0] };
  const priceValues = story.flatMap((row) => [row.low, row.high]).filter((value) => value > 0);
  const [low = 0, high = 1] = extent(priceValues);
  const axis = [high, high - (high - low) / 2, low];
  return (
    <div className={styles.timelineViewport}>
      <svg className={styles.timelineChart} viewBox="0 0 1000 440" role="img" aria-label="Candle-derived price story timeline">
        {phases.map((phase, index) => <g key={phase.id} className={toneClass(phase.tone)}><rect className={styles.phaseBand} x={CHART.left + index * 176} y="28" width="176" height="366" /><text className={styles.phaseNumber} x={CHART.left + 88 + index * 176} y="58">{index + 1}</text><text className={styles.phaseName} x={CHART.left + 88 + index * 176} y="78">{phase.title.toUpperCase()}</text><text className={styles.phaseTime} x={CHART.left + 88 + index * 176} y="96">{phase.timeRange}</text></g>)}
        {axis.map((price, index) => { const y = CHART.top + index * ((CHART.bottom - CHART.top) / 2); return <g key={index}><line className={styles.gridLine} x1={CHART.left} x2={CHART.right} y1={y} y2={y} /><text className={styles.axisLabel} x="10" y={y + 4}>{formatUsd(price, price >= 100 ? 0 : 2)}</text></g>; })}
        <LinePath data={points} x={(point) => point.x} y={(point) => point.y} className={styles.priceTrace} />
        {points.filter((point) => (point.row?.volumeScore ?? 0) > .72).map((point) => <g key={point.row?.id}><circle className={styles.volumeHalo} cx={point.x} cy={point.y} r="10" /><circle className={styles.volumePin} cx={point.x} cy={point.y} r="4" /></g>)}
        <motion.circle className={styles.currentPin} cx={last.x} cy={last.y} r="7" animate={reduceMotion ? undefined : { scale: [1, 1.28, 1] }} transition={{ duration: 1.8, repeat: Infinity }} />
        <g transform={`translate(${Math.min(last.x + 12, 865)} ${Math.max(110, last.y - 18)})`}><rect className={styles.priceLabelBox} width="88" height="28" /><text className={styles.priceLabel} x="44" y="19">{formatUsd(last.row?.close ?? 0, (last.row?.close ?? 0) >= 100 ? 0 : 3)}</text></g>
      </svg>
    </div>
  );
}

function PhaseEvidence({ phase, index }: { phase: PaperStoryPhase; index: number }) {
  return (
    <article className={`${styles.evidenceCard} ${toneClass(phase.tone)}`}>
      <div className={styles.evidenceIcon}><VizGlyph name={phase.glyph} className={styles.glyph} /><b>{index + 1}</b></div>
      <div><span>{phase.catalyst}</span><strong>{signed(phase.changePct)}</strong><p>{phase.detail}</p><small>{phase.catalystTime} · volume {Math.round(phase.volumeIntensity * 100)}%</small></div>
    </article>
  );
}

function buildPoints(story: StorySegment[]) {
  const rows = story.length > 1 ? story : [story[0], { ...story[0], id: "fallback-2", time: (story[0]?.time ?? 0) + 1 }].filter(Boolean) as StorySegment[];
  const times = rows.map((row) => row.time);
  const prices = rows.map((row) => row.close);
  const [minTime = 0, maxTime = 1] = extent(times);
  const [minPrice = 0, maxPrice = 1] = extent(prices);
  const x = scaleLinear({ domain: [minTime, maxTime === minTime ? minTime + 1 : maxTime], range: [CHART.left, CHART.right] });
  const y = scaleLinear({ domain: [minPrice, maxPrice === minPrice ? minPrice + 1 : maxPrice], range: [CHART.bottom, CHART.top] });
  return rows.map((row) => ({ x: x(row.time), y: y(row.close), row }));
}

function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}%`; }
