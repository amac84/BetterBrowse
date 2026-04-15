import { getBetterBrowsePaths } from "../defaults";
import { loadBetterBrowseConfig } from "../config/load-config";
import { TailwindClassPatcher } from "../patcher/tailwind-class-patcher";
import { RouteVerifier } from "../verifier/route-verifier";
import type { AuditIssue, AuditReport, FixRunOptions, FixRunResult } from "../types";
import { readJsonFile } from "../utils/fs";
import { isFixableIssue } from "../utils/issues";

export async function fixLatestIssues(options: FixRunOptions): Promise<FixRunResult> {
  const paths = getBetterBrowsePaths(options.projectRoot);
  const report = await readJsonFile<AuditReport>(paths.latestReportPath);

  if (!report) {
    throw new Error(`Could not find a latest BetterBrowse report at ${paths.latestReportPath}. Run "betterbrowse audit" first.`);
  }

  await loadBetterBrowseConfig(options.projectRoot);
  const issue = selectIssue(report.issues, options.issueId);
  const patcher = new TailwindClassPatcher();
  const patch = await patcher.generatePatch({
    projectRoot: options.projectRoot,
    issue,
    outputDir: paths.patchesDir,
    apply: Boolean(options.apply)
  });

  let verification = null;
  try {
    const verifier = new RouteVerifier();
    verification = await verifier.verify({
      projectRoot: options.projectRoot,
      route: issue.route,
      viewportName: issue.viewport
    });
  } catch {
    verification = null;
  }

  return {
    issue,
    patch,
    beforeEvidence: issue.evidence.screenshot,
    verification
  };
}

function selectIssue(issues: AuditIssue[], issueId?: string): AuditIssue {
  if (issueId) {
    const issue = issues.find((candidate) => candidate.id === issueId);
    if (!issue) {
      throw new Error(`Could not find issue ${issueId} in the latest report.`);
    }

    if (!isFixableIssue(issue)) {
      throw new Error(`Issue ${issueId} is not safely fixable in diff-only mode.`);
    }

    return issue;
  }

  const fixableIssue = issues.find((candidate) => isFixableIssue(candidate) && candidate.confidence >= 0.75);
  if (!fixableIssue) {
    throw new Error("No high-confidence fixable issue was found in the latest report.");
  }

  return fixableIssue;
}
