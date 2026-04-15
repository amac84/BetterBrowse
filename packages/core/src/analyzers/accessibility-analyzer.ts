import type { Analyzer, AuditContext, AuditIssue, DomNode } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { routeSegments } from "./helpers";

const ACTIONABLE_TAGS = new Set(["button", "a"]);
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);

export class AccessibilityAnalyzer implements Analyzer {
  public readonly name = "AccessibilityAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];

    for (const node of context.artifact.domSnapshot.nodes) {
      if (!node.visibility.visible || shouldIgnore(node)) {
        continue;
      }

      if (node.tagName === "img" && !node.attributes.alt?.trim()) {
        issues.push(createImageIssue(node, context));
        continue;
      }

      if ((ACTIONABLE_TAGS.has(node.tagName) || node.role === "button") && !node.accessibleName?.trim()) {
        issues.push(createActionIssue(node, context));
        continue;
      }

      if (CONTROL_TAGS.has(node.tagName) && node.attributes.type !== "hidden" && !node.accessibleName?.trim()) {
        issues.push(createControlIssue(node, context));
      }
    }

    return issues.slice(0, 10);
  }
}

function createImageIssue(node: DomNode, context: AuditContext): AuditIssue {
  return createIssue({
    type: "accessibility",
    severity: "medium",
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: "Image is missing alternative text.",
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Add a meaningful alt attribute, or mark the image decorative with aria-hidden=\"true\" if it should be ignored by assistive tech.",
    confidence: 0.95,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route)
    }
  });
}

function createActionIssue(node: DomNode, context: AuditContext): AuditIssue {
  return createIssue({
    type: "accessibility",
    severity: "high",
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: "Interactive control does not expose an accessible name.",
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Add visible text, aria-label, or aria-labelledby so the control has a reliable accessible name.",
    confidence: 0.95,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route),
      matchingTextTokens: tokenizeText(node.textPreview)
    }
  });
}

function createControlIssue(node: DomNode, context: AuditContext): AuditIssue {
  return createIssue({
    type: "accessibility",
    severity: "high",
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: "Form control is missing an associated label or aria label.",
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Associate a visible label, aria-label, or aria-labelledby target with this form control.",
    confidence: 0.95,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route),
      matchingTextTokens: tokenizeText(node.textPreview)
    }
  });
}

function shouldIgnore(node: DomNode): boolean {
  return node.attributes["aria-hidden"] === "true" || node.role === "presentation";
}
