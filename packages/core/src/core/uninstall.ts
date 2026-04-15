import path from "path";

import { DEFAULT_PACKAGE_SCRIPTS, getBetterBrowsePaths } from "../defaults";
import type { UninstallResult } from "../types";
import { fileExists, readJsonFile, removePath, writeJsonFile } from "../utils/fs";

type InitMeta = {
  addedScripts?: string[];
};

type PackageJson = {
  scripts?: Record<string, string>;
};

export async function uninstallProject(projectRoot: string): Promise<UninstallResult> {
  const paths = getBetterBrowsePaths(projectRoot);
  const removedPaths: string[] = [];
  const removedScripts = await removeManagedScripts(projectRoot, paths.initMetaPath);

  if (await fileExists(paths.rootDir)) {
    await removePath(paths.rootDir);
    removedPaths.push(paths.rootDir);
  }

  return {
    removedPaths,
    removedScripts
  };
}

async function removeManagedScripts(projectRoot: string, initMetaPath: string): Promise<string[]> {
  const initMeta = (await readJsonFile<InitMeta>(initMetaPath)) ?? {};
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);

  if (!packageJson?.scripts) {
    return [];
  }

  const removedScripts: string[] = [];
  for (const scriptName of initMeta.addedScripts ?? []) {
    if (packageJson.scripts[scriptName] === DEFAULT_PACKAGE_SCRIPTS[scriptName]) {
      delete packageJson.scripts[scriptName];
      removedScripts.push(scriptName);
    }
  }

  await writeJsonFile(packageJsonPath, packageJson);
  return removedScripts;
}
