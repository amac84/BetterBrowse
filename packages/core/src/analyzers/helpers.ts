import type { DomNode } from "../types";

export function groupVisibleNodesByParent(nodes: DomNode[]): Map<string, DomNode[]> {
  const groups = new Map<string, DomNode[]>();

  for (const node of nodes) {
    if (!node.visibility.visible || !node.parentSelector) {
      continue;
    }

    const group = groups.get(node.parentSelector) ?? [];
    group.push(node);
    groups.set(node.parentSelector, group);
  }

  return groups;
}

export function splitIntoPeerGroups(nodes: DomNode[]): DomNode[][] {
  const groups = new Map<string, DomNode[]>();

  for (const node of nodes) {
    const key = `${node.tagName}:${node.role ?? "none"}`;
    const group = groups.get(key) ?? [];
    group.push(node);
    groups.set(key, group);
  }

  return [...groups.values()].filter((group) => group.length >= 3);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  if (sorted.length === 0) {
    return 0;
  }

  const midpoint = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const left = sorted[midpoint - 1] ?? 0;
    const right = sorted[midpoint] ?? left;
    return (left + right) / 2;
  }

  return sorted[midpoint] ?? 0;
}

export function routeSegments(route: string): string[] {
  return route.split("/").map((segment) => segment.trim()).filter(Boolean);
}
