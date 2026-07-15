"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { formatNumber } from "@/lib/trade/format";
import type { PerpMarket } from "@/lib/trade/types";
import type { PaperVizModel } from "./vizPaperModel";
import type { GalaxyNode, VizTone } from "./vizMetrics";
import { DotMeter } from "./ForceStoryPanels";
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

export default function GalaxyPanel({
  nodes,
  selectedMarket,
  strip,
}: {
  nodes: GalaxyNode[];
  selectedMarket: PerpMarket;
  strip: PaperVizModel["galaxy"];
}) {
  const reduceMotion = useReducedMotion();
  const [selectedId, setSelectedId] = useState(selectedMarket.id);
  const visible = nodes.filter((node) => !node.selected).sort((a, b) => b.weight - a.weight).slice(0, 34);
  const pageSelected = nodes.find((node) => node.selected);
  const inspected = nodes.find((node) => node.id === selectedId) ?? pageSelected ?? nodes[0];
  const leaders = [pageSelected, ...visible].filter(Boolean).slice(0, 8) as GalaxyNode[];

  useEffect(() => {
    setSelectedId(selectedMarket.id);
  }, [selectedMarket.id]);

  return (
    <article className={styles.paperPanel}>
      <div className={styles.panelTitle}>
        <div>
          <h2>MARKET GALAXY</h2>
          <p>Hyperliquid markets orbit by relative activity. Select a bubble to inspect its live state.</p>
        </div>
      </div>
      <div className={styles.galaxyBoard}>
        <svg viewBox="0 0 620 300" role="img" aria-label="Live market galaxy">
          <path className={styles.galaxyDust} d="M16 73C116 31 243 20 366 42S562 104 607 168M20 202C155 148 254 134 378 158s179 59 223 100M45 128C183 87 342 86 562 132" />
          {[88, 140, 198, 248].map((rx, index) => (
            <motion.ellipse key={rx} className={styles.orbitLine} cx="310" cy="148" rx={rx} ry={34 + index * 22} initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: index * 0.08 }} />
          ))}
          {visible.map((node, index) => {
            const point = nodePoint(node, index);
            return (
              <g
                key={node.id}
                role="button"
                tabIndex={0}
                aria-pressed={selectedId === node.id}
                className={`${styles.galaxyBubble} ${selectedId === node.id ? styles.galaxyBubbleActive : ""} ${TONES[node.tone]}`}
                transform={`translate(${point.x} ${point.y})`}
                onClick={() => setSelectedId(node.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    setSelectedId(node.id);
                  }
                }}
              >
                <title>{`${node.label} ${node.changePct >= 0 ? "+" : ""}${formatNumber(node.changePct, 2)}%`}</title>
                <motion.circle r={point.r} initial={reduceMotion ? undefined : { opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(index * 0.015, 0.28) }} />
                {point.r > 13 ? (
                  <>
                    <text y="-2">{node.label}</text>
                    <text y="13">{node.changePct >= 0 ? "+" : ""}{formatNumber(node.changePct, 2)}%</text>
                  </>
                ) : null}
              </g>
            );
          })}
          <g
            role="button"
            tabIndex={0}
            aria-pressed={selectedId === selectedMarket.id}
            className={`${styles.galaxyBubble} ${selectedId === selectedMarket.id ? styles.galaxyBubbleActive : ""} ${styles.toneYellow}`}
            transform="translate(310 148)"
            onClick={() => setSelectedId(pageSelected?.id ?? selectedMarket.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedId(pageSelected?.id ?? selectedMarket.id);
              }
            }}
          >
            <circle r="54" />
            <text y="-4">{selectedMarket.id}</text>
            <text y="17">{pageSelected ? `${pageSelected.changePct >= 0 ? "+" : ""}${formatNumber(pageSelected.changePct, 2)}%` : "LIVE"}</text>
          </g>
        </svg>
      </div>
      <div className={styles.galaxyStrip}>
        <GalaxyInfoCard node={inspected} fallback={selectedMarket.id} />
        <StripMetric label="Strength" value={strip.strength} meter={inspected?.changePct ?? 0} />
        <StripMetric label="Sentiment" value={strip.sentiment} meter={sentimentScore(nodes)} />
        <StripMetric label="Volatility" value={strip.volatility} meter={strip.volatility === "High" ? 92 : strip.volatility === "Medium" ? 58 : 26} />
        <div className={styles.leaderRail}>
          {leaders.map((node) => (
            <button key={node.id} type="button" className={selectedId === node.id ? styles.leaderActive : styles.leaderButton} onClick={() => setSelectedId(node.id)}>
              {node.label}
            </button>
          ))}
        </div>
      </div>
    </article>
  );
}

function GalaxyInfoCard({ node, fallback }: { node: GalaxyNode | undefined; fallback: string }) {
  const change = node?.changePct ?? 0;
  return (
    <div className={`${styles.galaxyInfoCard} ${node ? TONES[node.tone] : ""}`}>
      <span>Selected Market</span>
      <strong>{node?.label ?? fallback}</strong>
      <p>{change >= 0 ? "+" : ""}{formatNumber(change, 2)}% 24h move</p>
      <dl>
        <div><dt>Activity Weight</dt><dd>{formatNumber(node?.weight ?? 0, 0)}</dd></div>
        <div><dt>Bubble Radius</dt><dd>{formatNumber(node?.radius ?? 0, 1)}</dd></div>
      </dl>
    </div>
  );
}

function StripMetric({ label, value, meter }: { label: string; value: string; meter: number }) {
  return (
    <div className={styles.stripMetric}>
      <span>{label}</span>
      <strong>{value}</strong>
      <DotMeter value={Math.abs(meter) > 10 ? Math.abs(meter) : Math.abs(meter) * 10} />
    </div>
  );
}

function nodePoint(node: GalaxyNode, index: number) {
  const orbit = index % 4;
  const angle = Math.atan2(node.y - 50, node.x - 50) + index * 0.11;
  const rx = [250, 200, 152, 108][orbit];
  const ry = [112, 88, 64, 44][orbit];
  const drift = clamp(node.changePct, -8, 8) * 2.2;
  return {
    x: 310 + Math.cos(angle) * rx + drift,
    y: 148 + Math.sin(angle) * ry,
    r: clamp(node.radius * 0.75, 4, 30),
  };
}

function sentimentScore(nodes: GalaxyNode[]) {
  if (nodes.length === 0) return 50;
  return (nodes.filter((node) => node.changePct >= 0).length / nodes.length) * 100;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
