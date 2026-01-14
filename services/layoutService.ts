
import { CanvasElement, Connection } from "../types";

/**
 * Calculates a hierarchical layout for the canvas elements.
 * Root nodes are placed on the left, and children/connected nodes flow to the right.
 */
export const calculateHierarchicalLayout = (
  elements: CanvasElement[],
  connections: Connection[]
): { id: string; x: number; y: number }[] => {
  if (elements.length === 0) return [];

  // 1. Build an adjacency list for outgoing connections
  const adj: Record<string, string[]> = {};
  const inDegree: Record<string, number> = {};
  
  elements.forEach((el) => {
    adj[el.id] = [];
    inDegree[el.id] = 0;
  });

  connections.forEach((conn) => {
    if (adj[conn.fromId] && adj[conn.toId]) {
      adj[conn.fromId].push(conn.toId);
      inDegree[conn.toId]++;
    }
  });

  // 2. Identify root nodes (those with no parentId and lowest in-degree)
  const roots = elements.filter(el => !el.parentId && inDegree[el.id] === 0);
  
  // If no pure roots, just pick the first element as a fallback
  if (roots.length === 0 && elements.length > 0) {
    roots.push(elements[0]);
  }

  const levels: Record<string, number> = {};
  const visited = new Set<string>();

  // BFS to assign levels
  const queue: { id: string; level: number }[] = roots.map(r => ({ id: r.id, level: 0 }));
  queue.forEach(q => visited.add(q.id));

  let head = 0;
  while (head < queue.length) {
    const { id, level } = queue[head++];
    levels[id] = level;

    (adj[id] || []).forEach(childId => {
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, level: level + 1 });
      }
    });
  }

  // Handle orphan nodes
  elements.forEach(el => {
    if (levels[el.id] === undefined) {
      levels[el.id] = 0;
    }
  });

  // 3. Group by levels and calculate coordinates
  const levelGroups: Record<number, string[]> = {};
  Object.entries(levels).forEach(([id, level]) => {
    if (!levelGroups[level]) levelGroups[level] = [];
    levelGroups[level].push(id);
  });

  const CARD_WIDTH = 750;
  const CARD_HEIGHT = 600;
  const VERTICAL_GAP = 100;
  const HORIZONTAL_GAP = 200;

  const newPositions: { id: string; x: number; y: number }[] = [];

  Object.entries(levelGroups).forEach(([levelStr, ids]) => {
    const level = parseInt(levelStr);
    const x = level * (CARD_WIDTH + HORIZONTAL_GAP);
    const totalHeight = ids.length * CARD_HEIGHT + (ids.length - 1) * VERTICAL_GAP;
    const startY = -totalHeight / 2;

    ids.forEach((id, index) => {
      const y = startY + index * (CARD_HEIGHT + VERTICAL_GAP);
      newPositions.push({ id, x, y });
    });
  });

  return newPositions;
};
