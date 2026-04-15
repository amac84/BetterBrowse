import path from "path";

import { AlignmentAnalyzer } from "../analyzers/alignment-analyzer";
import { AccessibilityAnalyzer } from "../analyzers/accessibility-analyzer";
import { HeadingHierarchyAnalyzer } from "../analyzers/heading-hierarchy-analyzer";
import { OverflowAnalyzer } from "../analyzers/overflow-analyzer";
import { ReadabilityAnalyzer } from "../analyzers/readability-analyzer";
import { SpacingAnalyzer } from "../analyzers/spacing-analyzer";
import { loadBetterBrowseConfig } from "../config/load-config";
import { getBetterBrowsePaths } from "../defaults";
import { PlaywrightBrowserEngine } from "../engine/playwright-engine";
import { HeuristicSourceMapper } from "../mapper/heuristic-source-mapper";
import { summarizeConsole, writeAuditReport } from "../report/report-writer";
import type { Analyzer, AuditIssue, AuditRunOptions, AuditRunResult, RouteSummary, ViewportConfig } from "../types";
import { ensureDir } from "../utils/fs";
import { timestampId } from "../utils/hash";
import { sortIssues } from "../utils/issues";
import { resolveReachableBaseUrl } from "./base-url";
import { PlaywrightAuditCollector } from "./collector";

export async function auditProject(options: AuditRunOptions): Promise<AuditRunResult> {
  const config = await loadBetterBrowseConfig(options.projectRoot);
  const baseUrlResolution = await resolveReachableBaseUrl(options.projectRoot, config.baseUrl);
  const baseUrl = baseUrlResolution.resolvedBaseUrl;

  const paths = getBetterBrowsePaths(options.projectRoot);
  const runId = timestampId();
  const screenshotDir = path.join(paths.screenshotsDir, runId);
  await ensureDir(screenshotDir);

  const routes = resolveRoutes(config.routes, options.route);
  const viewports = resolveViewports(config.viewports, options.mobileOnly, options.viewportName);
  const analyzers: Analyzer[] = [
    new AlignmentAnalyzer(),
    new SpacingAnalyzer(),
    new OverflowAnalyzer(),
    new AccessibilityAnalyzer(),
    new HeadingHierarchyAnalyzer(),
    new ReadabilityAnalyzer()
  ];

  const engine = new PlaywrightBrowserEngine();
  const collector = new PlaywrightAuditCollector(engine, baseUrl, screenshotDir);
  const sourceMapper = new HeuristicSourceMapper();
  const routeSummaries: RouteSummary[] = [];
  const issuesById = new Map<string, AuditIssue>();

  await engine.start({ headless: true });

  try {
    for (const route of routes) {
      for (const viewport of viewports) {
        const artifact = await collector.collect(route, viewport);
        const context = {
          projectRoot: options.projectRoot,
          config,
          artifact
        };

        const routeIssues = (await Promise.all(analyzers.map((analyzer) => analyzer.run(context)))).flat();
        for (const issue of routeIssues) {
          issue.suspectedSourceFiles = await sourceMapper.map(issue, context);
          issuesById.set(issue.id, issue);
        }

        routeSummaries.push({
          route,
          viewport: viewport.name,
          screenshotPath: artifact.screenshotPath,
          consoleMessages: artifact.consoleMessages,
          issueIds: routeIssues.map((issue) => issue.id)
        });
      }
    }
  } finally {
    await engine.stop();
  }

  const report = {
    version: 1 as const,
    generatedAt: new Date().toISOString(),
    projectRoot: options.projectRoot,
    engine: config.engine,
    baseUrl,
    routes: routeSummaries,
    consoleSummary: summarizeConsole(routeSummaries),
    issues: sortIssues([...issuesById.values()])
  };

  const reportPath = await writeAuditReport(paths.reportsDir, paths.latestReportPath, report);
  return {
    report,
    reportPath,
    configuredBaseUrl: baseUrlResolution.configuredBaseUrl,
    baseUrl,
    autoDetectedBaseUrl: baseUrlResolution.autoDetected
  };
}

export async function assertBaseUrlReachable(baseUrl: string): Promise<void> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3_000);

  try {
    await fetch(baseUrl, { signal: controller.signal });
  } catch {
    throw new Error(`BetterBrowse assumes your app is already running. Could not reach ${baseUrl}.`);
  } finally {
    clearTimeout(timeout);
  }
}

function resolveRoutes(configuredRoutes: string[], route?: string): string[] {
  if (!route) {
    return configuredRoutes;
  }

  return [route.startsWith("/") ? route : `/${route}`];
}

function resolveViewports(viewports: ViewportConfig[], mobileOnly = false, viewportName?: string): ViewportConfig[] {
  if (viewportName) {
    const matchingViewports = viewports.filter((viewport) => viewport.name === viewportName);
    if (matchingViewports.length === 0) {
      throw new Error(`Viewport "${viewportName}" was not found in BetterBrowse config.`);
    }

    return matchingViewports;
  }

  if (!mobileOnly) {
    return viewports;
  }

  const mobileViewports = viewports.filter((viewport) => viewport.name.toLowerCase().includes("mobile") || viewport.width <= 480);
  if (mobileViewports.length > 0) {
    return mobileViewports;
  }

  return [viewports.reduce((smallest, viewport) => (viewport.width < smallest.width ? viewport : smallest))];
}
