"use client";

import { useEffect, useState } from "react";
import { useAction, useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

export default function SettingsPage() {
  const dashboard = useQuery(api.queries.getStrategyDashboard, {});
  const saveConfig = useMutation(api.mutations.setStrategyConfig);
  const [form, setForm] = useState({
    arbThresholdBps: "5",
    hedgeThresholdUsd: "10",
    minArbTradeUsd: "1",
    maxArbTradeUsd: "5",
    pollIntervalSeconds: "2",
    maxDailyDrawdownPct: "8",
    maxSlippageBps: "250",
    executionMode: "live",
    maxSingleActionUsd: "25",
    maxDailyVolumeUsd: "250",
    rebalanceCooldownSeconds: "45",
    hedgeTwapThresholdUsd: "100",
    minLiquidityUsd: "5000",
    maxMarketDataAgeMs: "15000",
    maxPositionDriftUsd: "25",
    withdrawCooldownSeconds: "120",
  });
  const [saving, setSaving] = useState(false);
  const [rotatingAgent, setRotatingAgent] = useState(false);
  const rotateHyperliquidAgent = useAction(api.publicActions.rotateHyperliquidAgent);

  useEffect(() => {
    if (!dashboard?.config) return;
    setForm({
      arbThresholdBps: String(dashboard.config.arbThresholdBps),
      hedgeThresholdUsd: String(dashboard.config.hedgeThresholdUsd),
      minArbTradeUsd: String(dashboard.config.minArbTradeUsd),
      maxArbTradeUsd: String(dashboard.config.maxArbTradeUsd),
      pollIntervalSeconds: String(dashboard.config.pollIntervalSeconds),
      maxDailyDrawdownPct: String(dashboard.config.maxDailyDrawdownPct),
      maxSlippageBps: String(dashboard.config.maxSlippageBps),
      executionMode: String(dashboard.config.executionMode ?? "live"),
      maxSingleActionUsd: String(dashboard.config.maxSingleActionUsd ?? 25),
      maxDailyVolumeUsd: String(dashboard.config.maxDailyVolumeUsd ?? 250),
      rebalanceCooldownSeconds: String(dashboard.config.rebalanceCooldownSeconds ?? 45),
      hedgeTwapThresholdUsd: String(dashboard.config.hedgeTwapThresholdUsd ?? 100),
      minLiquidityUsd: String(dashboard.config.minLiquidityUsd ?? 5000),
      maxMarketDataAgeMs: String(dashboard.config.maxMarketDataAgeMs ?? 15000),
      maxPositionDriftUsd: String(dashboard.config.maxPositionDriftUsd ?? 25),
      withdrawCooldownSeconds: String(dashboard.config.withdrawCooldownSeconds ?? 120),
    });
  }, [dashboard?.config]);

  if (!dashboard?.hasStrategyAccount) {
    return (
      <StrategyShell title="Settings" subtitle="Strategy guardrails and execution tuning">
        <EmptyState
          title="No strategy account provisioned yet."
          body="Create the managed strategy account before editing thresholds."
        />
      </StrategyShell>
    );
  }

  return (
    <StrategyShell title="Settings" subtitle="Strategy guardrails and execution tuning">
      <Panel title="Moeazi configuration" description="These values are stored as a new versioned strategy config in Convex." tone="lilac">
        <form
          className="settings-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setSaving(true);
            try {
              await saveConfig({
                arbThresholdBps: Number(form.arbThresholdBps),
                hedgeThresholdUsd: Number(form.hedgeThresholdUsd),
                minArbTradeUsd: Number(form.minArbTradeUsd),
                maxArbTradeUsd: Number(form.maxArbTradeUsd),
                pollIntervalSeconds: Number(form.pollIntervalSeconds),
                maxDailyDrawdownPct: Number(form.maxDailyDrawdownPct),
                maxSlippageBps: Number(form.maxSlippageBps),
                executionMode: form.executionMode as "live" | "shadow",
                maxSingleActionUsd: Number(form.maxSingleActionUsd),
                maxDailyVolumeUsd: Number(form.maxDailyVolumeUsd),
                rebalanceCooldownSeconds: Number(form.rebalanceCooldownSeconds),
                hedgeTwapThresholdUsd: Number(form.hedgeTwapThresholdUsd),
                minLiquidityUsd: Number(form.minLiquidityUsd),
                maxMarketDataAgeMs: Number(form.maxMarketDataAgeMs),
                maxPositionDriftUsd: Number(form.maxPositionDriftUsd),
                withdrawCooldownSeconds: Number(form.withdrawCooldownSeconds),
              });
            } finally {
              setSaving(false);
            }
          }}
        >
          {[
            ["Arb threshold (bps)", "arbThresholdBps"],
            ["Hedge threshold (USD)", "hedgeThresholdUsd"],
            ["Min arb trade (USD)", "minArbTradeUsd"],
            ["Max arb trade (USD)", "maxArbTradeUsd"],
            ["Poll interval (seconds)", "pollIntervalSeconds"],
            ["Max daily drawdown (%)", "maxDailyDrawdownPct"],
            ["Max slippage (bps)", "maxSlippageBps"],
            ["Max single action (USD)", "maxSingleActionUsd"],
            ["Max daily volume (USD)", "maxDailyVolumeUsd"],
            ["Rebalance cooldown (s)", "rebalanceCooldownSeconds"],
            ["HL TWAP threshold (USD)", "hedgeTwapThresholdUsd"],
            ["Min pool liquidity", "minLiquidityUsd"],
            ["Max market age (ms)", "maxMarketDataAgeMs"],
            ["Max position drift (USD)", "maxPositionDriftUsd"],
            ["Withdrawal cooldown (s)", "withdrawCooldownSeconds"],
          ].map(([label, key]) => (
            <label key={key} className="field">
              <span>{label}</span>
              <input
                className="text-input"
                value={form[key as keyof typeof form]}
                onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
              />
            </label>
          ))}

          <label className="field">
            <span>Execution mode</span>
            <select
              className="text-input"
              value={form.executionMode}
              onChange={(event) => setForm((current) => ({ ...current, executionMode: event.target.value }))}
            >
              <option value="live">live</option>
              <option value="shadow">shadow</option>
            </select>
          </label>

          <div className="form-actions">
            <button className="primary-button" type="submit" disabled={saving}>
              {saving ? "Saving..." : "Save configuration"}
            </button>
          </div>
        </form>
      </Panel>

      <Panel title="Venue maintenance" description="Operational controls for managed venue credentials" tone="paper">
        <div className="stack-list">
          <p className="muted-copy">Rotating the HyperLiquid agent will require a fresh approval before hedge execution resumes.</p>
          <button
            className="secondary-button"
            disabled={rotatingAgent}
            onClick={async () => {
              setRotatingAgent(true);
              try {
                await rotateHyperliquidAgent({});
              } finally {
                setRotatingAgent(false);
              }
            }}
          >
            {rotatingAgent ? "Rotating..." : "Rotate HyperLiquid agent"}
          </button>
        </div>
      </Panel>
    </StrategyShell>
  );
}
