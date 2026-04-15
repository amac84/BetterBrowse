import { promises as fs } from "fs";
import os from "os";
import path from "path";

import { describe, expect, it } from "vitest";

import { HeuristicSourceMapper } from "../src/mapper/heuristic-source-mapper";
import type { AuditIssue, MapperContext, RouteArtifact } from "../src/types";
import { createIssue } from "../src/utils/issues";

describe("issue identity and source mapping", () => {
  it("keeps issue ids stable across volatile numeric/text metadata", () => {
    const base = {
      type: "overflow" as const,
      severity: "medium" as const,
      route: "/dashboard",
      viewport: "mobile",
      selector: "body",
      evidence: {
        screenshot: ".betterbrowse/screenshots/example.png"
      },
      recommendedFix: "Remove fixed width.",
      confidence: 0.9
    };

    const issueA = createIssue({
      ...base,
      description: "The page content is 13 pixels wider than the mobile viewport.",
      metadata: {
        routeSegments: ["dashboard"],
        elementText: "Card Alpha"
      }
    });

    const issueB = createIssue({
      ...base,
      description: "The page content is 29 pixels wider than the mobile viewport.",
      metadata: {
        routeSegments: ["dashboard"],
        elementText: "Card Beta"
      }
    });

    expect(issueA.id).toBe(issueB.id);
  });

  it("includes style system entry points in source mapping candidates", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "betterbrowse-mapper-"));
    const componentsDir = path.join(tempRoot, "src", "components");
    const globalsPath = path.join(tempRoot, "src", "app", "globals.css");
    const buttonPath = path.join(componentsDir, "Button.tsx");

    await fs.mkdir(path.dirname(globalsPath), { recursive: true });
    await fs.mkdir(componentsDir, { recursive: true });
    await fs.writeFile(globalsPath, ".btn { margin: 1rem; }\n", "utf8");
    await fs.writeFile(buttonPath, 'export const Button = () => <button className="btn p-4">Save</button>;\n', "utf8");

    const mapper = new HeuristicSourceMapper();
    const issue: AuditIssue = {
      id: "spacing-test",
      type: "spacing",
      severity: "medium",
      route: "/",
      viewport: "desktop",
      selector: "button",
      description: "Spacing mismatch.",
      evidence: {},
      suspectedSourceFiles: [],
      recommendedFix: "Use p-4.",
      confidence: 0.8,
      metadata: {
        classList: ["btn", "p-6"],
        fixHints: [
          {
            kind: "replace-tailwind-class",
            family: "p",
            from: "p-6",
            to: "p-4"
          }
        ]
      }
    };

    const context: MapperContext = {
      projectRoot: tempRoot,
      config: {
        engine: "playwright",
        framework: "next",
        baseUrl: "http://localhost:3000",
        viewports: [{ name: "desktop", width: 1440, height: 1024 }],
        routes: ["/"],
        writeMode: "diff-only",
        styleSystem: {
          type: "tailwind",
          entryPoints: ["src/app/globals.css"]
        },
        sourceMap: {
          componentRoots: ["src/components"]
        }
      },
      artifact: {
        route: "/",
        viewport: { name: "desktop", width: 1440, height: 1024 },
        url: "http://localhost:3000/",
        screenshotPath: ".betterbrowse/screenshots/example.png",
        consoleMessages: [],
        domSnapshot: {
          url: "http://localhost:3000/",
          title: "Home",
          viewport: { name: "desktop", width: 1440, height: 1024 },
          document: {
            scrollWidth: 1440,
            clientWidth: 1440,
            scrollHeight: 1024,
            clientHeight: 1024
          },
          nodes: []
        }
      } satisfies RouteArtifact
    };

    const files = await mapper.map(issue, context);
    expect(files).toContain("src/app/globals.css");

    await fs.rm(tempRoot, { recursive: true, force: true });
  });
});
