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

export type LayoutLink = { source: string; target: string; value: number };

type SimNode = SimulationNodeDatum & {
  id: string;
  radius?: number;
  targetX?: number;
  targetY?: number;
  fixed?: boolean;
};

export type ForceSlot = { x: number; y: number; width: number; height: number };
export type ForceOffset = { x: number; y: number };
export type LayoutRect = { x: number; y: number; width: number; height: number };

export function runLayout<T extends { id: string; radius?: number; targetX?: number; targetY?: number }>(
  nodes: T[],
  links: LayoutLink[],
  width: number,
  height: number,
  charge: number,
): Array<T & { x: number; y: number }> {
  const simNodes = nodes.map((node, index) => ({
    ...node,
    x: node.targetX ?? width / 2 + Math.cos(index) * 18,
    y: node.targetY ?? height / 2 + Math.sin(index) * 18,
  })) as Array<T & SimNode>;
  const simLinks = links.map((link) => ({ ...link }) as SimulationLinkDatum<T & SimNode>);
  const simulation = forceSimulation<T & SimNode>(simNodes)
    .force("center", forceCenter(width / 2, height / 2))
    .force("charge", forceManyBody<T & SimNode>().strength(-charge))
    .force("collide", forceCollide<T & SimNode>().radius((node) => (node.radius ?? 10) + 2))
    .force("x", forceX<T & SimNode>((node) => node.targetX ?? width / 2).strength(0.18))
    .force("y", forceY<T & SimNode>((node) => node.targetY ?? height / 2).strength(0.18));

  if (simLinks.length > 0) {
    simulation.force(
      "link",
      forceLink<T & SimNode, SimulationLinkDatum<T & SimNode>>(simLinks)
        .id((node) => node.id)
        .distance(34),
    );
  }

  for (let index = 0; index < 110; index += 1) simulation.tick();
  simulation.stop();
  return simNodes.map((node) => ({ ...node, x: clamp(node.x, 5, width - 5), y: clamp(node.y, 5, height - 5) }));
}

export function runOrbitalLayout<T extends { id: string; radius: number; targetX: number; targetY: number; fixed?: boolean }>(
  nodes: T[],
  width: number,
  height: number,
): Array<T & { x: number; y: number }> {
  const simNodes = nodes.map((node) => ({
    ...node,
    x: node.targetX,
    y: node.targetY,
    fx: node.fixed ? node.targetX : undefined,
    fy: node.fixed ? node.targetY : undefined,
  })) as Array<T & SimNode>;
  const simulation = forceSimulation<T & SimNode>(simNodes)
    .alphaDecay(0.055)
    .velocityDecay(0.48)
    .force("charge", forceManyBody<T & SimNode>().strength(-10))
    .force("collide", forceCollide<T & SimNode>().radius((node) => (node.radius ?? 18) + 9).iterations(3))
    .force("x", forceX<T & SimNode>((node) => node.targetX ?? width / 2).strength(0.34))
    .force("y", forceY<T & SimNode>((node) => node.targetY ?? height / 2).strength(0.34));

  for (let index = 0; index < 180; index += 1) simulation.tick();
  simulation.stop();
  const bounded = simNodes.map((node) => ({
    ...node,
    x: clamp(node.x, (node.radius ?? 18) + 14, width - (node.radius ?? 18) - 14),
    y: clamp(node.y, (node.radius ?? 18) + 14, height - (node.radius ?? 18) - 14),
  }));
  return resolveCircleCollisions(bounded, width, height);
}

export function settleForceOffset(
  id: string,
  proposed: ForceOffset,
  slots: Record<string, ForceSlot>,
  offsets: Record<string, ForceOffset>,
  bounds: { width: number; height: number },
): ForceOffset {
  const slot = slots[id];
  if (!slot) return { x: 0, y: 0 };
  let next = clampOffset(proposed, slot, bounds);
  for (let pass = 0; pass < 10; pass += 1) {
    const current = rect(slot, next);
    const hit = Object.entries(slots).find(([otherId, other]) => {
      if (otherId === id) return false;
      return overlaps(current, rect(other, offsets[otherId] ?? { x: 0, y: 0 }), 12);
    });
    if (!hit) break;
    const otherRect = rect(hit[1], offsets[hit[0]] ?? { x: 0, y: 0 });
    const moveDown = current.y + current.height / 2 >= otherRect.y + otherRect.height / 2;
    next = clampOffset(
      { ...next, y: moveDown ? otherRect.y + otherRect.height + 12 - slot.y : otherRect.y - slot.height - 12 - slot.y },
      slot,
      bounds,
    );
  }
  return next;
}

export function buildConnectorPath(card: LayoutRect, core: LayoutRect, score: number, boardWidth: number) {
  const cardCenter = rectCenter(card);
  const coreCenter = rectCenter(core);
  if (boardWidth < 900) {
    const above = cardCenter.y < coreCenter.y;
    const railX = above ? boardWidth - 15 : 15;
    const cardAnchor = { x: above ? card.x + card.width : card.x, y: cardCenter.y };
    const coreAnchor = { x: above ? core.x + core.width : core.x, y: coreCenter.y };
    const from = score < -0.08 ? coreAnchor : cardAnchor;
    const to = score < -0.08 ? cardAnchor : coreAnchor;
    return { path: `M${from.x} ${from.y} H${railX} V${to.y} H${to.x}`, badge: { x: railX, y: cardCenter.y } };
  }
  let from = rectAnchor(card, coreCenter);
  let to = rectAnchor(core, cardCenter);
  if (score < -0.08) [from, to] = [to, from];
  const horizontal = Math.abs(to.x - from.x) > Math.abs(to.y - from.y);
  const path = horizontal
    ? `M${from.x} ${from.y} C${(from.x + to.x) / 2} ${from.y} ${(from.x + to.x) / 2} ${to.y} ${to.x} ${to.y}`
    : `M${from.x} ${from.y} C${from.x} ${(from.y + to.y) / 2} ${to.x} ${(from.y + to.y) / 2} ${to.x} ${to.y}`;
  return { path, badge: { x: from.x + (to.x - from.x) * .28, y: from.y + (to.y - from.y) * .28 } };
}

function rect(slot: ForceSlot, offset: ForceOffset) {
  return { x: slot.x + offset.x, y: slot.y + offset.y, width: slot.width, height: slot.height };
}

function overlaps(a: ForceSlot, b: ForceSlot, gap: number) {
  return a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
}

function rectAnchor(rectangle: LayoutRect, target: { x: number; y: number }) {
  const center = rectCenter(rectangle);
  const dx = target.x - center.x;
  const dy = target.y - center.y;
  return Math.abs(dx) > Math.abs(dy)
    ? { x: center.x + Math.sign(dx) * rectangle.width / 2, y: center.y }
    : { x: center.x, y: center.y + Math.sign(dy) * rectangle.height / 2 };
}

function rectCenter(rectangle: LayoutRect) {
  return { x: rectangle.x + rectangle.width / 2, y: rectangle.y + rectangle.height / 2 };
}

function clampOffset(offset: ForceOffset, slot: ForceSlot, bounds: { width: number; height: number }) {
  return {
    x: clamp(offset.x, -slot.x, Math.max(-slot.x, bounds.width - slot.x - slot.width)),
    y: clamp(offset.y, -slot.y, Math.max(-slot.y, bounds.height - slot.y - slot.height)),
  };
}

function resolveCircleCollisions<T extends SimNode>(nodes: T[], width: number, height: number) {
  for (let pass = 0; pass < 64; pass += 1) {
    let changed = false;
    for (let index = 0; index < nodes.length; index += 1) {
      for (let other = index + 1; other < nodes.length; other += 1) {
        const a = nodes[index];
        const b = nodes[other];
        const dx = (b.x ?? 0) - (a.x ?? 0);
        const dy = (b.y ?? 0) - (a.y ?? 0);
        const distance = Math.hypot(dx, dy) || 1;
        const minimum = (a.radius ?? 18) + (b.radius ?? 18) + 5;
        if (distance >= minimum) continue;
        changed = true;
        const shift = minimum - distance;
        const ux = distance === 1 && dx === 0 ? (index % 2 ? -1 : 1) : dx / distance;
        const uy = distance === 1 && dy === 0 ? (other % 2 ? -.5 : .5) : dy / distance;
        const aShare = a.fixed ? 0 : b.fixed ? 1 : .5;
        const bShare = b.fixed ? 0 : a.fixed ? 1 : .5;
        a.x = clamp((a.x ?? 0) - ux * shift * aShare, (a.radius ?? 18) + 14, width - (a.radius ?? 18) - 14);
        a.y = clamp((a.y ?? 0) - uy * shift * aShare, (a.radius ?? 18) + 14, height - (a.radius ?? 18) - 14);
        b.x = clamp((b.x ?? 0) + ux * shift * bShare, (b.radius ?? 18) + 14, width - (b.radius ?? 18) - 14);
        b.y = clamp((b.y ?? 0) + uy * shift * bShare, (b.radius ?? 18) + 14, height - (b.radius ?? 18) - 14);
      }
    }
    if (!changed) break;
  }
  return nodes as Array<T & { x: number; y: number }>;
}

function clamp(value: number | undefined, min: number, max: number) {
  const finite = Number.isFinite(value) ? Number(value) : 0;
  return Math.min(max, Math.max(min, finite));
}
