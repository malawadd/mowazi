"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation } from "convex/react";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import { api } from "@/convex/_generated/api";
import { estimateModelRouting } from "@/convex/helpers/modelRouting";
import styles from "@/components/agents/agent-portal.module.css";
import {
  platformModels, presetRouting, specialistRoles,
  type AccessibleModel, type ModelProvider, type ModelRoute,
  type ModelRoutingDocument, type ProviderConnection,
} from "@/lib/modelProviders";

type Preset = "economy" | "balanced" | "quality" | "custom";
type Props = {
  connections: ProviderConnection[];
  effective?: { routes?: ModelRoutingDocument; preset?: Preset; version?: number; status?: string } | null;
  tier: "focus" | "pro" | "max";
};

const labels: Record<string, string> = {
  specialist_default: "Specialist default", synthesis: "Final synthesis", critic: "Critic",
  arbiter: "Max arbiter", openai_synthesis: "OpenAI synthesis", deepseek_synthesis: "DeepSeek synthesis",
  policy_draft: "Policy drafting",
};

export default function ModelRoutingEditor({ connections, effective, tier }: Props) {
  const save = useMutation(api.agentModels.saveModelConfigurationDraft);
  const activate = useMutation(api.agentModels.activateModelConfiguration);
  const [preset, setPreset] = useState<Preset>("balanced");
  const [routing, setRouting] = useState<ModelRoutingDocument>(() => presetRouting("balanced"));
  const [dailyUsd, setDailyUsd] = useState(0.25);
  const [retries, setRetries] = useState(0);
  const [advanced, setAdvanced] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!effective?.routes) return;
    setRouting(effective.routes);
    setPreset(effective.preset ?? "custom");
  }, [effective]);

  const visibleRoutes = useMemo(() => routing.routes.filter((route) =>
    advanced || !route.slot.startsWith("role:")), [routing, advanced]);
  const usesByok = routing.routes.some((route) => route.credentialSource === "byok");
  const estimate = useMemo(() => estimateModelRouting(routing, tier), [routing, tier]);

  const replaceRoute = (slot: string, update: Partial<ModelRoute>) => {
    setPreset("custom");
    setRouting((document) => ({
      ...document,
      routes: document.routes.map((route) => route.slot === slot ? { ...route, ...update } : route),
    }));
  };

  const modelsFor = (route: ModelRoute): AccessibleModel[] => {
    if (route.credentialSource === "platform") return platformModels[route.provider];
    return connections.find((item) => item._id === route.connectionId)?.models ?? [];
  };

  const chooseProvider = (route: ModelRoute, provider: ModelProvider) => {
    const model = platformModels[provider][0];
    replaceRoute(route.slot, {
      provider, model: model.id, credentialSource: "platform", connectionId: undefined,
      inputPriceMicrousdPerMillion: model.inputPriceMicrousdPerMillion,
      cachedInputPriceMicrousdPerMillion: model.cachedInputPriceMicrousdPerMillion,
      outputPriceMicrousdPerMillion: model.outputPriceMicrousdPerMillion,
    });
  };

  const chooseCredential = (route: ModelRoute, value: string) => {
    const connection = connections.find((item) => item._id === value);
    const model = connection?.models[0] ?? platformModels[route.provider][0];
    replaceRoute(route.slot, {
      credentialSource: connection ? "byok" : "platform", connectionId: connection?._id,
      model: model.id, inputPriceMicrousdPerMillion: model.inputPriceMicrousdPerMillion,
      cachedInputPriceMicrousdPerMillion: model.cachedInputPriceMicrousdPerMillion,
      outputPriceMicrousdPerMillion: model.outputPriceMicrousdPerMillion,
    });
  };

  const chooseModel = (route: ModelRoute, modelId: string) => {
    const model = modelsFor(route).find((item) => item.id === modelId);
    replaceRoute(route.slot, {
      model: modelId,
      ...(model ? {
        inputPriceMicrousdPerMillion: model.inputPriceMicrousdPerMillion,
        cachedInputPriceMicrousdPerMillion: model.cachedInputPriceMicrousdPerMillion,
        outputPriceMicrousdPerMillion: model.outputPriceMicrousdPerMillion,
      } : {}),
    });
  };

  const saveAndActivate = async () => {
    setBusy(true); setMessage(null);
    try {
      const draft = await save({
        preset, routesJson: JSON.stringify(routing),
        providerDailyLimitMicrousd: Math.round(dailyUsd * 1_000_000), retries,
      });
      await activate({ configurationId: draft.configurationId, confirmed });
      setMessage(`Model route v${draft.version} activated: ${draft.credits} maximum infrastructure credits per ${tier} run.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };

  return <Panel title="Agent model route" description="Presets first, exact node control when you need it" tone="paper">
    <div className={styles.presetGrid}>
      {(["economy", "balanced", "quality"] as const).map((item) => <button type="button" key={item}
        aria-pressed={preset === item} onClick={() => { setPreset(item); setRouting(presetRouting(item)); }}>
        <strong>{item}</strong><span>{item === "economy" ? "Small, efficient models" : item === "balanced" ? "Mixed cost and quality" : "Quality-first synthesis"}</span>
      </button>)}
    </div>
    <div className={styles.routeHeader}>
      <div><p className={styles.eyebrow}>Active profile</p><h3>{tier} team · route v{effective?.version ?? 0}</h3></div>
      <StatusBadge tone={effective?.status === "active" ? "positive" : "warning"}>{effective?.status ?? "legacy"}</StatusBadge>
    </div>
    <div className={styles.routeTable}>
      {visibleRoutes.map((route) => {
        const options = modelsFor(route);
        const compatible = route.credentialSource === "platform"
          || connections.find((item) => item._id === route.connectionId)?.capabilities.compatibleModels?.includes(route.model);
        return <article className={styles.routeRow} key={route.slot}>
          <div><p className={styles.eyebrow}>{route.slot.startsWith("role:") ? "Specialist override" : "Team stage"}</p>
            <strong>{labels[route.slot] ?? route.slot.slice(5).replaceAll("_", " ")}</strong></div>
          <label className={styles.field}>Provider
            <select value={route.provider} onChange={(event) => chooseProvider(route, event.target.value as ModelProvider)}>
              <option value="openai">OpenAI</option><option value="deepseek">DeepSeek</option>
            </select>
          </label>
          <label className={styles.field}>Billing source
            <select value={route.connectionId ?? "platform"} onChange={(event) => chooseCredential(route, event.target.value)}>
              <option value="platform">Moeazi platform key</option>
              {connections.filter((item) => item.provider === route.provider && item.status === "verified").map((item) =>
                <option key={item._id} value={item._id}>{item.label} · •••• {item.keyLast4}</option>)}
            </select>
          </label>
          <label className={styles.field}>Model
            <input list={`models-${route.slot}`} value={route.model} onChange={(event) => chooseModel(route, event.target.value)} />
            <datalist id={`models-${route.slot}`}>{options.map((model) => <option value={model.id} key={model.id} />)}</datalist>
            <small>{compatible ? "Typed-output compatible" : "Run the compatibility probe before activation"}</small>
          </label>
          <label className={styles.field}>Output cap
            <input type="number" min={128} max={8192} value={route.maxOutputTokens}
              onChange={(event) => replaceRoute(route.slot, { maxOutputTokens: Number(event.target.value) })} />
          </label>
          {route.provider === "openai" ? <label className={styles.field}>Reasoning effort
            <select value={route.reasoningEffort ?? "none"} onChange={(event) => replaceRoute(route.slot, {
              reasoningEffort: event.target.value as ModelRoute["reasoningEffort"],
            })}>
              <option value="none">None</option><option value="low">Low</option>
              <option value="medium">Medium</option><option value="high">High</option>
            </select>
          </label> : null}
          {route.credentialSource === "byok" ? <details className={styles.rateFields}><summary>Confirmed provider rates</summary>
            {(["inputPriceMicrousdPerMillion", "cachedInputPriceMicrousdPerMillion", "outputPriceMicrousdPerMillion"] as const).map((field) =>
              <label key={field}>{field.replace("PriceMicrousdPerMillion", " $/M")}
                <input type="number" min={0} step={0.001} value={route[field] / 1_000_000}
                  onChange={(event) => replaceRoute(route.slot, { [field]: Math.round(Number(event.target.value) * 1_000_000) })} />
              </label>)}
          </details> : null}
        </article>;
      })}
    </div>
    <div className={styles.costPreview} aria-live="polite">
      <div><span>Maximum calls/run</span><strong>{estimate.calls}</strong></div>
      <div><span>Moeazi credits/run</span><strong>{estimate.credits}</strong></div>
      <div><span>Estimated provider spend/run</span><strong>${(estimate.estimatedProviderCostMicrousd / 1_000_000).toFixed(4)}</strong></div>
      <div><span>Configured daily ceiling</span><strong>${dailyUsd.toFixed(2)}</strong></div>
    </div>
    {usesByok && estimate.maximumProviderCostMicrousd > dailyUsd * 1_000_000
      ? <p className={styles.error}>This route’s maximum estimate exceeds the daily provider ceiling, so scheduled runs will stop before dispatch.</p>
      : null}
    <div className={styles.actions}><button type="button" onClick={() => setAdvanced((value) => !value)}>
      {advanced ? "Hide role overrides" : `Show ${specialistRoles.length} role overrides`}</button></div>
    <div className={styles.formGrid}>
      <label className={styles.field}>BYOK daily provider ceiling
        <input type="number" min={0} step={0.01} value={dailyUsd} onChange={(event) => setDailyUsd(Number(event.target.value))} />
        <small>Required for scheduled BYOK calls. This is provider spend, separate from Moeazi credits.</small>
      </label>
      <label className={styles.field}>Provider retries
        <select value={retries} onChange={(event) => setRetries(Number(event.target.value))}>
          <option value={0}>0 · safest default</option><option value={1}>1 retry</option><option value={2}>2 retries</option>
        </select>
      </label>
    </div>
    <label className={styles.checkRow}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} />
      I reviewed every model, credential source, provider rate, output cap, and daily ceiling.</label>
    <div className={styles.actions}><button className={styles.primary} type="button" disabled={!confirmed || busy || (usesByok && dailyUsd <= 0)}
      onClick={() => void saveAndActivate()}>{busy ? "Activating…" : "Save and activate route"}</button></div>
    {message ? <p className={message.includes("activated") ? styles.notice : styles.error}>{message}</p> : null}
  </Panel>;
}
