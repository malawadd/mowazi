import { motion } from "motion/react";
import type { VizStance } from "./vizPaperModel";
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

export function toneClass(tone: VizTone) {
  return TONES[tone];
}

export function PanelTitle({ title, description, eyebrow, actions }: { title: string; description: string; eyebrow?: string; actions?: React.ReactNode }) {
  return (
    <header className={styles.panelTitle}>
      <div>
        {eyebrow ? <span className={styles.eyebrow}>{eyebrow}</span> : null}
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {actions}
    </header>
  );
}

export function StanceBadge({ stance }: { stance: VizStance }) {
  return <span className={`${styles.stanceBadge} ${styles[stance]}`}>{stance}</span>;
}

export function DotMeter({ value, tone = "green" }: { value: number; tone?: "green" | "pink" }) {
  const filled = Math.round(clamp(value, 0, 100) / 20);
  return (
    <div className={styles.dotMeter} aria-label={`${Math.round(value)} percent`}>
      {[0, 1, 2, 3, 4].map((item) => <i key={item} data-on={item < filled} style={tone === "pink" && item < filled ? { background: "var(--surface-pink)" } : undefined} />)}
    </div>
  );
}

export function BarMeter({ value }: { value: number }) {
  const filled = Math.round(clamp(Math.abs(value), 0, 100) / 20);
  return <div className={styles.barMeter}>{[0, 1, 2, 3, 4].map((item) => <i key={item} data-hot={item < filled} />)}</div>;
}

export function Enter({ children, className }: { children: React.ReactNode; className?: string }) {
  return <motion.div className={className} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>{children}</motion.div>;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : 0));
}
