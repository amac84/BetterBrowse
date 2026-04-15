import path from "path";

import { readJsonFile } from "../utils/fs";

type PackageJson = {
  scripts?: Record<string, string>;
};

type FetchLike = (input: string, init?: { signal?: AbortSignal }) => Promise<unknown>;

export interface ResolveBaseUrlResult {
  configuredBaseUrl: string;
  resolvedBaseUrl: string;
  autoDetected: boolean;
  attemptedBaseUrls: string[];
}

interface ResolveBaseUrlOptions {
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 1_200;
const COMMON_DEV_PORTS = [5173, 3000, 4173, 4321, 8080, 8000, 4200];
const CLI_PORT_PATTERN = /(?:--port|-p)\s*(?:=|\s)\s*(\d{2,5})/gi;
const ENV_PORT_PATTERN = /\bPORT\s*=\s*(\d{2,5})\b/gi;

export async function resolveReachableBaseUrl(
  projectRoot: string,
  configuredBaseUrl: string,
  options: ResolveBaseUrlOptions = {}
): Promise<ResolveBaseUrlResult> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const configured = normalizeBaseUrl(configuredBaseUrl);
  const fallbackCandidates = await buildFallbackCandidates(projectRoot, configured);
  const attemptedBaseUrls: string[] = [configured];

  if (await canReachBaseUrl(configured, fetchImpl, timeoutMs)) {
    return {
      configuredBaseUrl: configured,
      resolvedBaseUrl: configured,
      autoDetected: false,
      attemptedBaseUrls
    };
  }

  const fallbackChecks = await Promise.all(
    fallbackCandidates.map(async (candidate) => ({
      candidate,
      reachable: await canReachBaseUrl(candidate, fetchImpl, timeoutMs)
    }))
  );

  for (const check of fallbackChecks) {
    attemptedBaseUrls.push(check.candidate);
    if (!check.reachable) {
      continue;
    }

    return {
      configuredBaseUrl: configured,
      resolvedBaseUrl: check.candidate,
      autoDetected: check.candidate !== configured,
      attemptedBaseUrls
    };
  }

  const attemptedFallbackSummary = fallbackCandidates.slice(0, 6).join(", ");
  throw new Error(
    `BetterBrowse assumes your app is already running. Could not reach ${configured}. Tried auto-detected local URLs: ${attemptedFallbackSummary}.`
  );
}

async function buildFallbackCandidates(projectRoot: string, configuredBaseUrl: string): Promise<string[]> {
  const configuredUrl = new URL(configuredBaseUrl);
  const configuredPort = parsePort(configuredUrl.port);
  const inferredPorts = await inferProjectPorts(projectRoot);
  const hostOptions = [configuredUrl.hostname, ...hostAlternatives(configuredUrl.hostname)];
  const protocolOptions = [configuredUrl.protocol, alternateProtocol(configuredUrl.protocol)];
  const candidates: string[] = [];
  const seen = new Set<string>();

  const addCandidate = (protocol: string, hostname: string, port?: number) => {
    const candidateUrl = new URL(configuredBaseUrl);
    candidateUrl.protocol = protocol;
    candidateUrl.hostname = hostname;
    if (typeof port === "number") {
      candidateUrl.port = String(port);
    }

    const candidate = normalizeBaseUrl(candidateUrl.toString());
    if (candidate === configuredBaseUrl || seen.has(candidate)) {
      return;
    }

    seen.add(candidate);
    candidates.push(candidate);
  };

  for (const protocol of protocolOptions) {
    if (configuredPort) {
      for (const hostname of hostOptions) {
        addCandidate(protocol, hostname, configuredPort);
      }
    }

    for (const port of inferredPorts) {
      for (const hostname of hostOptions) {
        addCandidate(protocol, hostname, port);
      }
    }

    for (const port of COMMON_DEV_PORTS) {
      for (const hostname of hostOptions) {
        addCandidate(protocol, hostname, port);
      }
    }
  }

  return candidates;
}

async function inferProjectPorts(projectRoot: string): Promise<number[]> {
  const packageJsonPath = path.join(projectRoot, "package.json");
  const packageJson = await readJsonFile<PackageJson>(packageJsonPath);
  const scripts = Object.values(packageJson?.scripts ?? {});
  const inferredPorts = new Set<number>();

  for (const script of scripts) {
    if (/\bvite\b/i.test(script)) {
      inferredPorts.add(5173);
    }

    if (/\bnext\b/i.test(script)) {
      inferredPorts.add(3000);
    }

    if (/\breact-scripts\b/i.test(script)) {
      inferredPorts.add(3000);
    }

    if (/\bastro\b/i.test(script)) {
      inferredPorts.add(4321);
    }

    for (const match of script.matchAll(CLI_PORT_PATTERN)) {
      const port = parsePort(match[1]);
      if (port) {
        inferredPorts.add(port);
      }
    }

    for (const match of script.matchAll(ENV_PORT_PATTERN)) {
      const port = parsePort(match[1]);
      if (port) {
        inferredPorts.add(port);
      }
    }
  }

  return [...inferredPorts];
}

async function canReachBaseUrl(baseUrl: string, fetchImpl: FetchLike, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    await fetchImpl(baseUrl, { signal: controller.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.pathname === "/" && !url.search && !url.hash) {
    url.pathname = "";
  }

  return url.toString();
}

function hostAlternatives(hostname: string): string[] {
  if (hostname === "localhost") {
    return ["127.0.0.1"];
  }

  if (hostname === "127.0.0.1") {
    return ["localhost"];
  }

  return [];
}

function alternateProtocol(protocol: string): string {
  return protocol === "https:" ? "http:" : "https:";
}

function parsePort(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

const defaultFetch: FetchLike = (input, init) => fetch(input, init);
