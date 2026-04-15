import type { AuditIssue, Severity } from "../types";
import { stableHash } from "./hash";

const SEVERITY_ORDER: Record<Severity, number> = {
  high: 0,
  medium: 1,
  low: 2
};

export function createIssue(issue: Omit<AuditIssue, "id" | "suspectedSourceFiles"> & { suspectedSourceFiles?: string[] }): AuditIssue {
  const normalizedDescription = normalizeDescription(issue.description);
  const normalizedFixHints = (issue.metadata?.fixHints ?? [])
    .map((hint) => `${hint.kind}:${hint.family}:${hint.from}->${hint.to}`)
    .sort();

  const stableKey = JSON.stringify({
    type: issue.type,
    route: issue.route,
    viewport: issue.viewport,
    selector: issue.selector,
    description: normalizedDescription,
    tagName: issue.metadata?.tagName ?? "",
    fixHints: normalizedFixHints
  });

  return {
    ...issue,
    id: `${issue.type}-${stableHash(stableKey).slice(0, 12)}`,
    suspectedSourceFiles: issue.suspectedSourceFiles ?? []
  };
}

export function sortIssues(issues: AuditIssue[]): AuditIssue[] {
  return [...issues].sort((left, right) => {
    if (SEVERITY_ORDER[left.severity] !== SEVERITY_ORDER[right.severity]) {
      return SEVERITY_ORDER[left.severity] - SEVERITY_ORDER[right.severity];
    }

    return left.id.localeCompare(right.id);
  });
}

export function isFixableIssue(issue: AuditIssue): boolean {
  return Boolean(issue.metadata?.fixHints?.length);
}

function normalizeDescription(value: string): string {
  return value
    .toLowerCase()
    .replace(/\d+(\.\d+)?/g, "#")
    .replace(/\s+/g, " ")
    .trim();
}
