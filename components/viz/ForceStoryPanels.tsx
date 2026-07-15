"use client";

import { extent } from "d3-array";
import { motion, useReducedMotion } from "motion/react";
import { Group } from "@visx/group";
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { useRef, useState } from "react";
import type { PerpMarket } from "@/lib/trade/types";
import ForceNode from "./ForceNode";
import VizGlyph from "./VizGlyphs";
import type { PaperForceCard, PaperStoryPhase, PaperVizModel } from "./vizPaperModel";
import type { StorySegment, VizTone } from "./vizMetrics";
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

const FORCE_CARD = { width: 332, height: 154 };
const FORCE_CORE = { x: 590, y: 350 };
const FORCE_LAYOUTS: Record<string, { x: number; y: number; side: PaperForceCard["side"]; lane: number }> = {
  momentum: { x: 34, y: 52, side: "support", lane: -1 },
  liquidity: { x: 34, y: 270, side: "support", lane: 0 },
  flow: { x: 34, y: 488, side: "support", lane: 1 },
  funding: { x: 814, y: 52, side: "risk", lane: -1 },
  openInterest: { x: 814, y: 270, side: "risk", lane: 0 },
  volume: { x: 814, y: 488, side: "risk", lane: 1 },
};

export function ForcesPanel({ market, paper }: { market: PerpMarket; paper: PaperVizModel }) {
  const reduceMotion = useReducedMotion();
  const [offsets, setOffsets] = useState<Record<string, { x: number; y: number }>>({});
  const dragStarts = useRef<Record<string, { x: number; y: number }>>({});
  const draw = reduceMotion ? { pathLength: 1 } : { pathLength: 1 };
  const initialDraw = reduceMotion ? { pathLength: 1 } : { pathLength: 0 };

  return (
    <article className={styles.paperPanel}>
      <div className={styles.panelTitle}>
        <div>
          <h2>FORCE FIELD</h2>
          <p>Live public-market proxies push into the current {market.id} pressure.</p>
        </div>
      </div>
      <div className={styles.forceBoard}>
        <svg className={styles.forceConnectorLayer} viewBox="0 0 1180 700" aria-hidden="true">
          <defs>
            <marker id="force-arrow-support" viewBox="0 0 16 16" refX="13" refY="8" markerWidth="12" markerHeight="12" orient="auto">
              <path d="M2 2 14 8 2 14 5 8Z" fill="#37a96b" stroke="#111" strokeWidth="1.5" />
            </marker>
            <marker id="force-arrow-risk" viewBox="0 0 16 16" refX="13" refY="8" markerWidth="12" markerHeight="12" orient="auto">
              <path d="M2 2 14 8 2 14 5 8Z" fill="#f05b86" stroke="#111" strokeWidth="1.5" />
            </marker>
          </defs>
          {paper.forces.map((force, index) => {
            const layout = forceLayout(force);
            const offset = offsets[force.id] ?? { x: 0, y: 0 };
            const badge = badgePoint(layout, offset);
            return (
              <g key={force.id} className={force.side === "support" ? styles.forceSupportLine : styles.forceRiskLine}>
                <motion.path
                  className={styles.forceConnection}
                  d={connectorPath(layout, offset)}
                  initial={initialDraw}
                  animate={draw}
                  transition={{ duration: 0.45, delay: index * 0.04 }}
                  markerEnd={`url(#force-arrow-${force.side})`}
                />
                <circle className={styles.arrowBadge} cx={badge.x} cy={badge.y} r="14" />
                <text className={styles.forceConnectorSign} x={badge.x} y={badge.y + 6}>{force.side === "support" ? "+" : "-"}</text>
              </g>
            );
          })}
        </svg>
        <div className={styles.forceCore}>
          <motion.div className={styles.coinMedallion} animate={reduceMotion ? undefined : { scale: [1, 1.025, 1] }} transition={{ duration: 2.4, repeat: Infinity }}>
            <span>{market.id}</span>
            <strong>{paper.synthesis.netImpact > 0 ? "+" : ""}{paper.synthesis.netImpact.toFixed(2)}</strong>
            <small>Net Impact</small>
          </motion.div>
        </div>
        {paper.forces.map((force) => {
          const layout = forceLayout(force);
          return (
            <ForceNode
              key={force.id}
              force={force}
              layout={layout}
              offset={offsets[force.id] ?? { x: 0, y: 0 }}
              toneClass={TONES[force.tone]}
              onDragStart={() => {
                dragStarts.current[force.id] = offsets[force.id] ?? { x: 0, y: 0 };
              }}
              onOffset={(delta) => {
                setOffsets((current) => {
                  const start = dragStarts.current[force.id] ?? current[force.id] ?? { x: 0, y: 0 };
                  return { ...current, [force.id]: { x: start.x + delta.x, y: start.y + delta.y } };
                });
              }}
            />
          );
        })}
      </div>
      <div className={styles.forceSummary}>
        <SummaryCard title="Primary Pressure" value={paper.synthesis.stance.toUpperCase()} detail={`${paper.synthesis.label} from live public data.`} tone="sky" />
        <SummaryCard title="Confidence" value={`${paper.synthesis.confidence}%`} detail="Alignment across force cards." tone="paper">
          <DotMeter value={paper.synthesis.confidence} />
        </SummaryCard>
        <SummaryCard title="Reversal Risk" value={`${paper.synthesis.reversalRisk}%`} detail="Volatility and disagreement pressure." tone="yellow">
          <BarMeter value={paper.synthesis.netImpact} />
        </SummaryCard>
      </div>
    </article>
  );
}

export function StoryPanel({
  interval,
  phases,
  story,
  onIntervalChange,
}: {
  interval: string;
  phases: PaperStoryPhase[];
  story: StorySegment[];
  onIntervalChange: (interval: string) => void;
}) {
  const reduceMotion = useReducedMotion();
  const trace = buildTrace(story);
  return (
    <article className={styles.paperPanel}>
      <div className={styles.panelTitle}>
        <div>
          <h2>PRICE STORY TIMELINE</h2>
          <p>How the loaded candles move through phases and pressure pockets.</p>
        </div>
        <div className={styles.storyControls}>
          <span>TIMEFRAME</span>
          {["5m", "15m", "1h", "1d"].map((item) => (
            <button key={item} type="button" aria-pressed={interval === item} onClick={() => onIntervalChange(item)}>
              {item}
            </button>
          ))}
        </div>
      </div>
      <div className={styles.timelineBoard}>
        <svg viewBox="0 0 520 230" role="img" aria-label="Price story timeline">
          {[0, 1, 2, 3, 4].map((index) => (
            <rect key={phases[index].id} className={`${styles.phaseBand} ${TONES[phases[index].tone]}`} x={50 + index * 90} y="12" width="90" height="170" />
          ))}
          {[28, 65, 102, 139, 176].map((y, index) => (
            <g key={y}>
              <line className={styles.timelineGrid} x1="50" y1={y} x2="500" y2={y} />
              <text className={styles.axisLabel} x="18" y={y + 4}>{["High", "", "Mid", "", "Low"][index]}</text>
            </g>
          ))}
          {phases.map((phase, index) => (
            <g key={phase.id}>
              <line className={styles.phaseDivider} x1={50 + index * 90} y1="12" x2={50 + index * 90} y2="182" />
              <text className={styles.phaseNumber} x={95 + index * 90} y="32">{index + 1}</text>
              <text className={styles.phaseName} x={95 + index * 90} y="54">{phase.title.toUpperCase()}</text>
            </g>
          ))}
          <Group>
            <LinePath data={trace} x={(point) => point.x} y={(point) => point.y} className={styles.priceTrace} />
            <motion.circle className={styles.tracePin} cx={traceLast(trace).x} cy={traceLast(trace).y} r="6" animate={reduceMotion ? undefined : { scale: [1, 1.25, 1] }} transition={{ duration: 1.6, repeat: Infinity }} />
          </Group>
        </svg>
      </div>
      <div className={styles.catalystRow}>
        <div className={styles.keyCard}>KEY<br />CATALYSTS</div>
        {phases.map((phase) => (
          <article key={phase.id} className={`${styles.catalystCard} ${TONES[phase.tone]}`}>
            <VizGlyph name={phase.glyph} className={styles.smallGlyph} />
            <strong>{phase.catalyst}</strong>
            <span>{phase.changePct > 0 ? "+" : ""}{phase.changePct.toFixed(2)}%</span>
          </article>
        ))}
      </div>
      <div className={styles.insightRow}>
        <strong>STORY INSIGHTS</strong>
        {phases.map((phase) => <span key={phase.id} className={TONES[phase.tone]}>{phase.insight}</span>)}
      </div>
    </article>
  );
}

function forceLayout(force: PaperForceCard) {
  return FORCE_LAYOUTS[force.id] ?? {
    x: force.side === "support" ? 34 : 814,
    y: 270,
    side: force.side,
    lane: 0,
  };
}

function connectorPath(layout: { x: number; y: number; side: PaperForceCard["side"]; lane: number }, offset: { x: number; y: number }) {
  const fromX = layout.x + offset.x + (layout.side === "support" ? FORCE_CARD.width : 0);
  const fromY = layout.y + offset.y + FORCE_CARD.height / 2;
  const toX = FORCE_CORE.x + (layout.side === "support" ? -126 : 126);
  const toY = FORCE_CORE.y + layout.lane * 74;
  const bend = layout.side === "support" ? 104 : -104;
  return `M${fromX} ${fromY} C${fromX + bend} ${fromY} ${toX - bend} ${toY} ${toX} ${toY}`;
}

function badgePoint(layout: { x: number; y: number; side: PaperForceCard["side"] }, offset: { x: number; y: number }) {
  return {
    x: layout.x + offset.x + (layout.side === "support" ? FORCE_CARD.width + 56 : -56),
    y: layout.y + offset.y + FORCE_CARD.height / 2,
  };
}

function SummaryCard({ title, value, detail, tone, children }: { title: string; value: string; detail: string; tone: VizTone; children?: React.ReactNode }) {
  return (
    <motion.article className={`${styles.summaryTile} ${TONES[tone]}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
      <span>{title}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
      {children}
    </motion.article>
  );
}

export function DotMeter({ value }: { value: number }) {
  const filled = Math.round(clamp(value, 0, 100) / 20);
  return <div className={styles.dotMeter}>{[0, 1, 2, 3, 4].map((item) => <i key={item} data-on={item < filled} />)}</div>;
}

function BarMeter({ value }: { value: number }) {
  return <div className={styles.barMeter}>{[-2, -1, 0, 1, 2].map((item) => <i key={item} data-hot={Math.sign(value) === Math.sign(item) && item !== 0} />)}</div>;
}

function buildTrace(story: StorySegment[]) {
  let cursor = 100;
  const rows = story.length > 1 ? story : [{ changePct: 0 }, { changePct: 0.5 }, { changePct: -0.2 }, { changePct: 0.3 }];
  const values = rows.map((item) => {
    cursor += item.changePct;
    return cursor;
  });
  const [min = 99, max = 101] = extent(values);
  const xScale = scaleLinear({ domain: [0, Math.max(1, values.length - 1)], range: [50, 500] });
  const yScale = scaleLinear({ domain: [min, max === min ? min + 1 : max], range: [172, 40] });
  return values.map((value, index) => ({ x: xScale(index), y: yScale(value), value }));
}

function traceLast(points: Array<{ x: number; y: number }>) {
  return points.at(-1) ?? { x: 500, y: 90 };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
