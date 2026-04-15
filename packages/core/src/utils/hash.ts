import { createHash } from "crypto";

export function stableHash(value: string): string {
  return createHash("sha1").update(value).digest("hex");
}

export function timestampId(date = new Date()): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export function routeToSlug(route: string): string {
  const normalized = route.replace(/^\/+|\/+$/g, "");
  if (!normalized) {
    return "root";
  }

  return normalized.replace(/[^a-zA-Z0-9]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "route";
}

export function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

export function tokenizeText(value?: string): string[] {
  if (!value) {
    return [];
  }

  return uniqueStrings(
    value
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .map((token) => token.trim())
      .filter((token) => token.length >= 3)
  );
}
