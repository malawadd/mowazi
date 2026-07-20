"use client";

import { useCallback, useEffect, useState } from "react";
import { agentRequest, type RuntimeControls } from "@/lib/agentBackend";
import styles from "./agent-lab.module.css";

const CONFIRMATION = "DISABLE SAFEGUARD";

export default function RuntimeControlsPanel() {
  const [controls, setControls] = useState<RuntimeControls | null>(null);
  const [pending, setPending] = useState<"manual_guard" | "lite_mode" | null>(null);
  const [confirmation, setConfirmation] = useState("");
  const [message, setMessage] = useState("Loading safe defaults…");
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setControls(await agentRequest<RuntimeControls>("internal/runtime-controls"));
      setMessage("Runtime controls loaded");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const patch = async (field: "manual_guard" | "lite_mode", enabled: boolean, phrase?: string) => {
    if (!controls) return;
    setSaving(true);
    try {
      const next = await agentRequest<RuntimeControls>("internal/runtime-controls", {
        method: "PATCH",
        body: JSON.stringify({
          [field]: enabled,
          expected_version: controls.version,
          confirmation: phrase,
          updated_by: "agent-lab",
        }),
      });
      setControls(next);
      setMessage(`${field === "manual_guard" ? "Manual Guard" : "Lite Mode"} ${enabled ? "enabled" : "disabled"}`);
      setPending(null);
      setConfirmation("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const toggle = (field: "manual_guard" | "lite_mode") => {
    if (!controls) return;
    const next = !controls[field];
    if (!next) setPending(field);
    else void patch(field, true);
  };

  const restore = async () => {
    if (!controls) return;
    setSaving(true);
    try {
      const next = await agentRequest<RuntimeControls>("internal/runtime-controls", {
        method: "PATCH",
        body: JSON.stringify({
          manual_guard: true, lite_mode: true,
          expected_version: controls.version, updated_by: "agent-lab",
        }),
      });
      setControls(next);
      setPending(null);
      setMessage("Safe defaults restored");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setSaving(false);
    }
  };

  const limits = controls?.limits;
  return (
    <section className={styles.safetyPanel} aria-labelledby="dev-safety-title">
      <div className={styles.safetyHead}>
        <div>
          <p>Development safety</p>
          <h2 id="dev-safety-title">Resource controls</h2>
          <span>These switches never appear in the customer portal.</span>
        </div>
        <button type="button" disabled={saving || !controls} onClick={() => void restore()}>
          Restore safe defaults
        </button>
      </div>
      <div className={styles.switchGrid}>
        <SafetySwitch
          label="Manual Guard"
          detail="Blocks cadence and event dispatch. Explicit runs remain available."
          checked={controls?.manual_guard ?? true}
          disabled={saving || !controls}
          onClick={() => toggle("manual_guard")}
        />
        <SafetySwitch
          label="Lite Mode"
          detail="Clamps calls, tokens, evidence, cadence, concurrency, and daily spend."
          checked={controls?.lite_mode ?? true}
          disabled={saving || !controls}
          onClick={() => toggle("lite_mode")}
        />
      </div>
      {limits ? (
        <div className={styles.limitStrip}>
          <span><b>{limits.specialistCalls}</b> calls/run</span>
          <span><b>{limits.accountRunsPerDay}</b> runs/account/day</span>
          <span><b>{limits.globalRunsPerDay}</b> runs/global/day</span>
          <span><b>${limits.providerBudgetUsd.toFixed(2)}</b> provider cap/day</span>
          <span><b>{limits.maxOutputTokens}</b> output tokens/call</span>
          <span><b>{controls?.usage.globalRunsToday ?? 0}</b> runs used today</span>
          <span><b>${(controls?.usage.providerSpendUsd ?? 0).toFixed(3)}</b> reserved spend today</span>
          <span><b>{controls?.usage.latestRun?.convex_operations ?? 0}</b> Convex ops/latest run</span>
        </div>
      ) : null}
      <p className={styles.safetyMessage}>{message}{controls ? ` · revision ${controls.version}` : ""}</p>
      {pending ? (
        <div className={styles.confirmBox} role="alertdialog" aria-labelledby="disable-safeguard-title">
          <h3 id="disable-safeguard-title">Confirm higher resource use</h3>
          <p>Disabling this safeguard may start automatic work or use the full provider route. Type <b>{CONFIRMATION}</b> to continue.</p>
          <input autoFocus value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
          <div>
            <button type="button" onClick={() => { setPending(null); setConfirmation(""); }}>Keep safeguard on</button>
            <button
              type="button"
              disabled={confirmation !== CONFIRMATION || saving}
              onClick={() => void patch(pending, false, confirmation)}
            >
              Disable safeguard
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

function SafetySwitch(props: {
  label: string; detail: string; checked: boolean; disabled: boolean; onClick: () => void;
}) {
  return (
    <button className={styles.safetySwitch} type="button" role="switch"
      aria-checked={props.checked} disabled={props.disabled} onClick={props.onClick}>
      <span><b>{props.label}</b><small>{props.detail}</small></span>
      <i data-on={props.checked}>{props.checked ? "ON" : "OFF"}</i>
    </button>
  );
}
