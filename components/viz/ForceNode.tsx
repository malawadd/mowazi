"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import VizGlyph from "./VizGlyphs";
import type { PaperForceCard } from "./vizPaperModel";
import styles from "./viz-ui.module.css";

export default function ForceNode({
  force,
  layout,
  offset,
  toneClass,
  onDragStart,
  onOffset,
}: {
  force: PaperForceCard;
  layout: { x: number; y: number };
  offset: { x: number; y: number };
  toneClass: string;
  onDragStart: () => void;
  onOffset: (offset: { x: number; y: number }) => void;
}) {
  const pointerStart = useRef<{ x: number; y: number } | null>(null);

  const startDrag = (event: React.PointerEvent<HTMLElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
    onDragStart();
  };
  const moveDrag = (event: React.PointerEvent<HTMLElement>) => {
    if (!pointerStart.current) return;
    onOffset({ x: event.clientX - pointerStart.current.x, y: event.clientY - pointerStart.current.y });
  };
  const stopDrag = (event: React.PointerEvent<HTMLElement>) => {
    pointerStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  return (
    <motion.article
      className={`${styles.forceNode} ${styles.forceCard} ${toneClass}`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      whileHover={{ scale: 1.015 }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      style={{ left: layout.x, top: layout.y, x: offset.x, y: offset.y }}
    >
      <div className={styles.glyphBox}><VizGlyph name={force.glyph} className={styles.glyph} /></div>
      <div className={styles.forceInfo}>
        <h3>{force.title}</h3>
        <span className={`${styles.stanceBadge} ${styles[force.stance]}`}>{force.stance}</span>
        <strong>{force.value}</strong>
        <p>{force.detail}</p>
        <small>{force.meta}</small>
      </div>
    </motion.article>
  );
}
