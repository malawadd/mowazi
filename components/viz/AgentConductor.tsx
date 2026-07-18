"use client";

import { memo, useEffect, useMemo, useState } from "react";
import { applyNodeChanges, BaseEdge, Handle, Position, ReactFlow, getBezierPath, type Edge, type EdgeProps, type Node, type NodeChange, type NodeProps, type OnNodeDrag } from "@xyflow/react";
import { motion, useReducedMotion } from "motion/react";
import VizGlyph from "./VizGlyphs";
import { PanelTitle, StanceBadge, toneClass } from "./VizPrimitives";
import type { PaperAgent, PaperVizModel, VizStance } from "./vizPaperModel";
import common from "./viz-ui.module.css";
import styles from "./agents.module.css";

type AgentNodeData = { kind: "agent"; agent: PaperAgent } | { kind: "synthesis"; paper: PaperVizModel };
type FlowNode = Node<AgentNodeData>;
type SignalData = { stance: VizStance };

const nodeTypes = { agent: memo(AgentFlowNode), synthesis: memo(SynthesisFlowNode) };
const edgeTypes = { signal: SignalEdge };

export default function AgentConductor({ paper }: { paper: PaperVizModel }) {
  const graph = useMemo(() => buildFlow(paper), [paper]);
  const [nodes, setNodes] = useState(graph.nodes);
  useEffect(() => setNodes(graph.nodes), [graph.nodes]);
  const onNodesChange = (changes: NodeChange<FlowNode>[]) => setNodes((current) => applyNodeChanges(changes, current));
  const onNodeDragStop: OnNodeDrag<FlowNode> = (_event, dragged) => {
    if (!nodes.some((node) => node.id !== dragged.id && overlap(node, dragged))) return;
    const original = graph.nodes.find((node) => node.id === dragged.id);
    if (original) setNodes((current) => current.map((node) => node.id === dragged.id ? { ...node, position: original.position } : node));
  };
  return (
    <article className={common.paperPanel}>
      <PanelTitle eyebrow="Market analysis" title="WHAT THE SIGNALS SAY" description="Six independent market lenses are combined into one readable view, with uncertainty and disagreements kept visible." />
      <div className={styles.desktopFlow}>
        <ReactFlow nodes={nodes} edges={graph.edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes} onNodesChange={onNodesChange} onNodeDragStop={onNodeDragStop} fitView fitViewOptions={{ padding: .1, minZoom: .72, maxZoom: 1 }} minZoom={.72} maxZoom={1.05} nodeExtent={[[-20, -20], [1190, 510]]} translateExtent={[[-70, -70], [1240, 570]]} panOnScroll={false} panOnDrag={false} zoomOnScroll={false} zoomOnPinch={false} nodesDraggable nodesConnectable={false} elementsSelectable proOptions={{ hideAttribution: true }} />
      </div>
      <MobileConductor paper={paper} />
      <Disagreement paper={paper} />
    </article>
  );
}

function AgentFlowNode({ data }: NodeProps<FlowNode>) {
  if (data.kind !== "agent") return null;
  return <AgentCard agent={data.agent} handles />;
}

function AgentCard({ agent, handles = false }: { agent: PaperAgent; handles?: boolean }) {
  return (
    <article className={`${styles.agentCard} ${toneClass(agent.tone)}`}>
      {handles ? <><Handle id="right" type="source" position={Position.Right} className={styles.flowHandle} /><Handle id="left" type="source" position={Position.Left} className={styles.flowHandle} /></> : null}
      <div className={styles.glyphBox}><VizGlyph name={agent.glyph} className={styles.glyph} /></div>
      <div className={styles.agentCopy}><h3>{agent.title}</h3><StanceBadge stance={agent.stance} /><p>{agent.evidence}</p><small>Confidence <b>{agent.confidence}%</b></small></div>
    </article>
  );
}

function SynthesisFlowNode({ data }: NodeProps<FlowNode>) {
  if (data.kind !== "synthesis") return null;
  return <Synthesis paper={data.paper} handles />;
}

function Synthesis({ paper, handles = false }: { paper: PaperVizModel; handles?: boolean }) {
  return (
    <article className={styles.synthesisCard}>
      {handles ? <><Handle id="left" type="target" position={Position.Left} className={styles.flowHandle} /><Handle id="right" type="target" position={Position.Right} className={styles.flowHandle} /></> : null}
      <span>Overall view</span><strong>{paper.synthesis.label}</strong><small>Market lean <b className={common[paper.synthesis.stance]}>{paper.synthesis.stance}</b></small>
      <div className={styles.synthesisStats}><div><span>Confidence</span><b>{paper.synthesis.confidence}%</b></div><div><span>Reversal risk</span><b>{paper.synthesis.reversalRisk}%</b></div></div>
      <p>A concise reading of the latest manually requested analysis.</p>
    </article>
  );
}

function SignalEdge(props: EdgeProps<Edge<SignalData>>) {
  const reduceMotion = useReducedMotion();
  const [path] = getBezierPath(props);
  const stance = props.data?.stance ?? "neutral";
  return <><BaseEdge path={path} className={`${styles.signalEdge} ${styles[stance]}`} /><motion.circle r="4" className={`${styles.signalDot} ${styles[stance]}`}><animateMotion dur={reduceMotion ? "0s" : "2.4s"} repeatCount={reduceMotion ? "0" : "indefinite"} path={path} /></motion.circle></>;
}

function MobileConductor({ paper }: { paper: PaperVizModel }) {
  return <div className={styles.mobileFlow}>{paper.agents.slice(0, 3).map((agent) => <div key={agent.id} className={`${styles.mobileSignal} ${styles[agent.stance]}`}><AgentCard agent={agent} /></div>)}<Synthesis paper={paper} />{paper.agents.slice(3).map((agent) => <div key={agent.id} className={`${styles.mobileSignal} ${styles[agent.stance]}`}><AgentCard agent={agent} /></div>)}</div>;
}

function Disagreement({ paper }: { paper: PaperVizModel }) {
  return <div className={styles.disagreement}><div><span>What does not agree</span><strong>{paper.synthesis.conflictDrivers[0]}</strong><p>A disagreement is a reason for caution, not a prediction.</p></div><div><span>Why the view is mixed</span><ul>{paper.synthesis.conflictDrivers.map((driver) => <li key={driver}>{driver}</li>)}</ul></div><div><span>Signal disagreement</span><strong>{paper.synthesis.disagreement} / 100</strong><div className={styles.barStack}>{Array.from({ length: 8 }, (_, index) => <i key={index} data-on={index < Math.round(paper.synthesis.disagreement / 12.5)} />)}</div></div></div>;
}

function buildFlow(paper: PaperVizModel): { nodes: FlowNode[]; edges: Edge<SignalData>[] } {
  const left = paper.agents.slice(0, 3); const right = paper.agents.slice(3);
  const nodes: FlowNode[] = [...left.map((agent, index) => ({ id: agent.id, type: "agent", position: { x: 0, y: index * 154 }, data: { kind: "agent" as const, agent } })), { id: "synthesis", type: "synthesis", position: { x: 425, y: 104 }, data: { kind: "synthesis" as const, paper } }, ...right.map((agent, index) => ({ id: agent.id, type: "agent", position: { x: 820, y: 52 + index * 205 }, data: { kind: "agent" as const, agent } }))];
  const edges = paper.agents.map((agent) => { const onLeft = left.some((item) => item.id === agent.id); return { id: `${agent.id}-synthesis`, source: agent.id, sourceHandle: onLeft ? "right" : "left", target: "synthesis", targetHandle: onLeft ? "left" : "right", type: "signal", data: { stance: agent.stance } }; });
  return { nodes, edges };
}

function overlap(a: FlowNode, b: FlowNode) { const aSize = a.type === "synthesis" ? { w: 340, h: 270 } : { w: 340, h: 138 }; const bSize = b.type === "synthesis" ? { w: 340, h: 270 } : { w: 340, h: 138 }; return a.position.x < b.position.x + bSize.w + 12 && a.position.x + aSize.w + 12 > b.position.x && a.position.y < b.position.y + bSize.h + 12 && a.position.y + aSize.h + 12 > b.position.y; }
