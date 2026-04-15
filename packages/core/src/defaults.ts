import path from "path";

import type { BetterBrowseConfig, BetterBrowsePaths, ViewportConfig } from "./types";

export const BETTERBROWSE_DIR = ".betterbrowse";
export const CONFIG_FILE_NAME = "config.json";
export const ROUTES_FILE_NAME = "routes.json";
export const INIT_META_FILE_NAME = "init.json";
export const REPORTS_DIR_NAME = "reports";
export const SCREENSHOTS_DIR_NAME = "screenshots";
export const PATCHES_DIR_NAME = "patches";

export const DEFAULT_VIEWPORTS: ViewportConfig[] = [
  { name: "desktop", width: 1440, height: 1024 },
  { name: "mobile", width: 390, height: 844 }
];

export const DEFAULT_COMPONENT_ROOT_CANDIDATES = [
  "src/components",
  "src/app",
  "src/features",
  "src/pages",
  "app",
  "components",
  "features",
  "pages"
];

export const DEFAULT_PACKAGE_SCRIPTS: Record<string, string> = {
  "betterbrowse:audit": "betterbrowse audit",
  "betterbrowse:fix": "betterbrowse fix",
  "betterbrowse:doctor": "betterbrowse doctor",
  "betterbrowse:uninstall": "betterbrowse uninstall"
};

export function createDefaultConfig(overrides: Partial<BetterBrowseConfig> = {}): BetterBrowseConfig {
  return {
    engine: "playwright",
    framework: "unknown",
    baseUrl: "http://localhost:3000",
    viewports: DEFAULT_VIEWPORTS,
    routes: ["/"],
    routesFile: `${BETTERBROWSE_DIR}/${ROUTES_FILE_NAME}`,
    writeMode: "diff-only",
    styleSystem: {
      type: "unknown",
      entryPoints: []
    },
    sourceMap: {
      componentRoots: DEFAULT_COMPONENT_ROOT_CANDIDATES
    },
    ...overrides
  };
}

export function getBetterBrowsePaths(projectRoot: string): BetterBrowsePaths {
  const rootDir = path.join(projectRoot, BETTERBROWSE_DIR);
  const reportsDir = path.join(rootDir, REPORTS_DIR_NAME);
  return {
    rootDir,
    configPath: path.join(rootDir, CONFIG_FILE_NAME),
    routesPath: path.join(rootDir, ROUTES_FILE_NAME),
    initMetaPath: path.join(rootDir, INIT_META_FILE_NAME),
    reportsDir,
    screenshotsDir: path.join(rootDir, SCREENSHOTS_DIR_NAME),
    patchesDir: path.join(reportsDir, PATCHES_DIR_NAME),
    latestReportPath: path.join(reportsDir, "latest.json")
  };
}
