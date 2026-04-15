import type { SafeFixHint } from "../types";

const SPACING_PATTERNS = [
  /^(p[trblxy]?)-(.+)$/,
  /^(m[trblxy]?)-(.+)$/,
  /^(gap[xy]?)-(.+)$/,
  /^(space-[xy])-([^-].+)$/
];

const ALIGNMENT_PATTERNS = [
  /^(items)-(.+)$/,
  /^(justify)-(.+)$/,
  /^(self)-(.+)$/,
  /^(content)-(.+)$/,
  /^(text)-(left|center|right|justify)$/
];

export interface TailwindUtility {
  family: string;
  raw: string;
  value: string;
}

function parseWithPatterns(tokens: string[], patterns: RegExp[]): TailwindUtility[] {
  const output: TailwindUtility[] = [];

  for (const token of tokens) {
    for (const pattern of patterns) {
      const match = token.match(pattern);
      if (!match) {
        continue;
      }

      const [, family, value] = match;
      if (!family || !value) {
        continue;
      }

      output.push({ family, raw: token, value });
      break;
    }
  }

  return output;
}

export function extractSpacingUtilities(tokens: string[]): TailwindUtility[] {
  return parseWithPatterns(tokens, SPACING_PATTERNS);
}

export function extractAlignmentUtilities(tokens: string[]): TailwindUtility[] {
  return parseWithPatterns(tokens, ALIGNMENT_PATTERNS);
}

export function replaceTailwindToken(classValue: string, from: string, to: string): string | null {
  const pattern = new RegExp(`(^|\\s)${escapeForRegex(from)}(?=\\s|$)`);
  if (!pattern.test(classValue)) {
    return null;
  }

  return classValue.replace(pattern, `$1${to}`);
}

export function createReplacementFixHint(family: string, from: string, to: string, selector?: string): SafeFixHint {
  return {
    kind: "replace-tailwind-class",
    family,
    from,
    to,
    selector
  };
}

function escapeForRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
