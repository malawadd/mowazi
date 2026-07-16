"use client";

import { motion, useReducedMotion } from "motion/react";
import { useCallback, useLayoutEffect, useRef, useState } from "react";
import type { PerpMarket } from "@/lib/trade/types";
import ForceNode from "./ForceNode";
import { BarMeter, DotMeter, PanelTitle, toneClass } from "./VizPrimitives";
import { buildConnectorPath, settleForceOffset, type ForceOffset, type ForceSlot } from "./vizLayout";
import type { PaperForceCard, PaperVizModel } from "./vizPaperModel";
import common from "./viz-ui.module.css";
import styles from "./forces.module.css";

const BOARD = { width: 1180, height: 720 };
const CARD = { width: 328, height: 160 };
const SLOTS: Record<string, ForceSlot> = {
  momentum: { x: 32, y: 64, ...CARD }, liquidity: { x: 32, y: 280, ...CARD }, flow: { x: 32, y: 496, ...CARD },
  funding: { x: 820, y: 64, ...CARD }, openInterest: { x: 820, y: 280, ...CARD }, volume: { x: 820, y: 496, ...CARD },
};

type Geometry = { width: number; height: number; core: DOMRectLike; cards: Record<string, DOMRectLike> };
type DOMRectLike = { x: number; y: number; width: number; height: number };

export default function ForcesPanel({ market, paper }: { market: PerpMarket; paper: PaperVizModel }) {
  const reduceMotion = useReducedMotion();
  const boardRef = useRef<HTMLDivElement | null>(null);
  const coreRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLElement | null>>({});
  const dragStarts = useRef<Record<string, ForceOffset>>({});
  const [offsets, setOffsets] = useState<Record<string, ForceOffset>>({});
  const [geometry, setGeometry] = useState<Geometry | null>(null);

  const measure = useCallback(() => {
    const board = boardRef.current;
    const core = coreRef.current;
    if (!board || !core) return;
    const base = board.getBoundingClientRect();
    const cards = Object.fromEntries(Object.entries(cardRefs.current).flatMap(([id, node]) => node ? [[id, relativeRect(node.getBoundingClientRect(), base)]] : []));
    setGeometry({ width: base.width, height: base.height, core: relativeRect(core.getBoundingClientRect(), base), cards });
  }, []);

  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (boardRef.current) observer.observe(boardRef.current);
    if (coreRef.current) observer.observe(coreRef.current);
    Object.values(cardRefs.current).forEach((node) => { if (node) observer.observe(node); });
    return () => observer.disconnect();
  }, [measure, offsets]);

  const finishDrag = (id: string) => {
    const width = boardRef.current?.clientWidth ?? BOARD.width;
    if (width < 900) {
      setOffsets((current) => ({ ...current, [id]: { x: 0, y: 0 } }));
      return;
    }
    setOffsets((current) => ({ ...current, [id]: settleForceOffset(id, current[id] ?? { x: 0, y: 0 }, SLOTS, current, BOARD) }));
  };

  return (
    <article className={common.paperPanel}>
      <PanelTitle eyebrow="Live pressure map" title="FORCE FIELD" description={`Every public-market signal stays connected to ${market.id}. Arrow direction shows whether pressure supports or opposes the token.`} />
      <div className={styles.columnLabels}><span>Price &amp; Flow</span><span>Leverage &amp; Activity</span></div>
      <div ref={boardRef} className={styles.forceBoard}>
        <ConnectorLayer forces={paper.forces} geometry={geometry} reduceMotion={Boolean(reduceMotion)} />
        <div ref={coreRef} className={styles.forceCore}>
          <motion.div className={styles.coinMedallion} animate={reduceMotion ? undefined : { scale: [1, 1.018, 1] }} transition={{ duration: 2.8, repeat: Infinity }}>
            <span>{market.id}</span>
            <strong>{signed(paper.synthesis.netImpact)}</strong>
            <small>Net pressure</small>
          </motion.div>
        </div>
        {paper.forces.map((force) => {
          const slot = SLOTS[force.id] ?? SLOTS.liquidity;
          return <ForceNode key={force.id} force={force} layout={slot} offset={offsets[force.id] ?? { x: 0, y: 0 }} nodeRef={(node) => { cardRefs.current[force.id] = node; }} onDragStart={() => { dragStarts.current[force.id] = offsets[force.id] ?? { x: 0, y: 0 }; }} onOffset={(delta) => { setOffsets((current) => { const start = dragStarts.current[force.id] ?? { x: 0, y: 0 }; return { ...current, [force.id]: { x: start.x + delta.x, y: start.y + delta.y } }; }); }} onDragEnd={() => finishDrag(force.id)} />;
        })}
      </div>
      <div className={styles.forceSummary}>
        <Summary title="Primary pressure" value={paper.synthesis.label} detail="Net alignment across the six live signals." tone="sky" />
        <Summary title="Confidence" value={`${paper.synthesis.confidence}%`} detail="Agreement between directional signals." tone="paper"><DotMeter value={paper.synthesis.confidence} /></Summary>
        <Summary title="Reversal risk" value={`${paper.synthesis.reversalRisk}%`} detail="Volatility and conflicting pressure." tone="yellow"><BarMeter value={paper.synthesis.reversalRisk} /></Summary>
      </div>
    </article>
  );
}

function ConnectorLayer({ forces, geometry, reduceMotion }: { forces: PaperForceCard[]; geometry: Geometry | null; reduceMotion: boolean }) {
  if (!geometry) return null;
  return (
    <svg className={styles.connectorLayer} viewBox={`0 0 ${geometry.width} ${geometry.height}`} aria-hidden="true">
      <defs>
        <marker id="force-support" viewBox="0 0 16 16" refX="13" refY="8" markerWidth="10" markerHeight="10" orient="auto"><path d="M2 2 14 8 2 14 5 8Z" fill="#37a96b" stroke="#111" strokeWidth="1.3" /></marker>
        <marker id="force-risk" viewBox="0 0 16 16" refX="13" refY="8" markerWidth="10" markerHeight="10" orient="auto"><path d="M2 2 14 8 2 14 5 8Z" fill="#f05b86" stroke="#111" strokeWidth="1.3" /></marker>
      </defs>
      {forces.map((force, index) => {
        const card = geometry.cards[force.id];
        if (!card) return null;
        const connector = buildConnectorPath(card, geometry.core, force.score, geometry.width);
        const kind = force.score > 0.08 ? "support" : force.score < -0.08 ? "risk" : "neutral";
        return <g key={force.id} className={styles[kind]}><motion.path d={connector.path} className={styles.connector} style={{ strokeWidth: 3.5 + Math.abs(force.score) * 4 }} markerEnd={kind === "neutral" ? undefined : `url(#force-${kind})`} initial={reduceMotion ? undefined : { pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: .45, delay: index * .04 }} /><circle cx={connector.badge.x} cy={connector.badge.y} r="13" /><text x={connector.badge.x} y={connector.badge.y + 5}>{kind === "support" ? "+" : kind === "risk" ? "-" : "="}</text></g>;
      })}
    </svg>
  );
}

function relativeRect(rect: DOMRect, base: DOMRect): DOMRectLike { return { x: rect.left - base.left, y: rect.top - base.top, width: rect.width, height: rect.height }; }
function signed(value: number) { return `${value > 0 ? "+" : ""}${value.toFixed(2)}`; }
function Summary({ title, value, detail, tone, children }: { title: string; value: string; detail: string; tone: Parameters<typeof toneClass>[0]; children?: React.ReactNode }) { return <article className={`${styles.summaryTile} ${toneClass(tone)}`}><span>{title}</span><strong>{value}</strong><p>{detail}</p>{children}</article>; }
