"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { formatNumber, formatUsd } from "@/lib/trade/format";
import type { PerpMarket } from "@/lib/trade/types";
import { DotMeter, PanelTitle, toneClass } from "./VizPrimitives";
import { projectGalaxyForMobile, type GalaxyNode, type GalaxyRenderNode } from "./vizGalaxyModel";
import type { PaperVizModel } from "./vizPaperModel";
import common from "./viz-ui.module.css";
import styles from "./galaxy.module.css";

export default function GalaxyPanel({ nodes, selectedMarket, strip }: { nodes: GalaxyNode[]; selectedMarket: PerpMarket; strip: PaperVizModel["galaxy"] }) {
  const [selectedId, setSelectedId] = useState(selectedMarket.id);
  const mobileNodes = useMemo(() => projectGalaxyForMobile(nodes), [nodes]);
  const inspected = nodes.find((node) => node.id === selectedId) ?? nodes.find((node) => node.selected) ?? nodes[0];
  useEffect(() => setSelectedId(selectedMarket.id), [selectedMarket.id]);
  return (
    <article className={common.paperPanel}>
      <PanelTitle eyebrow="Relative activity map" title="MARKET GALAXY" description="Bubble size reflects volume and open interest. Color reflects the 24-hour move. Select any market to inspect it below." />
      <div className={styles.galaxyBoard}>
        <GalaxySvg nodes={nodes.map((node) => ({ ...node, renderRadius: node.radius }))} selectedId={selectedId} onSelect={setSelectedId} mobile={false} />
        <GalaxySvg nodes={mobileNodes} selectedId={selectedId} onSelect={setSelectedId} mobile />
      </div>
      <div className={styles.inspectionArea}>
        <Inspection node={inspected} fallback={selectedMarket.id} />
        <div className={styles.marketMeters}>
          <StripMetric label="Strength" value={strip.strength} meter={Math.min(100, Math.abs(inspected?.changePct ?? 0) * 14)} />
          <StripMetric label="Sentiment" value={strip.sentiment} meter={sentimentScore(nodes)} />
          <StripMetric label="Volatility" value={strip.volatility} meter={strip.volatility === "High" ? 92 : strip.volatility === "Medium" ? 58 : 26} tone="pink" />
        </div>
      </div>
    </article>
  );
}

function GalaxySvg({ nodes, selectedId, onSelect, mobile }: { nodes: GalaxyRenderNode[]; selectedId: string; onSelect: (id: string) => void; mobile: boolean }) {
  const reduceMotion = useReducedMotion();
  const viewBox = mobile ? "0 0 360 650" : "0 0 1000 520";
  const center = mobile ? { x: 180, y: 290 } : { x: 500, y: 260 };
  return (
    <svg className={mobile ? styles.mobileGalaxy : styles.desktopGalaxy} viewBox={viewBox} role="img" aria-label="Interactive live market galaxy">
      <defs><pattern id={`galaxy-dots-${mobile ? "m" : "d"}`} width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.2" fill="rgba(17,17,17,.12)" /></pattern></defs>
      <rect width="100%" height="100%" fill={`url(#galaxy-dots-${mobile ? "m" : "d"})`} />
      {(mobile ? [{ rx: 104, ry: 108 }, { rx: 152, ry: 198 }, { rx: 176, ry: 288 }] : [{ rx: 225, ry: 132 }, { rx: 350, ry: 202 }, { rx: 458, ry: 238 }]).map((ring, index) => {
        const orbitY = mobile ? 322 : center.y;
        return <g key={index}><ellipse className={styles.orbitLine} cx={center.x} cy={orbitY} rx={ring.rx} ry={ring.ry} /><text className={styles.orbitLabel} x={center.x + 18} y={orbitY - ring.ry + 13}>{["HIGH ACTIVITY", "ACTIVE", "BROADER MARKET"][index]}</text></g>;
      })}
      {nodes.map((node, index) => <GalaxyBubble key={node.id} node={node} inspected={selectedId === node.id} onSelect={onSelect} index={index} reduceMotion={Boolean(reduceMotion)} mobile={mobile} />)}
    </svg>
  );
}

function GalaxyBubble({ node, inspected, onSelect, index, reduceMotion, mobile }: { node: GalaxyRenderNode; inspected: boolean; onSelect: (id: string) => void; index: number; reduceMotion: boolean; mobile: boolean }) {
  const radius = node.renderRadius;
  const showLabel = node.selected || (node.major && (!mobile || index <= 9));
  const showChange = showLabel && radius >= (mobile ? 31 : 25);
  const fontSize = labelSize(node.label, radius, mobile);
  return (
    <g role="button" tabIndex={0} aria-label={`${node.label} ${signed(node.changePct)} 24 hour move`} aria-pressed={inspected} className={`${styles.bubble} ${toneClass(node.tone)} ${inspected ? styles.inspected : ""}`} transform={`translate(${node.x} ${node.y})`} onClick={() => onSelect(node.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelect(node.id); } }}>
      <title>{`${node.label}: ${signed(node.changePct)} 24h`}</title>
      <circle className={styles.hitArea} r={Math.max(radius + 5, mobile ? 26 : 23)} />
      {inspected ? <circle className={styles.selectionRing} r={radius + 8} /> : null}
      <motion.circle className={styles.coinBubble} r={radius} initial={reduceMotion ? undefined : { scale: .88, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: Math.min(index * .025, .28) }} />
      {showLabel ? <><text className={styles.coinLabel} style={{ fontSize }} y={showChange ? -4 : 5}>{node.label}</text>{showChange ? <text className={`${styles.coinChange} ${node.changePct < 0 ? styles.downChange : ""}`} y={fontSize + 5}>{signed(node.changePct)}</text> : null}</> : null}
    </g>
  );
}

function Inspection({ node, fallback }: { node: GalaxyNode | undefined; fallback: string }) {
  return (
    <section className={`${styles.inspection} ${node ? toneClass(node.tone) : ""}`} aria-live="polite">
      <div className={styles.inspectionLead}><span>Inspected market</span><strong>{node?.label ?? fallback}</strong><b className={(node?.changePct ?? 0) >= 0 ? styles.positive : styles.negative}>{signed(node?.changePct ?? 0)}</b><small>24-hour move</small></div>
      <dl>
        <Stat label="Mark price" value={formatUsd(node?.markPrice ?? 0, node?.pricePrecision ?? 2)} />
        <Stat label="24h volume" value={formatUsd(node?.volume24hUsd ?? 0, 0)} />
        <Stat label="Open interest" value={formatUsd(node?.openInterestUsd ?? 0, 0)} />
        <Stat label="Funding / h" value={`${formatNumber((node?.fundingRateHourly ?? 0) * 100, 4)}%`} />
        <Stat label="Max leverage" value={`${node?.maxLeverage ?? 0}x`} />
        <Stat label="Activity tier" value={node?.tier === 0 ? "Route coin" : `Tier ${node?.tier ?? "-"}`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) { return <div><dt>{label}</dt><dd>{value}</dd></div>; }
function StripMetric({ label, value, meter, tone }: { label: string; value: string; meter: number; tone?: "pink" }) { return <div className={styles.stripMetric}><span>{label}</span><strong>{value}</strong><DotMeter value={meter} tone={tone} /></div>; }
function sentimentScore(nodes: GalaxyNode[]) { return nodes.length === 0 ? 50 : (nodes.filter((node) => node.changePct >= 0).length / nodes.length) * 100; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${formatNumber(value, 2)}%`; }
function labelSize(label: string, radius: number, mobile: boolean) { const base = mobile ? (radius >= 42 ? 24 : radius >= 32 ? 18 : 16) : radius >= 60 ? 28 : radius >= 38 ? 18 : radius >= 28 ? 14 : 11; return Math.max(mobile ? 14 : 9, base - Math.max(0, label.length - 4) * (mobile ? .7 : 1.4)); }
