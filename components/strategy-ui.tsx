"use client";

import type { ReactNode } from "react";

type StatusTone = "neutral" | "positive" | "warning" | "danger" | "info";
export type SurfaceTone = "paper" | "sky" | "mint" | "orange" | "lilac" | "rose";

function surfaceClass(tone: SurfaceTone) {
  return `surface-${tone}`;
}

export function Panel({
  title,
  description,
  children,
  actions,
  tone = "paper",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  tone?: SurfaceTone;
}) {
  return (
    <section className={`panel ${surfaceClass(tone)}`}>
      <div className="panel-header">
        <div className="panel-header-copy">
          <p className="panel-kicker">{title}</p>
          {description ? <p className="panel-description">{description}</p> : null}
        </div>
        {actions ? <div className="panel-actions">{actions}</div> : null}
      </div>
      <div className="panel-body">{children}</div>
    </section>
  );
}

export function DisclosureCard({
  title,
  meta,
  badge,
  tone = "paper",
  defaultOpen = false,
  children,
}: {
  title: ReactNode;
  meta?: ReactNode;
  badge?: ReactNode;
  tone?: SurfaceTone;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  return (
    <details className={`disclosure-card ${surfaceClass(tone)}`} open={defaultOpen}>
      <summary className="disclosure-summary">
        <div className="disclosure-summary-copy">
          <h3 className="disclosure-title">{title}</h3>
          {meta ? <div className="disclosure-meta">{meta}</div> : null}
        </div>
        <div className="disclosure-summary-side">
          {badge}
          <span className="disclosure-indicator" aria-hidden="true" />
        </div>
      </summary>
      <div className="disclosure-body">{children}</div>
    </details>
  );
}

export function StatusBadge({ tone = "neutral", children }: { tone?: StatusTone; children: ReactNode }) {
  return <span className={`status-badge status-${tone}`}>{children}</span>;
}

export function MetricCard({
  label,
  value,
  detail,
  tone,
}: {
  label: string;
  value: string;
  detail?: string;
  tone?: SurfaceTone;
}) {
  return (
    <article className={`metric-card${tone ? ` ${surfaceClass(tone)}` : ""}`}>
      <p className="metric-label">{label}</p>
      <p className="metric-value">{value}</p>
      {detail ? <p className="metric-detail">{detail}</p> : null}
    </article>
  );
}

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <h3>{title}</h3>
      <p>{body}</p>
      {action ? <div className="empty-action">{action}</div> : null}
    </div>
  );
}

export function DataRow({
  label,
  value,
}: {
  label: string;
  value: ReactNode;
}) {
  return (
    <div className="data-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
