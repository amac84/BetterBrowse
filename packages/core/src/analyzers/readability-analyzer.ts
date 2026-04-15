import type { Analyzer, AuditContext, AuditIssue, DomNode, Severity } from "../types";
import { tokenizeText } from "../utils/hash";
import { createIssue } from "../utils/issues";
import { routeSegments } from "./helpers";

type Rgba = {
  r: number;
  g: number;
  b: number;
  a: number;
};

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export class ReadabilityAnalyzer implements Analyzer {
  public readonly name = "ReadabilityAnalyzer";

  public async run(context: AuditContext): Promise<AuditIssue[]> {
    const issues: AuditIssue[] = [];
    const seen = new Set<string>();
    const isMobileViewport = context.artifact.viewport.name.toLowerCase().includes("mobile");

    for (const node of context.artifact.domSnapshot.nodes) {
      if (!node.visibility.visible || !hasMeaningfulText(node)) {
        continue;
      }

      const tinyTextIssue = createTinyTextIssue(node, context, isMobileViewport, seen);
      if (tinyTextIssue) {
        issues.push(tinyTextIssue);
      }

      const contrastIssue = createContrastIssue(node, context, seen);
      if (contrastIssue) {
        issues.push(contrastIssue);
      }
    }

    return issues.slice(0, 10);
  }
}

function createTinyTextIssue(
  node: DomNode,
  context: AuditContext,
  isMobileViewport: boolean,
  seen: Set<string>
): AuditIssue | null {
  if (!Number.isFinite(node.computed.fontSize) || node.computed.fontSize >= 12) {
    return null;
  }

  const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${node.selector}:tiny-text`;
  if (seen.has(dedupeKey)) {
    return null;
  }

  seen.add(dedupeKey);

  const severity: Severity = isMobileViewport || node.computed.fontSize < 10.5 ? "high" : "medium";
  return createIssue({
    type: "readability",
    severity,
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: `Text appears too small for comfortable reading at ${formatNumber(node.computed.fontSize)}px.`,
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Increase font size to at least 12px (and usually 14px+ for body text), especially on mobile viewports.",
    confidence: 0.79,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route),
      matchingTextTokens: tokenizeText(node.textPreview)
    }
  });
}

function createContrastIssue(node: DomNode, context: AuditContext, seen: Set<string>): AuditIssue | null {
  const foreground = parseCssColor(node.computed.color);
  if (!foreground) {
    return null;
  }

  const background = parseCssColor(node.computed.backgroundColor);
  const resolvedBackground = flattenOnWhite(background ?? WHITE);
  const resolvedForeground = flattenOverBackground(foreground, resolvedBackground);
  const ratio = contrastRatio(resolvedForeground, resolvedBackground);
  const threshold = isLargeText(node.computed.fontSize, node.computed.fontWeight) ? 3 : 4.5;
  if (ratio + 0.01 >= threshold) {
    return null;
  }

  const dedupeKey = `${context.artifact.route}:${context.artifact.viewport.name}:${node.selector}:contrast`;
  if (seen.has(dedupeKey)) {
    return null;
  }

  seen.add(dedupeKey);
  const severity: Severity = ratio < 3 ? "high" : "medium";

  return createIssue({
    type: "readability",
    severity,
    route: context.artifact.route,
    viewport: context.artifact.viewport.name,
    selector: node.selector,
    description: `Text contrast ratio is ${formatNumber(ratio)}:1, below the recommended ${formatNumber(threshold)}:1.`,
    evidence: {
      screenshot: context.artifact.screenshotPath
    },
    recommendedFix: "Increase text/background contrast so body text is at least 4.5:1 and large text is at least 3:1.",
    confidence: 0.76,
    metadata: {
      tagName: node.tagName,
      classList: node.classList,
      elementText: node.textPreview,
      routeSegments: routeSegments(context.artifact.route),
      matchingTextTokens: tokenizeText(node.textPreview)
    }
  });
}

function hasMeaningfulText(node: DomNode): boolean {
  const text = node.textPreview.trim();
  return text.length >= 3;
}

function parseCssColor(value: string): Rgba | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  if (normalized === "transparent") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  if (normalized === "white") {
    return { ...WHITE };
  }

  if (normalized === "black") {
    return { r: 0, g: 0, b: 0, a: 1 };
  }

  const rgbMatch = normalized.match(/^rgba?\((.+)\)$/);
  if (rgbMatch?.[1]) {
    const parts = rgbMatch[1]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean);

    if (parts.length >= 3) {
      const rPart = parts[0];
      const gPart = parts[1];
      const bPart = parts[2];
      if (!rPart || !gPart || !bPart) {
        return null;
      }

      const r = clampChannel(rPart);
      const g = clampChannel(gPart);
      const b = clampChannel(bPart);
      const a = parts[3] ? clampAlpha(parts[3]) : 1;
      return { r, g, b, a };
    }
  }

  const hexMatch = normalized.match(/^#([0-9a-f]{3,8})$/i);
  if (hexMatch?.[1]) {
    const hex = hexMatch[1];
    if (hex.length === 3 || hex.length === 4) {
      const r = Number.parseInt(`${hex[0]}${hex[0]}`, 16);
      const g = Number.parseInt(`${hex[1]}${hex[1]}`, 16);
      const b = Number.parseInt(`${hex[2]}${hex[2]}`, 16);
      const a = hex.length === 4 ? Number.parseInt(`${hex[3]}${hex[3]}`, 16) / 255 : 1;
      return { r, g, b, a };
    }

    if (hex.length === 6 || hex.length === 8) {
      const r = Number.parseInt(hex.slice(0, 2), 16);
      const g = Number.parseInt(hex.slice(2, 4), 16);
      const b = Number.parseInt(hex.slice(4, 6), 16);
      const a = hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1;
      return { r, g, b, a };
    }
  }

  return null;
}

function clampChannel(value: string): number {
  const parsed = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  if (value.includes("%")) {
    return Math.max(0, Math.min(255, Math.round((parsed / 100) * 255)));
  }

  return Math.max(0, Math.min(255, Math.round(parsed)));
}

function clampAlpha(value: string): number {
  const parsed = Number.parseFloat(value.replace("%", ""));
  if (!Number.isFinite(parsed)) {
    return 1;
  }

  if (value.includes("%")) {
    return Math.max(0, Math.min(1, parsed / 100));
  }

  return Math.max(0, Math.min(1, parsed));
}

function flattenOnWhite(color: Rgba): Rgba {
  return flattenOverBackground(color, WHITE);
}

function flattenOverBackground(foreground: Rgba, background: Rgba): Rgba {
  const alpha = Math.max(0, Math.min(1, foreground.a));
  return {
    r: Math.round(foreground.r * alpha + background.r * (1 - alpha)),
    g: Math.round(foreground.g * alpha + background.g * (1 - alpha)),
    b: Math.round(foreground.b * alpha + background.b * (1 - alpha)),
    a: 1
  };
}

function contrastRatio(left: Rgba, right: Rgba): number {
  const luminanceLeft = relativeLuminance(left);
  const luminanceRight = relativeLuminance(right);
  const lighter = Math.max(luminanceLeft, luminanceRight);
  const darker = Math.min(luminanceLeft, luminanceRight);
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: Rgba): number {
  const toLinear = (channel: number): number => {
    const normalized = channel / 255;
    if (normalized <= 0.03928) {
      return normalized / 12.92;
    }

    return ((normalized + 0.055) / 1.055) ** 2.4;
  };

  const r = toLinear(color.r);
  const g = toLinear(color.g);
  const b = toLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function isLargeText(fontSize: number, fontWeight: number): boolean {
  if (!Number.isFinite(fontSize) || fontSize <= 0) {
    return false;
  }

  if (fontSize >= 24) {
    return true;
  }

  return fontSize >= 18.66 && fontWeight >= 700;
}

function formatNumber(value: number): string {
  return value.toFixed(2).replace(/\.00$/, "");
}
