"use client";

import styles from "@/components/agents/agent-portal.module.css";
import type { OpenRouterPreferences } from "@/lib/modelProviders";

type Props = {
  value: OpenRouterPreferences;
  onChange: (value: OpenRouterPreferences) => void;
  onPrivacyRelaxed: () => void;
};

const list = (value: string) => value.split(",").map((item) => item.trim()).filter(Boolean);

export default function OpenRouterControls({ value, onChange, onPrivacyRelaxed }: Props) {
  const update = (change: Partial<OpenRouterPreferences>) => onChange({ ...value, ...change });
  const privacy = (change: Partial<OpenRouterPreferences>, warning: string) => {
    const relaxing = change.zeroDataRetention === false || change.dataCollection === "allow";
    if (relaxing && !window.confirm(warning)) return;
    if (relaxing) onPrivacyRelaxed();
    update(change);
  };

  return <details className={styles.rateFields}>
    <summary>OpenRouter routing and privacy</summary>
    <label>Optimize upstream routing
      <select value={value.sort} onChange={(event) => update({
        sort: event.target.value as OpenRouterPreferences["sort"],
      })}>
        <option value="price">Lowest price</option>
        <option value="latency">Lowest latency</option>
        <option value="throughput">Highest throughput</option>
      </select>
    </label>
    <label className={styles.checkRow}>
      <input type="checkbox" checked={value.allowFallbacks}
        onChange={(event) => update({ allowFallbacks: event.target.checked })} />
      Allow another host for the same model if the first host fails
    </label>
    <label>Allowed upstream hosts
      <input value={value.allowedProviders.join(", ")}
        onChange={(event) => update({ allowedProviders: list(event.target.value) })}
        placeholder="Optional: anthropic, google-vertex" />
    </label>
    <label>Ignored upstream hosts
      <input value={value.ignoredProviders.join(", ")}
        onChange={(event) => update({ ignoredProviders: list(event.target.value) })}
        placeholder="Optional: provider slug" />
    </label>
    <label className={styles.checkRow}>
      <input type="checkbox" checked={value.zeroDataRetention}
        onChange={(event) => privacy(
          { zeroDataRetention: event.target.checked },
          "Turning off zero-data-retention may send trading evidence to hosts that retain request data. Continue?",
        )} />
      Require zero-data-retention hosts
    </label>
    <label className={styles.checkRow}>
      <input type="checkbox" checked={value.dataCollection === "deny"}
        onChange={(event) => privacy(
          { dataCollection: event.target.checked ? "deny" : "allow" },
          "Allowing data collection may let an upstream host store agent inputs or outputs. Continue?",
        )} />
      Exclude hosts that may collect request data
    </label>
    <small>Strict JSON support and the confirmed maximum price are always enforced.</small>
  </details>;
}
