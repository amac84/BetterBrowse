import path from "path";

import { createTwoFilesPatch } from "diff";
import { Node, Project, SyntaxKind } from "ts-morph";

import type { PatchInput, PatchResult, SafeFixHint } from "../types";
import { ensureDir, fileExists, toProjectRelative, writeTextFile } from "../utils/fs";
import { timestampId } from "../utils/hash";
import { replaceTailwindToken } from "../utils/tailwind";

type PatchCandidate = {
  start: number;
  end: number;
  replacement: string;
  score: number;
};

export class TailwindClassPatcher {
  public async generatePatch(input: PatchInput): Promise<PatchResult> {
    const fixHint = input.issue.metadata?.fixHints?.find((candidate) => candidate.kind === "replace-tailwind-class");
    if (!fixHint) {
      throw new Error(`Issue ${input.issue.id} does not have a safe diff-only fix hint.`);
    }

    const candidateFiles = input.issue.suspectedSourceFiles
      .map((relativePath) => path.resolve(input.projectRoot, relativePath))
      .filter(Boolean);

    for (const file of candidateFiles) {
      if (!(await fileExists(file))) {
        continue;
      }

      const patch = await this.tryPatchFile(file, input.issue.metadata?.classList ?? [], fixHint, input.projectRoot, input.outputDir, input.apply);
      if (patch) {
        return {
          ...patch,
          issueId: input.issue.id
        };
      }
    }

    throw new Error(`Could not generate a patch for ${input.issue.id}. No candidate file contained a safe static className match.`);
  }

  private async tryPatchFile(
    filePath: string,
    classHints: string[],
    fixHint: SafeFixHint,
    projectRoot: string,
    outputDir: string,
    apply: boolean
  ): Promise<Omit<PatchResult, "issueId"> | null> {
    const project = new Project({
      useInMemoryFileSystem: false,
      skipAddingFilesFromTsConfig: true
    });
    const sourceFile = project.addSourceFileAtPath(filePath);
    const originalText = sourceFile.getFullText();
    const candidates: PatchCandidate[] = [];

    for (const attribute of sourceFile.getDescendantsOfKind(SyntaxKind.JsxAttribute)) {
      const name = attribute.getNameNode().getText();
      if (name !== "className" && name !== "class") {
        continue;
      }

      const literal = extractLiteral(attribute.getInitializer());
      if (!literal) {
        continue;
      }

      const nextValue = replaceTailwindToken(literal.value, fixHint.from, fixHint.to);
      if (!nextValue || nextValue === literal.value) {
        continue;
      }

      const score = classHints.reduce((total, hint) => total + (literal.value.includes(hint) ? 1 : 0), 0);
      candidates.push({
        start: literal.start,
        end: literal.end,
        replacement: wrapLiteral(nextValue, literal.wrapper),
        score
      });
    }

    if (candidates.length === 0) {
      return null;
    }

    const best = candidates.sort((left, right) => right.score - left.score || left.start - right.start)[0];
    if (!best) {
      return null;
    }

    const nextText = `${originalText.slice(0, best.start)}${best.replacement}${originalText.slice(best.end)}`;
    const relativePath = toProjectRelative(projectRoot, filePath);
    const diff = createTwoFilesPatch(relativePath, relativePath, originalText, nextText, "before", apply ? "after" : "preview");
    const diffPath = path.join(outputDir, `${timestampId()}-${path.basename(filePath)}.diff`);

    await ensureDir(outputDir);
    await writeTextFile(diffPath, diff);

    if (apply) {
      await writeTextFile(filePath, nextText);
    }

    return {
      applied: apply,
      diff,
      diffPath,
      explanation: `Normalized ${fixHint.from} to ${fixHint.to} in ${relativePath}.`,
      touchedFiles: [relativePath]
    };
  }
}

function extractLiteral(initializer: Node | undefined): { value: string; start: number; end: number; wrapper: '"' | "'" | "`" } | null {
  if (!initializer) {
    return null;
  }

  if (Node.isStringLiteral(initializer)) {
    return {
      value: initializer.getLiteralValue(),
      start: initializer.getStart(),
      end: initializer.getEnd(),
      wrapper: '"'
    };
  }

  if (!Node.isJsxExpression(initializer)) {
    return null;
  }

  const expression = initializer.getExpression();
  if (!expression) {
    return null;
  }

  if (Node.isStringLiteral(expression)) {
    const wrapper = expression.getText().startsWith("'") ? "'" : '"';
    return {
      value: expression.getLiteralValue(),
      start: expression.getStart(),
      end: expression.getEnd(),
      wrapper
    };
  }

  if (Node.isNoSubstitutionTemplateLiteral(expression)) {
    return {
      value: expression.getLiteralText(),
      start: expression.getStart(),
      end: expression.getEnd(),
      wrapper: "`"
    };
  }

  return null;
}

function wrapLiteral(value: string, wrapper: '"' | "'" | "`"): string {
  return `${wrapper}${value}${wrapper}`;
}
