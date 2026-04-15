import path from "path";
import { promises as fs } from "fs";

import { createDefaultConfig, DEFAULT_PACKAGE_SCRIPTS, getBetterBrowsePaths } from "../defaults";
import type { InitProjectResult } from "../types";
import { ensureDir, readJsonFile, toPosixPath, writeJsonFile } from "../utils/fs";
import { detectProject } from "./project-detection";

type PackageJson = {
  scripts?: Record<string, string>;
};

export async function initProject(projectRoot: string): Promise<InitProjectResult> {
  const detection = await detectProject(projectRoot);
  const paths = getBetterBrowsePaths(projectRoot);

  await ensureDir(paths.rootDir);
  await ensureDir(paths.reportsDir);
  await ensureDir(paths.screenshotsDir);

  const routes = detection.routes.length > 0 ? detection.routes : ["/"];
  const routesFileRelative = toPosixPath(path.relative(projectRoot, paths.routesPath));

  const config = createDefaultConfig({
    framework: detection.framework,
    baseUrl: detection.baseUrl,
    routes,
    routesFile: routesFileRelative,
    styleSystem: detection.styleSystem,
    sourceMap: {
      componentRoots: detection.componentRoots
    }
  });

  await writeJsonFile(paths.routesPath, routes);
  await writeJsonFile(paths.configPath, config);

  const addedScripts = await addPackageScripts(projectRoot);
  await writeJsonFile(paths.initMetaPath, {
    version: 1,
    createdAt: new Date().toISOString(),
    addedScripts
  });

  return {
    configPath: paths.configPath,
    routesPath: paths.routesPath,
    framework: detection.framework,
    styleSystem: detection.styleSystem,
    routes,
    addedScripts
  };
}

async function addPackageScripts(projectRoot: string): Promise<string[]> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  try {
    await fs.access(packageJsonPath);
  } catch {
    return [];
  }

  const packageJson = (await readJsonFile<PackageJson>(packageJsonPath)) ?? {};
  const scripts = packageJson.scripts ?? {};
  const addedScripts: string[] = [];

  for (const [name, command] of Object.entries(DEFAULT_PACKAGE_SCRIPTS)) {
    if (!scripts[name]) {
      scripts[name] = command;
      addedScripts.push(name);
    }
  }

  packageJson.scripts = scripts;
  await writeJsonFile(packageJsonPath, packageJson);
  return addedScripts;
}
