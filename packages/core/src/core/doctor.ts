import { loadBetterBrowseConfig } from "../config/load-config";
import { assertBaseUrlReachable } from "./audit-runner";

export interface DoctorResult {
  configFound: boolean;
  baseUrl?: string;
  reachable?: boolean;
  routeCount?: number;
  viewportCount?: number;
}

export async function doctorProject(projectRoot: string): Promise<DoctorResult> {
  try {
    const config = await loadBetterBrowseConfig(projectRoot);
    try {
      await assertBaseUrlReachable(config.baseUrl);
      return {
        configFound: true,
        baseUrl: config.baseUrl,
        reachable: true,
        routeCount: config.routes.length,
        viewportCount: config.viewports.length
      };
    } catch {
      return {
        configFound: true,
        baseUrl: config.baseUrl,
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
