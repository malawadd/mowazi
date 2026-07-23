"use client";

import { useState } from "react";
import { Panel, StatusBadge } from "@/components/strategy-ui";
import styles from "@/components/agents/agent-portal.module.css";
import {
  providerLabel, providerRequest, type AccessibleModel,
  type ModelProvider, type ProviderConnection,
} from "@/lib/modelProviders";

type Props = { connections: ProviderConnection[] };

export default function ProviderConnectionPanel({ connections }: Props) {
  const [provider, setProvider] = useState<ModelProvider>("deepseek");
  const [label, setLabel] = useState("My DeepSeek project");
  const [apiKey, setApiKey] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [probeModels, setProbeModels] = useState<Record<string, string>>({});
  const [rotationKeys, setRotationKeys] = useState<Record<string, string>>({});
  const [searches, setSearches] = useState<Record<string, string>>({});
  const [catalogs, setCatalogs] = useState<Record<string, AccessibleModel[]>>({});
  const [catalogTotals, setCatalogTotals] = useState<Record<string, number>>({});

  const run = async (key: string, action: () => Promise<unknown>, success: string) => {
    setBusy(key); setMessage(null);
    try { await action(); setMessage(success); }
    catch (error) { setMessage(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(null); }
  };

  const connect = () => run("create", async () => {
    await providerRequest("connections", {
      method: "POST", body: JSON.stringify({ provider, label, api_key: apiKey }),
    });
    setApiKey("");
  }, "Provider key stored and checked. It cannot be shown again.");

  const searchCatalog = async (connection: ProviderConnection) => {
    const search = searches[connection._id]?.trim() ?? "";
    if (!search) {
      setMessage("Enter a model company, name, or exact OpenRouter model ID.");
      return;
    }
    setBusy(`catalog:${connection._id}`); setMessage(null);
    try {
      const result = await providerRequest<{ models: AccessibleModel[]; total: number }>(
        `connections/${connection._id}/models?q=${encodeURIComponent(search)}&limit=50`,
      );
      setCatalogs((value) => ({ ...value, [connection._id]: result.models }));
      setCatalogTotals((value) => ({ ...value, [connection._id]: result.total }));
      setProbeModels((value) => ({
        ...value, [connection._id]: result.models[0]?.id ?? "",
      }));
      setMessage(result.total
        ? `${result.total} matching model${result.total === 1 ? "" : "s"} found.`
        : `No accessible OpenRouter model matches “${search}”.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(null);
    }
  };

  return <Panel title="Provider keys" description="Encrypted credentials for private agent calls only" tone="sky">
    <div className={styles.securityNotice}>
      <strong>Your provider bills model tokens directly.</strong>
      <span>Moeazi stores only a KMS-encrypted secret and charges the smaller infrastructure rate. Keys never reach agents, Convex, traces, or exports.</span>
    </div>
    <div className={styles.formGrid}>
      <label className={styles.field}>Provider
        <select value={provider} onChange={(event) => {
          const value = event.target.value as ModelProvider;
          setProvider(value); setLabel(`My ${providerLabel(value)} project`);
        }}>
          <option value="deepseek">DeepSeek</option><option value="openai">OpenAI</option>
          <option value="openrouter">OpenRouter</option>
        </select>
      </label>
      <label className={styles.field}>Connection label
        <input value={label} maxLength={60} onChange={(event) => setLabel(event.target.value)} />
      </label>
      <label className={`${styles.field} ${styles.full}`}>API key
        <input type="password" autoComplete="new-password" value={apiKey}
          onChange={(event) => setApiKey(event.target.value)} placeholder="Paste once; it will not be returned" />
        <small>Connection verification lists models. A separate compatibility probe may create a tiny provider charge.</small>
      </label>
    </div>
    <div className={styles.actions}>
      <button className={styles.primary} type="button" disabled={busy !== null || apiKey.length < 12 || label.trim().length < 2}
        onClick={() => void connect()}>{busy === "create" ? "Encrypting…" : "Connect provider"}</button>
    </div>
    {message ? <p className={styles.notice}>{message}</p> : null}

    <div className={styles.connectionGrid}>
      {connections.map((connection) => {
        const catalog = catalogs[connection._id] ?? connection.models;
        const selected = probeModels[connection._id] ?? catalog[0]?.id ?? "";
        return <article className={styles.connectionCard} key={connection._id}>
          <header><div><p className={styles.eyebrow}>{providerLabel(connection.provider)}</p><h3>{connection.label}</h3></div>
            <StatusBadge tone={connection.status === "verified" ? "positive" : connection.status === "revoked" ? "danger" : "warning"}>{connection.status}</StatusBadge></header>
          <div className={styles.dataList}>
            <div><span>Secret</span><strong>•••• {connection.keyLast4}</strong></div>
            <div><span>Accessible models</span><strong>{connection.capabilities.catalogCount ?? connection.models.length}</strong></div>
            <div><span>Validated models</span><strong>{connection.capabilities.compatibleModels?.length ?? 0}</strong></div>
          </div>
          {connection.failureReason ? <p className={styles.error}>{connection.failureReason}</p> : null}
          {connection.status !== "revoked" ? <>
            {connection.provider === "openrouter" ? <div className={styles.actions}>
              <label className={styles.field}>Search OpenRouter models
                <input value={searches[connection._id] ?? ""}
                  onChange={(event) => setSearches((value) => ({ ...value, [connection._id]: event.target.value }))}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault(); void searchCatalog(connection);
                    }
                  }}
                  placeholder="Company, name, or exact ID…" />
                <small>Paste IDs directly, for example poolside/laguna-s-2.1:free.</small>
              </label>
              <button type="button" disabled={busy !== null || !(searches[connection._id]?.trim())}
                onClick={() => void searchCatalog(connection)}>
                {busy === `catalog:${connection._id}` ? "Searching…" : "Search catalog"}
              </button>
            </div> : null}
            <label className={styles.field}>Compatibility probe
              <select value={selected} onChange={(event) => setProbeModels((value) => ({ ...value, [connection._id]: event.target.value }))}>
                {!catalog.length ? <option value="">Search the catalog first</option> : null}
                {catalog.map((model) => <option value={model.id} key={model.id}>
                  {model.name ?? model.id} · {model.id}
                  {model.supportedParameters?.includes("structured_outputs") ? " · strict JSON" : " · probe required"}
                </option>)}
              </select>
              {connection.provider === "openrouter" && catalogs[connection._id] ? <small>
                {catalogTotals[connection._id] ?? 0} exact catalog matches. Models without advertised strict JSON
                remain searchable, but must pass Moeazi’s compatibility probe before activation.
              </small> : null}
            </label>
            <label className={styles.field}>Rotate key
              <input type="password" autoComplete="new-password" value={rotationKeys[connection._id] ?? ""}
                onChange={(event) => setRotationKeys((value) => ({ ...value, [connection._id]: event.target.value }))}
                placeholder="Replacement key" />
            </label>
            <div className={styles.actions}>
              <button type="button" disabled={!selected || busy !== null} onClick={() => void run(`probe:${connection._id}`, () =>
                providerRequest(`connections/${connection._id}/probe`, { method: "POST", body: JSON.stringify({ model: selected }) }),
              `${selected} passed typed-output validation.`)}>{busy === `probe:${connection._id}` ? "Testing…" : "Test model"}</button>
              <button type="button" disabled={(rotationKeys[connection._id]?.length ?? 0) < 12 || busy !== null} onClick={() => void run(`rotate:${connection._id}`, async () => {
                await providerRequest(`connections/${connection._id}`, { method: "PATCH", body: JSON.stringify({ api_key: rotationKeys[connection._id] }) });
                setRotationKeys((value) => ({ ...value, [connection._id]: "" }));
              }, "Replacement key verified and activated.")}>Rotate</button>
              <button className={styles.danger} type="button" disabled={busy !== null} onClick={() => {
                if (window.confirm("Revoke this key and pause dependent automatic agents?")) void run(`revoke:${connection._id}`, () =>
                  providerRequest(`connections/${connection._id}`, { method: "DELETE" }), "Key revoked and dependent schedules paused.");
              }}>Revoke</button>
            </div>
          </> : null}
        </article>;
      })}
    </div>
  </Panel>;
}
