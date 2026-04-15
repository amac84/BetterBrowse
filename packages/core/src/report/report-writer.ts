import path from "path";

import type { AuditReport, BrowserLog, ConsoleSummary, RouteSummary } from "../types";
import { ensureDir, writeJsonFile } from "../utils/fs";
import { timestampId } from "../utils/hash";

export async function writeAuditReport(reportsDir: string, latestReportPath: string, report: AuditReport): Promise<string> {
  await ensureDir(reportsDir);
  const reportPath = path.join(reportsDir, `report-${timestampId()}.json`);
  await writeJsonFile(reportPath, report);
  await writeJsonFile(latestReportPath, report);
  return reportPath;
}

export function summarizeConsole(routes: RouteSummary[]): ConsoleSummary {
  const messages = dedupeMessages(routes.flatMap((route) => route.consoleMessages));
  return {
    errorCount: messages.filter((message) => message.level === "error").length,
    warningCount: messages.filter((message) => message.level === "warning").length,
    pageErrorCount: messages.filter((message) => message.level === "pageerror").length,
    messages
  };
}

function dedupeMessages(messages: BrowserLog[]): BrowserLog[] {
  const seen = new Set<string>();
  const output: BrowserLog[] = [];

  for (const message of messages) {
    const key = `${message.level}:${message.location ?? ""}:${message.text}`;
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    output.push(message);
  }

  return output;
}
