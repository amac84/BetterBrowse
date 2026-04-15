---
name: betterbrowse-audit
description: Use BetterBrowse to audit local React or Next.js UI changes, especially after frontend work, when users report layout or accessibility problems, or before declaring UI polish complete.
---

# BetterBrowse Audit

Run `betterbrowse audit --json` after meaningful UI changes and read the newest report before proposing frontend work as complete.

## Workflow

1. Run `betterbrowse audit --json` from the target project.
2. Read the generated report and focus on high-confidence findings first.
3. If a finding has a clear source candidate and a safe, minimal fix, apply that fix.
4. Rerun BetterBrowse on the affected route and compare the new report with the previous evidence.
5. Summarize what improved, what remains, and any issues that still need human judgment.

## Guardrails

- Do not use BetterBrowse for backend-only changes.
- Do not batch-apply multiple low-confidence fixes.
- Do not treat subjective style preferences as bugs unless the report shows a concrete consistency or accessibility issue.
