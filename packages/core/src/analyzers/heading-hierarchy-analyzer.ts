import type { Analyzer, AuditContext, AuditIssue, DomNode, Severity } from "../types";
import { createIssue } from "../utils/issues";
import { routeSegments } from "./helpers";

const HEADING_PATTERN = /^h([1-6])$/;

export class HeadingHierarchyAnalyzer implements Analyzer {
  public readonly name = "HeadingHierarchyAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const headings = context.artifact.domSnapshot.nodes
      .filter((node) => node.visibility.visible && getHeadingLevel(node) !== null)
      .sort((left, right) => left.bounds.y - right.bounds.y || left.bounds.x - right.bounds.x);

    if (headings.length === 0) {
      return [];
    }

    const issues: AuditIssue[] = [];
    const h1Headings = headings.filter((node) => getHeadingLevel(node) === 1);

    if (h1Headings.length === 0) {
      const firstHeading = headings[0];
      if (firstHeading) {
        issues.push(
          createHierarchyIssue(
            firstHeading,
            context,
            "medium",
            "No visible h1 heading was found on this route.",
            "Add a single descriptive h1 near the top of the page so the heading structure starts at level 1.",
            0.85
          )
        );
      }
    } else if (h1Headings.length > 1) {
      const duplicateHeading = h1Headings[1] ?? h1Headings[0];
      if (duplicateHeading) {
        issues.push(
          createHierarchyIssue(
            duplicateHeading,
            context,
            "low",
            "Multiple visible h1 headings were found on this route.",
            "Keep a single page-level h1 and use h2-h6 for subordinate sections.",
            0.72
          )
        );
      }
    }

    for (let index = 1; index < headings.length; index += 1) {
      const previous = headings[index - 1];
      const current = headings[index];
      if (!previous || !current) {
        continue;
      }

      const previousLevel = getHeadingLevel(previous);
      const currentLevel = getHeadingLevel(current);
      if (previousLevel === null || currentLevel === null) {
        continue;
      }

      if (currentLevel > previousLevel + 1) {
        issues.push(
          createHierarchyIssue(
            current,
            context,
            "medium",
            `Heading levels skip from h${previousLevel} to h${currentLevel}.`,
            `Use h${previousLevel + 1} for this section or adjust surrounding heading levels to keep a logical sequence.`,
            0.8
          )
        );
      }
    }

    return issues.slice(0, 6);
  }
}

function createHierarchyIssue(
  node: DomNode,
  context: AuditContext,
  severity: Severity,
  description: string,
  recommendedFix: string,
  confidence: number
): AuditIssue {
  return createIssue({
    type: "hierarchy",
    severity,
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description,
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix,
    confidence,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route)
    }
  });
}

function getHeadingLevel(node: DomNode): number | null {
  const match = node.tagName.toLowerCase().match(HEADING_PATTERN);
  if (!match?.[1]) {
    return null;
  }

  const level = Number.parseInt(match[1], 10);
  if (Number.isNaN(level) || level < 1 || level > 6) {
    return null;
  }

  return level;
}
