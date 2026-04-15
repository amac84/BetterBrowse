import { promises as fs } from "fs";
import type { Dirent } from "fs";
import path from "path";

import { DEFAULT_COMPONENT_ROOT_CANDIDATES } from "../defaults";
import type { FrameworkType, StyleSystemConfig } from "../types";
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
const HTML_EXTENSIONS = [".html", ".htm"];
const HTML_ROUTE_IGNORED_DIRECTORIES = new Set([
  ".git",
  ".next",
  ".betterbrowse",
  "node_modules",
  "dist",
  "build",
  "out",
  "coverage"
]);
const NON_HTML_FRAMEWORK_DEPENDENCIES = [
  "vue",
  "svelte",
  "@angular/core",
  "solid-js",
  "preact",
  "astro",
  "nuxt",
  "gatsby",
  "@remix-run/react",
  "@builder.io/qwik"
];

export async function detectProject(projectRoot: string): Promise<ProjectDetectionResult> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = (await readJsonFile<PackageJson>(packageJsonPath)) ?? {};
  const htmlRoutes = await detectHtmlRoutes(projectRoot);
  const framework = detectFramework(packageJson, htmlRoutes.length > 0);
  const styleSystem = await detectStyleSystem(projectRoot, packageJson);
  const routes = await detectRoutes(projectRoot, framework, htmlRoutes);
  const componentRoots = await detectComponentRoots(projectRoot);

  return {
    framework,
    baseUrl: detectBaseUrl(framework, packageJson),
    routes: routes.length > 0 ? routes : ["/"],
    styleSystem,
    componentRoots: componentRoots.length > 0 ? componentRoots : DEFAULT_COMPONENT_ROOT_CANDIDATES
  };
}

function detectFramework(packageJson: PackageJson, hasStaticHtmlRoutes: boolean): FrameworkType {
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

  if (!hasKnownFrameworkDependency(dependencies) && hasStaticHtmlRoutes) {
    return "html";
  }

  return "unknown";
}

function detectBaseUrl(framework: FrameworkType, packageJson: PackageJson): string {
  const scripts = packageJson.scripts ?? {};
  const scriptValues = Object.values(scripts).join(" ").toLowerCase();

  if ((framework === "react" || framework === "html") && scriptValues.includes("vite")) {
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
    "index.css",
    "styles.css",
    "style.css",
    "src/index.css",
    "src/styles/globals.css",
    "public/styles.css",
    "public/style.css"
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

async function detectRoutes(projectRoot: string, framework: FrameworkType, htmlRoutes: string[]): Promise<string[]> {
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

  if (htmlRoutes.length > 0) {
    return htmlRoutes;
  }

  return [];
}

async function detectHtmlRoutes(projectRoot: string): Promise<string[]> {
  const htmlFiles = await walkHtmlFiles(projectRoot);
  const routes = htmlFiles
    .map((filePath) => htmlFileToRoute(projectRoot, filePath))
    .filter((route): route is string => Boolean(route));
  return dedupeRoutes(routes);
}

async function walkHtmlFiles(directoryPath: string): Promise<string[]> {
  let entries: Dirent[];
  try {
    entries = await fs.readdir(directoryPath, { withFileTypes: true });
  } catch {
    return [];
  }

  const files: string[] = [];
  for (const entry of entries) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      if (HTML_ROUTE_IGNORED_DIRECTORIES.has(entry.name)) {
        continue;
      }

      files.push(...(await walkHtmlFiles(absolutePath)));
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    if (HTML_EXTENSIONS.includes(path.extname(entry.name).toLowerCase())) {
      files.push(absolutePath);
    }
  }

  return files;
}

function htmlFileToRoute(projectRoot: string, filePath: string): string | null {
  const relativeFilePath = toPosixPath(path.relative(projectRoot, filePath));
  if (!relativeFilePath || relativeFilePath.startsWith("..")) {
    return null;
  }

  const withoutExtension = relativeFilePath.replace(/\.(html|htm)$/i, "");
  const route = `/${withoutExtension.replace(/\/index$/i, "").replace(/^index$/i, "")}`.replace(/\/+/g, "/");
  return route === "/" ? "/" : route.replace(/\/$/, "");
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

function hasKnownFrameworkDependency(dependencies: Record<string, string>): boolean {
  return NON_HTML_FRAMEWORK_DEPENDENCIES.some((dependency) => Boolean(dependencies[dependency]));
}

function dedupeRoutes(routes: string[]): string[] {
  return [...new Set(routes.map((route) => route || "/"))].sort((left, right) => left.localeCompare(right));
}
