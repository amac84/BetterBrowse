import type { Analyzer, AuditContext, AuditIssue, DomNode } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { createReplacementFixHint, extractSpacingUtilities } from "../utils/tailwind";
import { groupVisibleNodesByParent, median, routeSegments, splitIntoPeerGroups } from "./helpers";

export class SpacingAnalyzer implements Analyzer {
  public readonly name = "SpacingAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const groups = groupVisibleNodesByParent(context.artifact.domSnapshot.nodes);
    const seen = new Set<string>();

    for (const nodes of groups.values()) {
      for (const peers of splitIntoPeerGroups(nodes)) {
        issues.push(...findSpacingIssues(peers, context, seen));
        issues.push(...findGeometricSpacingIssues(peers, context, seen));
      }
    }

    return issues.slice(0, 6);
  }
}

function findSpacingIssues(nodes: DomNode[], context: AuditContext, seen: Set<string>): AuditIssue[] {
  const familyCounts = new Map<string, Map<string, DomNode[]>>();

  for (const node of nodes) {
    for (const token of extractSpacingUtilities(node.classList)) {
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
        type: "spacing",
        severity: "medium",
        route: context.artifact.route,
        viewport: context.artifact.viewport.name,
        selector: outlier.selector,
        description: `Sibling elements use inconsistent ${family} spacing utilities; this element uses ${outlierToken} while similar peers use ${majorityToken}.`,
        evidence: {
          screenshot: context.artifact.screenshotPath
        },
        recommendedFix: `Normalize ${outlierToken} to ${majorityToken} on the outlier component to match sibling spacing.`,
        confidence: 0.82,
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

function findGeometricSpacingIssues(nodes: DomNode[], context: AuditContext, seen: Set<string>): AuditIssue[] {
  if (nodes.length < 4 || hasSpacingUtilities(nodes)) {
    return [];
  }

  const axis = selectPrimaryAxis(nodes);
  const ordered = [...nodes].sort((left, right) =>
    axis === "y" ? left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x : left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y
  );

  const gapSamples: Array<{ index: number; gap: number }> = [];
  for (let index = 0; index < ordered.length - 1; index += 1) {
    const current = ordered[index];
    const next = ordered[index + 1];
    if (!current || !next) {
      continue;
    }

    const gap = Math.round(axis === "y" ? next.bounds.y - current.bounds.bottom : next.bounds.x - current.bounds.right);
    if (gap < -2 || gap > 96) {
      continue;
    }

    gapSamples.push({ index, gap });
  }

  if (gapSamples.length < 3) {
    return [];
  }

  const baselineGap = median(gapSamples.map((sample) => sample.gap));
  const alignedSamples = gapSamples.filter((sample) => Math.abs(sample.gap - baselineGap) <= 4);
  const outlierSamples = gapSamples.filter((sample) => Math.abs(sample.gap - baselineGap) >= 10 && Math.abs(sample.gap - baselineGap) <= 48);
  if (alignedSamples.length < 2 || outlierSamples.length !== 1) {
    return [];
  }

  const outlierSample = outlierSamples[0];
  if (!outlierSample) {
    return [];
  }

  const outlier = ordered[outlierSample.index + 1];
  if (!outlier) {
    return [];
  }

  const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${outlier.selector}:geom-${axis}`;
  if (seen.has(dedupeKey)) {
    return [];
  }

  seen.add(dedupeKey);

  return [
    createIssue({
      type: "spacing",
      severity: "low",
      route: context.artifact.route,
      viewport: context.artifact.viewport.name,
      selector: outlier.selector,
      description: `Sibling spacing is inconsistent. The gap before this element is ${outlierSample.gap}px while similar peers are near ${Math.round(baselineGap)}px.`,
      evidence: {
        screenshot: context.artifact.screenshotPath
      },
      recommendedFix:
        axis === "y"
          ? "Align vertical rhythm by adjusting this element's margin/padding or the parent container gap value."
          : "Align horizontal rhythm by adjusting this element's margin/padding or the parent container gap value.",
      confidence: 0.69,
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

function hasSpacingUtilities(nodes: DomNode[]): boolean {
  return nodes.some((node) => extractSpacingUtilities(node.classList).length > 0);
}

function selectPrimaryAxis(nodes: DomNode[]): "x" | "y" {
  const xs = nodes.map((node) => node.bounds.x);
  const ys = nodes.map((node) => node.bounds.y);

  const xSpread = Math.max(...xs) - Math.min(...xs);
  const ySpread = Math.max(...ys) - Math.min(...ys);
  return ySpread >= xSpread ? "y" : "x";
}
