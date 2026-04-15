import { loadBetterBrowseConfig } from "../config/load-config";
import type { DoctorResult } from "../types";
import { resolveReachableBaseUrl } from "./base-url";

export async function doctorProject(projectRoot: string): Promise<DoctorResult> {
  try {
    const config = await loadBetterBrowseConfig(projectRoot);
    try {
      const baseUrlResolution = await resolveReachableBaseUrl(projectRoot, config.baseUrl);
      return {
        configFound: true,
        baseUrl: baseUrlResolution.resolvedBaseUrl,
        configuredBaseUrl: baseUrlResolution.configuredBaseUrl,
        autoDetectedBaseUrl: baseUrlResolution.autoDetected,
        reachable: true,
        routeCount: config.routes.length,
        viewportCount: config.viewports.length
      };
    } catch {
      return {
        configFound: true,
        baseUrl: config.baseUrl,
        configuredBaseUrl: config.baseUrl,
        autoDetectedBaseUrl: false,
        reachable: false,
        routeCount: config.routes.length,
        viewportCount: config.viewports.length
      };
    }
  } catch {
    return {
      configFound: false
    };
  }
}
