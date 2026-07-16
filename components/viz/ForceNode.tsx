"use client";

import { motion } from "motion/react";
import { useRef } from "react";
import VizGlyph from "./VizGlyphs";
import { StanceBadge, toneClass } from "./VizPrimitives";
import type { PaperForceCard } from "./vizPaperModel";
import styles from "./forces.module.css";

export default function ForceNode({
  force,
  layout,
  offset,
  nodeRef,
  onDragStart,
  onOffset,
  onDragEnd,
}: {
  force: PaperForceCard;
  layout: { x: number; y: number };
  offset: { x: number; y: number };
  nodeRef: (node: HTMLElement | null) => void;
  onDragStart: () => void;
  onOffset: (offset: { x: number; y: number }) => void;
  onDragEnd: () => void;
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
    if (!pointerStart.current) return;
    pointerStart.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    onDragEnd();
  };

  return (
    <motion.article
      ref={nodeRef}
      className={`${styles.forceNode} ${toneClass(force.tone)}`}
      data-column={force.column}
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ y: -2 }}
      onPointerDown={startDrag}
      onPointerMove={moveDrag}
      onPointerUp={stopDrag}
      onPointerCancel={stopDrag}
      style={{ left: layout.x, top: layout.y, x: offset.x, y: offset.y }}
    >
      <div className={styles.glyphBox}><VizGlyph name={force.glyph} className={styles.glyph} /></div>
      <div className={styles.forceInfo}>
        <h3>{force.title}</h3>
        <StanceBadge stance={force.stance} />
        <strong>{force.value}</strong>
        <p>{force.detail}</p>
        <small>{force.meta}</small>
      </div>
    </motion.article>
  );
}
