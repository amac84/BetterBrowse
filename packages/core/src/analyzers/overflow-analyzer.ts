import type { Analyzer, AuditContext, AuditIssue } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { routeSegments } from "./helpers";

export class OverflowAnalyzer implements Analyzer {
  public readonly name = "OverflowAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const { domSnapshot, viewport, screenshotPath } = context.artifact;
    const issues: AuditIssue[] = [];

    if (domSnapshot.document.scrollWidth > viewport.width + 4) {
      issues.push(
        createIssue({
          type: "overflow",
          severity: viewport.name.includes("mobile") ? "high" : "medium",
          route: context.artifact.route,
          viewport: viewport.name,
          selector: "body",
          description: `The page content is ${Math.round(domSnapshot.document.scrollWidth - viewport.width)} pixels wider than the ${viewport.name} viewport.`,
          evidence: {
            screenshot: screenshotPath
          },
          recommendedFix: "Remove the fixed-width or oversized container that is forcing horizontal scrolling on this route.",
          confidence: 0.91,
          metadata: {
            routeSegments: routeSegments(context.artifact.route)
          }
        })
      );
    }

    const overflowingNodes = domSnapshot.nodes
      .filter(
        (node) =>
          node.visibility.visible &&
          node.bounds.width > 40 &&
          (node.bounds.right > viewport.width + 4 || node.metrics.scrollWidth > node.metrics.clientWidth + 12)
      )
      .sort(
        (left, right) =>
          (right.bounds.right - viewport.width) + (right.metrics.scrollWidth - right.metrics.clientWidth) -
          ((left.bounds.right - viewport.width) + (left.metrics.scrollWidth - left.metrics.clientWidth))
      )
      .slice(0, 3);

    for (const node of overflowingNodes) {
      issues.push(
        createIssue({
          type: "overflow",
          severity: viewport.name.includes("mobile") ? "high" : "medium",
          route: context.artifact.route,
          viewport: viewport.name,
          selector: node.selector,
          description: `This element appears to overflow or clip inside the ${viewport.name} viewport.`,
          evidence: {
            screenshot: screenshotPath
          },
          recommendedFix: "Reduce the element's width or min-width, or allow the layout to wrap instead of forcing overflow.",
          confidence: 0.78,
          metadata: {
            tagName: node.tagName,
            classList: node.classList,
            elementText: node.textPreview,
            routeSegments: routeSegments(context.artifact.route),
            matchingTextTokens: tokenizeText(node.textPreview)
          }
        })
      );
    }

    return issues;
  }
}
