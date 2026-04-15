import type { Analyzer, AuditContext, AuditIssue, DomNode } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { createReplacementFixHint, extractAlignmentUtilities } from "../utils/tailwind";
import { groupVisibleNodesByParent, median, routeSegments, splitIntoPeerGroups } from "./helpers";

export class AlignmentAnalyzer implements Analyzer {
  public readonly name = "AlignmentAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const groups = groupVisibleNodesByParent(context.artifact.domSnapshot.nodes);
    const seen = new Set<string>();

    for (const nodes of groups.values()) {
      for (const peers of splitIntoPeerGroups(nodes)) {
        issues.push(...findUtilityAlignmentIssues(peers, context, seen));
        issues.push(...findComputedAlignmentIssues(peers, context, seen));
        issues.push(...findEdgeDriftIssues(peers, context, seen));
      }
    }

    return issues.slice(0, 6);
  }
}

function findUtilityAlignmentIssues(nodes: DomNode[], context: AuditContext, seen: Set<string>): AuditIssue[] {
  const familyCounts = new Map<string, Map<string, DomNode[]>>();

  for (const node of nodes) {
    for (const token of extractAlignmentUtilities(node.classList)) {
      const byFamily = familyCounts.get(token.family) ?? new Map<string, DomNode[]>();
      const members = byFamily.get(token.raw) ?? [];
      members.push(node);
      byFamily.set(token.raw, members);
      familyCounts.set(token.family, byFamily);
    }
  }

  const issues: AuditIssue[] = [];

  for (const [family, tokenGroups] of familyCounts) {
    const ranked = [...tokenGroups.entries()].sort((left, right) => right[1].length - left[1].length);
    if (ranked.length < 2) {
      continue;
    }

    const majorityEntry = ranked[0];
    const outlierEntry = ranked[1];
    if (!majorityEntry || !outlierEntry) {
      continue;
    }

    const [majorityToken, majorityNodes] = majorityEntry;
    const [outlierToken, outlierNodes] = outlierEntry;
    if (!majorityToken || !outlierToken || majorityNodes.length < 2 || outlierNodes.length !== 1 || ranked.length > 2) {
      continue;
    }

    const outlier = outlierNodes[0];
    if (!outlier) {
      continue;
    }

    const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${outlier.selector}:${family}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    issues.push(
      createIssue({
        type: "alignment",
        severity: "medium",
        route: context.artifact.route,
        viewport: context.artifact.viewport.name,
        selector: outlier.selector,
        description: `Sibling elements use inconsistent ${family} alignment utilities; this element uses ${outlierToken} while similar peers use ${majorityToken}.`,
        evidence: {
          screenshot: context.artifact.screenshotPath
        },
        recommendedFix: `Normalize ${outlierToken} to ${majorityToken} so this element aligns with its sibling pattern.`,
        confidence: 0.8,
        metadata: {
          tagName: outlier.tagName,
          classList: outlier.classList,
          elementText: outlier.textPreview,
          routeSegments: routeSegments(context.artifact.route),
          matchingTextTokens: tokenizeText(outlier.textPreview),
          fixHints: [createReplacementFixHint(family, outlierToken, majorityToken, outlier.selector)]
        }
      })
    );
  }

  return issues;
}

function findComputedAlignmentIssues(nodes: DomNode[], context: AuditContext, seen: Set<string>): AuditIssue[] {
  if (hasAlignmentUtilities(nodes)) {
    return [];
  }

  const families: Array<{
    family: string;
    valueFor: (node: DomNode) => string;
    includeWhen?: (node: DomNode) => boolean;
  }> = [
    {
      family: "computed text-align",
      valueFor: (node) => node.computed.textAlign
    },
    {
      family: "computed justify-content",
      valueFor: (node) => node.computed.justifyContent,
      includeWhen: (node) => node.computed.display.includes("flex")
    },
    {
      family: "computed align-items",
      valueFor: (node) => node.computed.alignItems,
      includeWhen: (node) => node.computed.display.includes("flex")
    }
  ];

  const issues: AuditIssue[] = [];
  for (const family of families) {
    const tokenGroups = new Map<string, DomNode[]>();

    for (const node of nodes) {
      if (family.includeWhen && !family.includeWhen(node)) {
        continue;
      }

      const value = normalizeComputedAlignment(family.valueFor(node));
      if (!value) {
        continue;
      }

      const members = tokenGroups.get(value) ?? [];
      members.push(node);
      tokenGroups.set(value, members);
    }

    const ranked = [...tokenGroups.entries()].sort((left, right) => right[1].length - left[1].length);
    if (ranked.length < 2) {
      continue;
    }

    const majorityEntry = ranked[0];
    const outlierEntry = ranked[1];
    if (!majorityEntry || !outlierEntry) {
      continue;
    }

    const [majorityValue, majorityNodes] = majorityEntry;
    const [outlierValue, outlierNodes] = outlierEntry;
    if (!majorityValue || !outlierValue || majorityNodes.length < 2 || outlierNodes.length !== 1 || ranked.length > 2) {
      continue;
    }

    const outlier = outlierNodes[0];
    if (!outlier) {
      continue;
    }

    const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${outlier.selector}:${family.family}`;
    if (seen.has(dedupeKey)) {
      continue;
    }

    seen.add(dedupeKey);
    issues.push(
      createIssue({
        type: "alignment",
        severity: "medium",
        route: context.artifact.route,
        viewport: context.artifact.viewport.name,
        selector: outlier.selector,
        description: `Sibling elements have inconsistent ${family.family}; this element uses "${outlierValue}" while similar peers use "${majorityValue}".`,
        evidence: {
          screenshot: context.artifact.screenshotPath
        },
        recommendedFix: `Use a consistent ${family.family} value across sibling components unless this difference is intentional.`,
        confidence: 0.72,
        metadata: {
          tagName: outlier.tagName,
          classList: outlier.classList,
          elementText: outlier.textPreview,
          routeSegments: routeSegments(context.artifact.route),
          matchingTextTokens: tokenizeText(outlier.textPreview)
        }
      })
    );
  }

  return issues;
}

function findEdgeDriftIssues(nodes: DomNode[], context: AuditContext, seen: Set<string>): AuditIssue[] {
  const filtered = nodes.filter((node) => node.bounds.width >= 80);
  if (filtered.length < 3) {
    return [];
  }

  const leftEdges = filtered.map((node) => Math.round(node.bounds.x));
  const medianLeft = median(leftEdges);
  const aligned = filtered.filter((node) => Math.abs(node.bounds.x - medianLeft) <= 2);
  const outliers = filtered.filter((node) => Math.abs(node.bounds.x - medianLeft) >= 6 && Math.abs(node.bounds.x - medianLeft) <= 24);

  if (aligned.length < 2 || outliers.length !== 1) {
    return [];
  }

  const outlier = outliers[0];
  if (!outlier) {
    return [];
  }

  const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${outlier.selector}:left-edge`;
  if (seen.has(dedupeKey)) {
    return [];
  }

  seen.add(dedupeKey);

  return [
    createIssue({
      type: "alignment",
      severity: "low",
      route: context.artifact.route,
      viewport: context.artifact.viewport.name,
      selector: outlier.selector,
      description: `This element drifts ${Math.round(Math.abs(outlier.bounds.x - medianLeft))} pixels from the sibling left-edge alignment.`,
      evidence: {
        screenshot: context.artifact.screenshotPath
      },
      recommendedFix: "Check the outlier element's spacing or alignment classes and bring its left edge back into line with neighboring siblings.",
      confidence: 0.62,
      metadata: {
        tagName: outlier.tagName,
        classList: outlier.classList,
        elementText: outlier.textPreview,
        routeSegments: routeSegments(context.artifact.route),
        matchingTextTokens: tokenizeText(outlier.textPreview)
      }
    })
  ];
}

function hasAlignmentUtilities(nodes: DomNode[]): boolean {
  return nodes.some((node) => extractAlignmentUtilities(node.classList).length > 0);
}

function normalizeComputedAlignment(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized === "normal" || normalized === "initial" || normalized === "inherit") {
    return null;
  }

  return normalized;
}
