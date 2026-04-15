import type { VerificationResult, Verifier, VerifyInput } from "../types";
import { auditProject } from "../core/audit-runner";

export class RouteVerifier implements Verifier {
  public async verify(input: VerifyInput): Promise<VerificationResult | null> {
    const result = await auditProject({
      projectRoot: input.projectRoot,
      route: input.route,
      viewportName: input.viewportName
    });

    const matchingRoute = result.report.routes.find(
      (routeSummary) => routeSummary.route === input.route && routeSummary.viewport === input.viewportName
    );

    return {
      reportPath: result.reportPath,
      screenshotPath: matchingRoute?.screenshotPath
    };
  }
}
