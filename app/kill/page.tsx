"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import StrategyShell from "@/components/StrategyShell";
import { EmptyState, Panel } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";

export default function KillPage() {
  const dashboard = useQuery(api.queries.getStrategyDashboard, {});
  const pauseStrategy = useMutation(api.mutations.pauseStrategy);
  const [reason, setReason] = useState("Operator requested emergency stop.");
  const [stopping, setStopping] = useState(false);

  if (!dashboard?.hasStrategyAccount) {
    return (
      <StrategyShell title="Emergency Stop" subtitle="Immediately pause trading activity and surface a critical alert">
        <EmptyState
          title="No strategy account provisioned yet."
          body="Emergency controls become available once the strategy account exists."
        />
      </StrategyShell>
    );
  }

  return (
    <StrategyShell title="Emergency Stop" subtitle="Immediately pause trading activity and surface a critical alert">
      <Panel title="Kill switch" description="This changes the strategy state to emergency stopped and writes a critical alert into Convex." tone="rose">
        <div className="stack-list">
          <label className="field">
            <span>Reason</span>
            <textarea
              className="text-input textarea-input"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <button
            className="danger-button"
            disabled={stopping}
            onClick={async () => {
              setStopping(true);
              try {
                await pauseStrategy({ reason, emergencyStop: true });
              } finally {
                setStopping(false);
              }
            }}
          >
            {stopping ? "Stopping..." : "Engage emergency stop"}
          </button>
        </div>
      </Panel>
    </StrategyShell>
  );
}
