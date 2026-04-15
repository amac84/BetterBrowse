import path from "path";

import { getBetterBrowsePaths } from "../defaults";
import type { BetterBrowseConfig } from "../types";
import { fileExists, readJsonFile, writeJsonFile } from "../utils/fs";
import { betterBrowseConfigSchema } from "./schema";

export async function loadBetterBrowseConfig(projectRoot: string): Promise<BetterBrowseConfig> {
  const paths = getBetterBrowsePaths(projectRoot);
  const rawConfig = await readJsonFile<unknown>(paths.configPath);

  if (!rawConfig) {
    throw new Error(`Could not find BetterBrowse config at ${paths.configPath}. Run "betterbrowse init" first.`);
  }

  const config = betterBrowseConfigSchema.parse(rawConfig);
  const routes = await resolveRoutes(projectRoot, config.routesFile, config.routes);
  return {
    ...config,
    routes
  };
}

export async function saveBetterBrowseConfig(projectRoot: string, config: BetterBrowseConfig): Promise<void> {
  const paths = getBetterBrowsePaths(projectRoot);
  await writeJsonFile(paths.configPath, config);
}

async function resolveRoutes(projectRoot: string, routesFile: string | undefined, fallbackRoutes: string[]): Promise<string[]> {
  const routeFilePath = routesFile ? path.resolve(projectRoot, routesFile) : undefined;

  if (routeFilePath && (await fileExists(routeFilePath))) {
    const routePayload = await readJsonFile<unknown>(routeFilePath);
    if (Array.isArray(routePayload) && routePayload.every((entry) => typeof entry === "string")) {
      return routePayload;
    }
  }

  return fallbackRoutes;
}
