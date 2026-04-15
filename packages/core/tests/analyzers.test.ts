import { describe, expect, it } from "vitest";

import { AlignmentAnalyzer } from "../src/analyzers/alignment-analyzer";
import { AccessibilityAnalyzer } from "../src/analyzers/accessibility-analyzer";
import { OverflowAnalyzer } from "../src/analyzers/overflow-analyzer";
import { ReadabilityAnalyzer } from "../src/analyzers/readability-analyzer";
import { SpacingAnalyzer } from "../src/analyzers/spacing-analyzer";
import { createDefaultConfig } from "../src/defaults";
import type { AuditContext, DomNode, RouteArtifact, ViewportConfig } from "../src/types";

const viewport: ViewportConfig = {
  name: "desktop",
  width: 1440,
  height: 1024
};

describe("BetterBrowse analyzers", () => {
  it("flags spacing utility outliers with a safe replacement hint", async () => {
    const analyzer = new SpacingAnalyzer();
    const context = createContext([
      createNode({ selector: "#card-1", parentSelector: "#grid", classList: ["rounded-xl", "p-4"] }),
      createNode({ selector: "#card-2", parentSelector: "#grid", classList: ["rounded-xl", "p-4"] }),
      createNode({ selector: "#card-3", parentSelector: "#grid", classList: ["rounded-xl", "p-6"] })
    ]);

    const issues = await analyzer.run(context);
    expect(issues).toHaveLength(1);
    expect(issues[0].type).toBe("spacing");
    expect(issues[0].metadata?.fixHints?.[0]).toMatchObject({
      from: "p-6",
      to: "p-4"
    });
  });

  it("flags alignment utility outliers", async () => {
    const analyzer = new AlignmentAnalyzer();
    const context = createContext([
      createNode({ selector: "#item-1", parentSelector: "#list", classList: ["text-left", "p-4"], bounds: { x: 0, right: 200 } }),
      createNode({ selector: "#item-2", parentSelector: "#list", classList: ["text-left", "p-4"], bounds: { x: 0, right: 200 } }),
      createNode({ selector: "#item-3", parentSelector: "#list", classList: ["text-center", "p-4"], bounds: { x: 0, right: 200 } })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.some((issue) => issue.type === "alignment")).toBe(true);
  });

  it("flags computed alignment outliers without relying on Tailwind utilities", async () => {
    const analyzer = new AlignmentAnalyzer();
    const context = createContext([
      createNode({ selector: "#card-1", parentSelector: "#cards", classList: ["card"], computed: { textAlign: "left" } }),
      createNode({ selector: "#card-2", parentSelector: "#cards", classList: ["card"], computed: { textAlign: "left" } }),
      createNode({ selector: "#card-3", parentSelector: "#cards", classList: ["card"], computed: { textAlign: "center" } })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.some((issue) => issue.selector === "#card-3" && issue.description.includes("computed text-align"))).toBe(true);
  });

  it("flags obvious accessibility failures", async () => {
    const analyzer = new AccessibilityAnalyzer();
    const context = createContext([
      createNode({ selector: "#hero-image", tagName: "img", parentSelector: "#main", attributes: { alt: undefined } }),
      createNode({ selector: "#cta", tagName: "button", parentSelector: "#main", accessibleName: "", textPreview: "" })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.map((issue) => issue.description)).toContain("Image is missing alternative text.");
    expect(issues.map((issue) => issue.description)).toContain("Interactive control does not expose an accessible name.");
  });

  it("flags page-level overflow", async () => {
    const analyzer = new OverflowAnalyzer();
    const context = createContext([], {
      scrollWidth: 1520,
      clientWidth: 1440,
      scrollHeight: 1024,
      clientHeight: 1024
    });

    const issues = await analyzer.run(context);
    expect(issues[0].type).toBe("overflow");
    expect(issues[0].selector).toBe("body");
  });

  it("flags geometric spacing outliers without Tailwind spacing utilities", async () => {
    const analyzer = new SpacingAnalyzer();
    const context = createContext([
      createNode({ selector: "#item-1", parentSelector: "#stack", classList: ["card"], bounds: { y: 0, height: 64, bottom: 64 } }),
      createNode({ selector: "#item-2", parentSelector: "#stack", classList: ["card"], bounds: { y: 80, height: 64, bottom: 144 } }),
      createNode({ selector: "#item-3", parentSelector: "#stack", classList: ["card"], bounds: { y: 160, height: 64, bottom: 224 } }),
      createNode({ selector: "#item-4", parentSelector: "#stack", classList: ["card"], bounds: { y: 264, height: 64, bottom: 328 } })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.some((issue) => issue.selector === "#item-4" && issue.description.includes("gap before this element"))).toBe(true);
  });

  it("flags low-contrast text", async () => {
    const analyzer = new ReadabilityAnalyzer();
    const context = createContext([
      createNode({
        selector: "#hint",
        parentSelector: "#main",
        textPreview: "Muted helper text",
        computed: {
          color: "rgb(180, 180, 180)",
          backgroundColor: "rgb(255, 255, 255)",
          fontSize: 13
        }
      })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.some((issue) => issue.type === "readability" && issue.description.includes("contrast ratio"))).toBe(true);
  });

  it("flags very small text", async () => {
    const analyzer = new ReadabilityAnalyzer();
    const context = createContext([
      createNode({
        selector: "#fine-print",
        parentSelector: "#main",
        textPreview: "Terms apply",
        computed: {
          fontSize: 10
        }
      })
    ]);

    const issues = await analyzer.run(context);
    expect(issues.some((issue) => issue.type === "readability" && issue.description.includes("too small"))).toBe(true);
  });
});

function createContext(nodes: DomNode[], documentMetrics = { scrollWidth: 1440, clientWidth: 1440, scrollHeight: 1200, clientHeight: 1024 }): AuditContext {
  const artifact: RouteArtifact = {
    route: "/dashboard",
    viewport,
    url: "http://localhost:3000/dashboard",
    screenshotPath: ".betterbrowse/screenshots/test.png",
    consoleMessages: [],
    domSnapshot: {
      url: "http://localhost:3000/dashboard",
      title: "Dashboard",
      viewport,
      document: documentMetrics,
      nodes
    }
  };

  return {
    projectRoot: "C:/demo",
    config: createDefaultConfig({
      framework: "next",
      routes: ["/dashboard"]
    }),
    artifact
  };
}

function createNode(overrides: Partial<DomNode> & { selector: string; parentSelector: string }): DomNode {
  const x = overrides.bounds?.x ?? 0;
  const y = overrides.bounds?.y ?? 0;
  const width = overrides.bounds?.width ?? 200;
  const height = overrides.bounds?.height ?? 80;

  return {
    selector: overrides.selector,
    tagName: overrides.tagName ?? "div",
    role: overrides.role ?? null,
    textPreview: overrides.textPreview ?? "Sample element",
    classList: overrides.classList ?? [],
    attributes: overrides.attributes ?? {},
    bounds: {
      x,
      y,
      width,
      height,
      right: overrides.bounds?.right ?? x + width,
      bottom: overrides.bounds?.bottom ?? y + height
    },
    parentSelector: overrides.parentSelector,
    computed: {
      display: "block",
      position: "static",
      overflowX: "visible",
      overflowY: "visible",
      textAlign: "left",
      justifyContent: "flex-start",
      alignItems: "stretch",
      color: "rgb(17, 24, 39)",
      backgroundColor: "rgb(255, 255, 255)",
      fontSize: 16,
      fontWeight: 400,
      ...overrides.computed
    },
    metrics: {
      scrollWidth: 200,
      clientWidth: 200,
      scrollHeight: 80,
      clientHeight: 80,
      ...overrides.metrics
    },
    visibility: {
      visible: true,
      inViewport: true,
      clipped: false,
      ...overrides.visibility
    },
    accessibleName: overrides.accessibleName ?? "Sample element"
  };
}
