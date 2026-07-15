"use client";

import { memo, useMemo } from "react";
import {
  Background,
  BaseEdge,
  Handle,
  Position,
  ReactFlow,
  getBezierPath,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import { motion } from "motion/react";
import VizGlyph from "./VizGlyphs";
import type { PaperAgent, PaperVizModel } from "./vizPaperModel";
import styles from "./viz-ui.module.css";

type AgentNodeData = { agent: PaperAgent };
type SynthesisNodeData = { paper: PaperVizModel };
type FlowNode = Node<AgentNodeData | SynthesisNodeData>;

const nodeTypes = {
  agent: memo(AgentFlowNode),
  synthesis: memo(SynthesisFlowNode),
};

const edgeTypes = {
  signal: SignalEdge,
};

export default function AgentConductor({ paper }: { paper: PaperVizModel }) {
  const { nodes, edges } = useMemo(() => buildFlow(paper), [paper]);
  return (
    <article className={styles.paperPanel}>
      <div className={styles.panelTitle}>
        <div>
          <h2>AGENT CONDUCTOR</h2>
          <p>Specialist agents analyze public-market dimensions and synthesize a directional view.</p>
        </div>
      </div>
      <div className={styles.agentFlow}>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          panOnScroll={false}
          zoomOnScroll={false}
          zoomOnPinch={false}
          nodesDraggable
          nodesConnectable={false}
          elementsSelectable
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={28} color="rgba(17,17,17,0.14)" />
        </ReactFlow>
      </div>
      <div className={styles.disagreementStrip}>
        <div>
          <span>Main Disagreement</span>
          <strong>{paper.synthesis.conflictDrivers[0]}</strong>
          <p>Conflict score stays uncertainty-aware, not predictive.</p>
        </div>
        <div>
          <span>Conflict Drivers</span>
          <ul>{paper.synthesis.conflictDrivers.map((driver) => <li key={driver}>{driver}</li>)}</ul>
        </div>
        <div>
          <span>Disagreement Score</span>
          <strong>{paper.synthesis.disagreement} / 100</strong>
          <BarStack value={paper.synthesis.disagreement} />
        </div>
      </div>
    </article>
  );
}

function AgentFlowNode({ data }: NodeProps<Node<AgentNodeData>>) {
  const agent = data.agent;
  return (
    <article className={`${styles.agentCard} ${styles[`tone${capitalize(agent.tone)}`]}`}>
      <Handle id="right" type="source" position={Position.Right} className={styles.flowHandle} />
      <Handle id="left" type="source" position={Position.Left} className={styles.flowHandle} />
      <Handle id="leftTarget" type="target" position={Position.Left} className={styles.flowHandle} />
      <Handle id="rightTarget" type="target" position={Position.Right} className={styles.flowHandle} />
      <div className={styles.glyphBox}><VizGlyph name={agent.glyph} className={styles.glyph} /></div>
      <div>
        <h3>{agent.title}</h3>
        <span className={`${styles.stanceBadge} ${styles[agent.stance]}`}>{agent.stance}</span>
        <p>{agent.evidence}</p>
        <small>Confidence <b>{agent.confidence}%</b></small>
      </div>
    </article>
  );
}

function SynthesisFlowNode({ data }: NodeProps<Node<SynthesisNodeData>>) {
  const paper = data.paper;
  return (
    <div className={styles.synthesisCard}>
      <Handle id="left" type="target" position={Position.Left} className={styles.flowHandle} />
      <Handle id="right" type="target" position={Position.Right} className={styles.flowHandle} />
      <span>SYNTHESIS</span>
      <strong>{paper.synthesis.label.toUpperCase()}</strong>
      <small>Direction <b className={styles[paper.synthesis.stance]}>{paper.synthesis.stance}</b></small>
      <div className={styles.synthesisStats}>
        <div><span>Confidence</span><b>{paper.synthesis.confidence}%</b></div>
        <div><span>Reversal Risk</span><b>{paper.synthesis.reversalRisk}%</b></div>
      </div>
      <p>Net view is live-derived; uncertainty remains explicit.</p>
    </div>
  );
}

function SignalEdge(props: EdgeProps) {
  const [edgePath] = getBezierPath(props);
  return (
    <>
      <BaseEdge path={edgePath} markerEnd={props.markerEnd} className={styles.signalEdge} />
      <motion.circle r="4" className={styles.signalDot}>
        <animateMotion dur="2.2s" repeatCount="indefinite" path={edgePath} />
      </motion.circle>
    </>
  );
}

function buildFlow(paper: PaperVizModel): { nodes: FlowNode[]; edges: Edge[] } {
  const left = paper.agents.slice(0, 3);
  const right = paper.agents.slice(3);
  const nodes: FlowNode[] = [
    ...left.map((agent, index) => ({ id: agent.id, type: "agent", position: { x: 0, y: index * 150 }, data: { agent } })),
    { id: "synthesis", type: "synthesis", position: { x: 420, y: 108 }, data: { paper } },
    ...right.map((agent, index) => ({ id: agent.id, type: "agent", position: { x: 790, y: 38 + index * 180 }, data: { agent } })),
  ];
  return {
    nodes,
    edges: paper.agents.map((agent) => {
      const onLeft = left.some((item) => item.id === agent.id);
      return {
        id: `${agent.id}-synthesis`,
        source: agent.id,
        sourceHandle: onLeft ? "right" : "left",
        target: "synthesis",
        targetHandle: onLeft ? "left" : "right",
        type: "signal",
        animated: true,
      };
    }),
  };
}

function BarStack({ value }: { value: number }) {
  const filled = Math.round(value / 12.5);
  return <div className={styles.barStack}>{Array.from({ length: 8 }, (_, index) => <i key={index} data-on={index < filled} />)}</div>;
}

function capitalize(value: string) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}
