import path from "path";

import type { AuditCollector, BrowserEngine, RouteArtifact, ViewportConfig } from "../types";
import { routeToSlug } from "../utils/hash";

export class PlaywrightAuditCollector implements AuditCollector {
  public constructor(
    private readonly engine: BrowserEngine,
    private readonly baseUrl: string,
    private readonly screenshotDir: string
  ) {}

  public async collect(route: string, viewport: ViewportConfig): Promise<RouteArtifact> {
    const normalizedRoute = route.startsWith("/") ? route : `/${route}`;
    const url = new URL(normalizedRoute, this.baseUrl).toString();

    await this.engine.setViewport(viewport);
    await this.engine.goto(url);

    const screenshotPath = path.join(this.screenshotDir, `${routeToSlug(normalizedRoute)}--${viewport.name}.png`);
    await this.engine.screenshot(screenshotPath);

    return {
      route: normalizedRoute,
      viewport,
      url,
      screenshotPath,
      domSnapshot: await this.engine.getDomSnapshot(viewport),
      consoleMessages: await this.engine.getConsoleMessages()
    };
  }
}
