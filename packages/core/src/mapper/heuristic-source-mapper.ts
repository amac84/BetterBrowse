import { promises as fs } from "fs";
import path from "path";

import type { AuditIssue, MapperContext, SourceMapper } from "../types";
import { fileExists, toProjectRelative, walkFiles } from "../utils/fs";
import { tokenizeText } from "../utils/hash";

const SOURCE_EXTENSIONS = [".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".css", ".json"];
const SHARED_COMPONENT_HINTS = ["button", "card", "modal", "input", "form", "header", "footer", "nav"];

export class HeuristicSourceMapper implements SourceMapper {
  private cache = new Map<string, string[]>();

  public async map(issue: AuditIssue, context: MapperContext): Promise<string[]> {
    const files = await this.getSourceFiles(context);
    const routeHints = (issue.metadata?.routeSegments ?? []).map((segment) => segment.toLowerCase());
    const textHints = [
      ...(issue.metadata?.matchingTextTokens ?? []),
      ...tokenizeText(issue.metadata?.elementText),
      ...tokenizeText(issue.metadata?.accessibleName)
    ].slice(0, 12);
    const classHints = (issue.metadata?.classList ?? []).slice(0, 12);
    const fixHints = issue.metadata?.fixHints?.flatMap((hint) => [hint.from, hint.to]) ?? [];
    const scored: Array<{ file: string; score: number }> = [];

    for (const file of files) {
      const contents = await fs.readFile(file, "utf8");
      let score = 0;
      const lowerPath = toProjectRelative(context.projectRoot, file).toLowerCase();
      const lowerContents = contents.toLowerCase();

      for (const routeHint of routeHints) {
        if (routeHint && lowerPath.includes(routeHint)) {
          score += 8;
        }
      }

      for (const hint of textHints) {
        if (hint && lowerContents.includes(hint)) {
          score += 4;
        }
      }

      for (const classHint of classHints) {
        if (classHint && lowerContents.includes(classHint.toLowerCase())) {
          score += 3;
        }
      }

      for (const fixHint of fixHints) {
        if (fixHint && lowerContents.includes(fixHint.toLowerCase())) {
          score += 5;
        }
      }

      for (const componentHint of SHARED_COMPONENT_HINTS) {
        if (lowerPath.includes(componentHint)) {
          score += 1;
        }
      }

      if (score > 0) {
        scored.push({ file, score });
      }
    }

    if (scored.length === 0) {
      return files.slice(0, 3).map((file) => toProjectRelative(context.projectRoot, file));
    }

    return scored
      .sort((left, right) => right.score - left.score || left.file.localeCompare(right.file))
      .slice(0, 5)
      .map((entry) => toProjectRelative(context.projectRoot, entry.file));
  }

  private async getSourceFiles(context: MapperContext): Promise<string[]> {
    const cacheKey = context.projectRoot;
    const cached = this.cache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const files = new Set<string>();
    for (const root of context.config.sourceMap.componentRoots) {
      const absoluteRoot = path.join(context.projectRoot, root);
      if (!(await fileExists(absoluteRoot))) {
        continue;
      }

      for (const file of await walkFiles(absoluteRoot, SOURCE_EXTENSIONS)) {
        files.add(file);
      }
    }

    for (const entryPoint of context.config.styleSystem.entryPoints) {
      const absoluteEntryPoint = path.resolve(context.projectRoot, entryPoint);
      if (!(await fileExists(absoluteEntryPoint))) {
        continue;
      }

      const stats = await fs.stat(absoluteEntryPoint);
      if (stats.isDirectory()) {
        for (const file of await walkFiles(absoluteEntryPoint, SOURCE_EXTENSIONS)) {
          files.add(file);
        }
        continue;
      }

      files.add(absoluteEntryPoint);
    }

    const discoveredFiles = [...files];
    this.cache.set(cacheKey, discoveredFiles);
    return discoveredFiles;
  }
}
