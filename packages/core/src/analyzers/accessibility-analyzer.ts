import type { Analyzer, AuditContext, AuditIssue, DomNode } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { routeSegments } from "./helpers";

const ACTIONABLE_TAGS = new Set(["button", "a"]);
const CONTROL_TAGS = new Set(["input", "select", "textarea"]);
const TOUCH_TARGET_MIN_SIZE = 44;

export class AccessibilityAnalyzer implements Analyzer {
  public readonly name = "AccessibilityAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const seen = new Set<string>();

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

      const touchTargetIssue = createTouchTargetIssue(node, context, seen);
      if (touchTargetIssue) {
        issues.push(touchTargetIssue);
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

function createTouchTargetIssue(node: DomNode, context: AuditContext, seen: Set<string>): AuditIssue | null {
  if (!isTouchTargetCandidate(node)) {
    return null;
  }

  const width = Math.round(node.bounds.width);
  const height = Math.round(node.bounds.height);
  if (width >= TOUCH_TARGET_MIN_SIZE && height >= TOUCH_TARGET_MIN_SIZE) {
    return null;
  }

  const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${node.selector}:touch-target`;
  if (seen.has(dedupeKey)) {
    return null;
  }

  seen.add(dedupeKey);

  return createIssue({
    type: "accessibility",
    severity: width < 32 || height < 32 ? "medium" : "low",
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: `Interactive target size is ${width}x${height}px, below the recommended 44x44px touch target size.`,
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Increase hit area with min-width/min-height or padding so touch targets are at least 44x44px where possible.",
    confidence: 0.75,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route),
      matchingTextTokens: tokenizeText(node.textPreview)
    }
  });
}

function isTouchTargetCandidate(node: DomNode): boolean {
  if (node.role === "button") {
    return true;
  }

  if (node.tagName === "a") {
    return looksButtonLikeLink(node);
  }

  if (!CONTROL_TAGS.has(node.tagName) && !ACTIONABLE_TAGS.has(node.tagName)) {
    return false;
  }

  if (node.tagName === "input" && node.attributes.type === "hidden") {
    return false;
  }

  return true;
}

function looksButtonLikeLink(node: DomNode): boolean {
  if (node.role === "button") {
    return true;
  }

  const lowerClasses = node.classList.map((value) => value.toLowerCase());
  return lowerClasses.some((value) =>
    value.includes("btn") || value.includes("button") || value.includes("cta") || value.includes("chip") || value.includes("pill")
  );
}
