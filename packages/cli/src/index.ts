#!/usr/bin/env node

import { Command } from "commander";

import {
  auditProject,
  doctorProject,
  fixLatestIssues,
  initProject,
  uninstallProject,
  type AuditRunResult,
  type FixRunResult
} from "@amac84/betterbrowse-core";

const program = new Command();

program
  .name("betterbrowse")
  .description("CLI-native web app auditor for React, Next.js, and static HTML projects.")
  .version("0.1.0");

program
  .command("init")
  .description("Create BetterBrowse config and route files in the current project.")
  .action(async () => {
    const result = await initProject(process.cwd());
    console.log(`Initialized BetterBrowse in ${result.configPath}`);
    console.log(`Detected framework: ${result.framework}`);
    console.log(`Detected routes: ${result.routes.join(", ")}`);
    console.log(`Added npm scripts: ${result.addedScripts.length > 0 ? result.addedScripts.join(", ") : "none"}`);
  });

program
  .command("audit")
  .description("Audit configured routes against the running local app.")
  .option("--route <route>", "Audit a single route")
  .option("--mobile", "Audit only mobile-sized viewports")
  .option("--json", "Print the saved report JSON to stdout")
  .action(async (options: { route?: string; mobile?: boolean; json?: boolean }) => {
    const result = await auditProject({
      projectRoot: process.cwd(),
      route: options.route,
      mobileOnly: Boolean(options.mobile)
    });

    if (options.json) {
      console.log(JSON.stringify(withReportPath(result), null, 2));
      return;
    }

    printAuditSummary(result);
  });

program
  .command("fix")
  .description("Generate a diff-only fix from the latest report.")
  .option("--issue <issueId>", "Fix a specific issue id")
  .option("--apply", "Apply the patch locally before verifying")
  .action(async (options: { issue?: string; apply?: boolean }) => {
    const result = await fixLatestIssues({
      projectRoot: process.cwd(),
      issueId: options.issue,
      apply: Boolean(options.apply)
    });

    printFixSummary(result);
  });

program
  .command("doctor")
  .description("Check BetterBrowse config and local app reachability.")
  .action(async () => {
    const result = await doctorProject(process.cwd());
    if (!result.configFound) {
      console.log('BetterBrowse is not initialized here. Run "betterbrowse init" first.');
      return;
    }

    const configuredBaseUrl = result.configuredBaseUrl ?? result.baseUrl;
    if (result.autoDetectedBaseUrl && configuredBaseUrl && result.baseUrl && configuredBaseUrl !== result.baseUrl) {
      console.log(`Config found. Base URL: ${configuredBaseUrl}`);
      console.log(`Auto-detected running app URL: ${result.baseUrl}`);
    } else {
      console.log(`Config found. Base URL: ${result.baseUrl}`);
    }
    console.log(`Reachable: ${result.reachable ? "yes" : "no"}`);
    console.log(`Configured routes: ${result.routeCount}`);
    console.log(`Configured viewports: ${result.viewportCount}`);
  });

program
  .command("baseline")
  .description("Reserved for report baselining in a future release.")
  .action(() => {
    console.log("Baseline support is not implemented yet. Use the saved JSON reports in .betterbrowse/reports/ for manual comparisons.");
  });

program
  .command("uninstall")
  .description("Remove BetterBrowse project files created by init.")
  .action(async () => {
    const result = await uninstallProject(process.cwd());
    console.log(`Removed paths: ${result.removedPaths.length > 0 ? result.removedPaths.join(", ") : "none"}`);
    console.log(`Removed scripts: ${result.removedScripts.length > 0 ? result.removedScripts.join(", ") : "none"}`);
  });

program.parseAsync(process.argv).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});

function withReportPath(result: AuditRunResult): AuditRunResult & { reportPath: string } {
  return {
    ...result,
    reportPath: result.reportPath
  };
}

function printAuditSummary(result: AuditRunResult): void {
  const issuesBySeverity = result.report.issues.reduce<Record<string, number>>((counts, issue) => {
    counts[issue.severity] = (counts[issue.severity] ?? 0) + 1;
    return counts;
  }, {});

  console.log(`Saved report: ${result.reportPath}`);
  if (result.autoDetectedBaseUrl && result.configuredBaseUrl !== result.baseUrl) {
    console.log(`Auto-detected app URL: ${result.baseUrl} (configured ${result.configuredBaseUrl})`);
  }
  console.log(`Routes audited: ${result.report.routes.length}`);
  console.log(`Issues found: ${result.report.issues.length}`);
  console.log(`High: ${issuesBySeverity.high ?? 0}  Medium: ${issuesBySeverity.medium ?? 0}  Low: ${issuesBySeverity.low ?? 0}`);
  if (result.report.consoleSummary.messages.length > 0) {
    console.log(`Console findings: ${result.report.consoleSummary.messages.length}`);
  }
}

function printFixSummary(result: FixRunResult): void {
  console.log(`Issue: ${result.issue.id}`);
  console.log(result.patch.explanation);
  console.log(`Diff saved to: ${result.patch.diffPath}`);
  if (result.beforeEvidence) {
    console.log(`Before evidence: ${result.beforeEvidence}`);
  }
  if (result.verification?.screenshotPath) {
    console.log(`After evidence: ${result.verification.screenshotPath}`);
    console.log(`Verification report: ${result.verification.reportPath}`);
  }
  console.log(result.patch.diff);
}
