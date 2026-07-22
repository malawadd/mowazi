"use client";

import { useMemo, useState } from "react";
import {
  Background, Controls, Handle, MiniMap, Position, ReactFlow,
  type Edge, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import styles from "@/components/agents/agent-portal.module.css";
import type { TraceGraphContract, TraceNodeData } from "@/lib/agentMonitoring";

type TraceNode = Node<TraceNodeData>;

function level(node: { type: string; data: TraceNodeData }) {
  if (node.type === "evidence") return 0;
  if (node.type === "model_call") return 1;
  if (node.type === "synthesis") {
    if (node.data.role === "arbiter" || node.data.role === "synthesis") return 3;
    return 2;
  }
  if (node.type === "analysis") return 4;
  if (node.type === "proposal") return 5;
  if (node.type === "policy_check") return 6;
  if (node.type === "quote") return 7;
  return 8;
}

function layout(contract: TraceGraphContract): TraceNode[] {
  const counts = new Map<number, number>();
  return contract.nodes.map((node) => {
    const column = level(node);
    const row = counts.get(column) ?? 0;
    counts.set(column, row + 1);
    return {
      id: node.id, type: "trace", data: node.data,
      position: { x: column * 310, y: row * 155 },
    };
  });
}

function TraceNodeCard({ data }: { data: TraceNodeData }) {
  const calls = data.tokens.input + data.tokens.output;
  return <article className={styles.traceNode} data-status={data.status} data-source={data.credentialSource ?? "system"}>
    <Handle type="target" position={Position.Left} />
    <p>{data.role?.replaceAll("_", " ") ?? "Decision trace"}</p>
    <h3>{data.label}</h3>
    {data.provider ? <span>{data.provider} · {data.model}</span> : null}
    <small>{data.status.replaceAll("_", " ")}{calls ? ` · ${calls.toLocaleString()} tokens` : ""}</small>
    <Handle type="source" position={Position.Right} />
  </article>;
}

const nodeTypes = { trace: TraceNodeCard };

export default function TraceGraph({ contract }: { contract: TraceGraphContract }) {
  const nodes = useMemo(() => layout(contract), [contract]);
  const edges = useMemo<Edge[]>(() => contract.edges.map((edge) => ({
    ...edge, animated: true, style: { stroke: "#171717", strokeWidth: 3 },
  })), [contract]);
  const [selected, setSelected] = useState<TraceNodeData | null>(nodes.find((node) => node.data.role === "synthesis")?.data ?? nodes[0]?.data ?? null);

  return <div className={styles.traceWorkspace}>
    <div className={styles.traceCanvas} aria-label="Agent decision graph">
      <ReactFlow nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.25} maxZoom={1.5}
        nodesDraggable={false} nodesConnectable={false} onNodeClick={(_, node) => setSelected(node.data)}>
        <Background gap={22} size={2} color="#c8bea8" />
        <MiniMap pannable zoomable nodeColor={(node) => node.data.status === "failed" ? "#f15b5d" : node.data.credentialSource === "byok" ? "#b9e6cf" : "#cde6f7"} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
    <aside className={styles.traceDrawer} aria-live="polite">
      {selected ? <>
        <p className={styles.eyebrow}>Selected node</p><h3>{selected.label}</h3>
        <p className={styles.traceSummary}>{selected.decisionSummary || "No separate rationale summary was returned."}</p>
        <dl className={styles.traceMetrics}>
          <div><dt>Status</dt><dd>{selected.status.replaceAll("_", " ")}</dd></div>
          <div><dt>Provider</dt><dd>{selected.provider ?? "Deterministic"}</dd></div>
          <div><dt>Model</dt><dd>{selected.model ?? "—"}</dd></div>
          <div><dt>Key source</dt><dd>{selected.credentialSource ?? "System"}</dd></div>
          <div><dt>Latency</dt><dd>{selected.latencyMs.toLocaleString()} ms</dd></div>
          <div><dt>Tokens</dt><dd>{selected.tokens.input} in · {selected.tokens.cached} cached · {selected.tokens.output} out</dd></div>
          <div><dt>Provider usage</dt><dd>${(selected.providerCostMicrousd / 1_000_000).toFixed(4)}</dd></div>
          <div><dt>Moeazi credits</dt><dd>{selected.platformCredits}</dd></div>
        </dl>
        {selected.error ? <p className={styles.error}>{selected.error}</p> : null}
        <details className={styles.tracePayload}><summary>Sanitized input</summary><pre>{JSON.stringify(selected.input, null, 2)}</pre></details>
        <details className={styles.tracePayload}><summary>Validated output</summary><pre>{JSON.stringify(selected.output, null, 2)}</pre></details>
        <p className={styles.traceBoundary}>This view contains evidence, structured outputs, and concise rationale summaries—not hidden chain-of-thought.</p>
      </> : <p>Select a node to inspect it.</p>}
    </aside>
    <div className={styles.traceMobileList}>
      {nodes.map((node) => <button type="button" key={node.id} onClick={() => setSelected(node.data)}>
        <strong>{node.data.label}</strong><span>{node.data.status} · {node.data.decisionSummary}</span>
      </button>)}
    </div>
  </div>;
}
