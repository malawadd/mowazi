import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type LayoutLink = {
  source: string;
  target: string;
  value: number;
};

type SimNode = SimulationNodeDatum & {
  id: string;
  radius?: number;
  targetX?: number;
  targetY?: number;
};

export function runLayout<T extends { id: string; radius?: number; targetX?: number; targetY?: number }>(
  nodes: T[],
  links: LayoutLink[],
  width: number,
  height: number,
  charge: number,
): Array<T & { x: number; y: number }> {
  const simNodes = nodes.map((node, index) => ({
    ...node,
    x: node.targetX ?? 50 + Math.cos(index) * 18,
    y: node.targetY ?? 50 + Math.sin(index) * 18,
  })) as Array<T & SimNode>;
  const simLinks = links.map((link) => ({ ...link }) as SimulationLinkDatum<T & SimNode>);
  const simulation = forceSimulation<T & SimNode>(simNodes)
    .force("center", forceCenter(width / 2, height / 2))
    .force("charge", forceManyBody<T & SimNode>().strength(-charge))
    .force("collide", forceCollide<T & SimNode>().radius((node) => (node.radius ?? 10) * 0.75))
    .force("x", forceX<T & SimNode>((node) => node.targetX ?? width / 2).strength(0.12))
    .force("y", forceY<T & SimNode>((node) => node.targetY ?? height / 2).strength(0.12));

  if (simLinks.length > 0) {
    simulation.force(
      "link",
      forceLink<T & SimNode, SimulationLinkDatum<T & SimNode>>(simLinks)
        .id((node) => node.id)
        .distance(34),
    );
  }

  for (let i = 0; i < 90; i += 1) simulation.tick();
  simulation.stop();
  return simNodes.map((node) => ({
    ...node,
    x: clamp(finite(node.x), 5, width - 5),
    y: clamp(finite(node.y), 5, height - 5),
  }));
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, finite(value)));
}

function finite(value: number | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
