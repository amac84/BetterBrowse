import path from "path";

import { DEFAULT_COMPONENT_ROOT_CANDIDATES } from "../defaults";
import type { FrameworkType, InitProjectResult, StyleSystemConfig } from "../types";
import { fileExists, readJsonFile, toPosixPath, walkFiles } from "../utils/fs";

type PackageJson = {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
};

export interface ProjectDetectionResult {
  framework: FrameworkType;
  baseUrl: string;
  routes: string[];
  styleSystem: StyleSystemConfig;
  componentRoots: string[];
}

const JS_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js"];

export async function detectProject(projectRoot: string): Promise<ProjectDetectionResult> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = (await readJsonFile<PackageJson>(packageJsonPath)) ?? {};
  const framework = detectFramework(packageJson);
  const styleSystem = await detectStyleSystem(projectRoot, packageJson);
  const routes = await detectRoutes(projectRoot, framework);
  const componentRoots = await detectComponentRoots(projectRoot);

  return {
    framework,
    baseUrl: detectBaseUrl(framework, packageJson),
    routes: routes.length > 0 ? routes : ["/"],
    styleSystem,
    componentRoots: componentRoots.length > 0 ? componentRoots : DEFAULT_COMPONENT_ROOT_CANDIDATES
  };
}

function detectFramework(packageJson: PackageJson): FrameworkType {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  if (dependencies.next) {
    return "next";
  }

  if (dependencies.react) {
    return "react";
  }

  return "unknown";
}

function detectBaseUrl(framework: FrameworkType, packageJson: PackageJson): string {
  const scripts = packageJson.scripts ?? {};
  const scriptValues = Object.values(scripts).join(" ");

  if (framework === "react" && scriptValues.includes("vite")) {
    return "http://localhost:5173";
  }

  return "http://localhost:3000";
}

async function detectStyleSystem(projectRoot: string, packageJson: PackageJson): Promise<StyleSystemConfig> {
  const dependencies = {
    ...packageJson.dependencies,
    ...packageJson.devDependencies
  };

  const entryPointCandidates = [
    "tailwind.config.ts",
    "tailwind.config.js",
    "tailwind.config.mjs",
    "tailwind.config.cjs",
    "src/app/globals.css",
    "app/globals.css",
    "src/index.css",
    "src/styles/globals.css"
  ];

  const entryPoints: string[] = [];
  for (const candidate of entryPointCandidates) {
    if (await fileExists(path.join(projectRoot, candidate))) {
      entryPoints.push(candidate);
    }
  }

  if (dependencies.tailwindcss || entryPoints.some((entryPoint) => entryPoint.startsWith("tailwind.config"))) {
    return {
      type: "tailwind",
      entryPoints
    };
  }

  return {
    type: entryPoints.length > 0 ? "css" : "unknown",
    entryPoints
  };
}

async function detectRoutes(projectRoot: string, framework: FrameworkType): Promise<string[]> {
  if (framework === "next") {
    const appRoutes = await detectNextAppRoutes(projectRoot);
    const pageRoutes = await detectNextPagesRoutes(projectRoot);
    return dedupeRoutes([...appRoutes, ...pageRoutes]);
  }

  const reactEntryCandidates = [
    "src/App.tsx",
    "src/App.jsx",
    "App.tsx",
    "App.jsx"
  ];

  for (const candidate of reactEntryCandidates) {
    if (await fileExists(path.join(projectRoot, candidate))) {
      return ["/"];
    }
  }

  return [];
}

async function detectNextAppRoutes(projectRoot: string): Promise<string[]> {
  const roots = ["src/app", "app"];
  const routes: string[] = [];

  for (const root of roots) {
    const absoluteRoot = path.join(projectRoot, root);
    const files = await walkFiles(absoluteRoot, JS_EXTENSIONS);

    for (const file of files) {
      const basename = path.basename(file);
      if (!/^page\.(tsx|ts|jsx|js)$/.test(basename)) {
        continue;
      }

      const route = appPathToRoute(path.dirname(file), absoluteRoot);
      if (route) {
        routes.push(route);
      }
    }
  }

  return routes;
}

async function detectNextPagesRoutes(projectRoot: string): Promise<string[]> {
  const roots = ["src/pages", "pages"];
  const routes: string[] = [];

  for (const root of roots) {
    const absoluteRoot = path.join(projectRoot, root);
    const files = await walkFiles(absoluteRoot, JS_EXTENSIONS);

    for (const file of files) {
      const relativeFile = toPosixPath(path.relative(absoluteRoot, file));
      if (!relativeFile || relativeFile.startsWith("api/")) {
        continue;
      }

      if (relativeFile.startsWith("_") || relativeFile.includes("[") || relativeFile.includes("]")) {
        continue;
      }

      const withoutExtension = relativeFile.replace(/\.(tsx|ts|jsx|js)$/, "");
      const route = `/${withoutExtension.replace(/\/index$/, "").replace(/^index$/, "")}`.replace(/\/+/g, "/");
      routes.push(route === "/" ? "/" : route.replace(/\/$/, ""));
    }
  }

  return routes;
}

function appPathToRoute(directoryPath: string, appRoot: string): string | null {
  const relativeDirectory = path.relative(appRoot, directoryPath);
  if (!relativeDirectory) {
    return "/";
  }

  const segments = relativeDirectory
    .split(path.sep)
    .filter(Boolean)
    .filter((segment) => !segment.startsWith("(") && !segment.startsWith("@"));

  if (segments.some((segment) => segment.includes("[") || segment === "api")) {
    return null;
  }

  return `/${segments.join("/")}`;
}

async function detectComponentRoots(projectRoot: string): Promise<string[]> {
  const componentRoots: string[] = [];

  for (const candidate of DEFAULT_COMPONENT_ROOT_CANDIDATES) {
    if (await fileExists(path.join(projectRoot, candidate))) {
      componentRoots.push(candidate);
    }
  }

  return componentRoots;
}

function dedupeRoutes(routes: string[]): string[] {
  return [...new Set(routes.map((route) => route || "/"))].sort((left, right) => left.localeCompare(right));
}
