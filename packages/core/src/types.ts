export type EngineName = "playwright";
export type FrameworkType = "next" | "react" | "unknown";
export type StyleSystemType = "tailwind" | "css" | "unknown";
export type WriteMode = "diff-only" | "apply";
export type AuditIssueType = "alignment" | "spacing" | "overflow" | "accessibility" | "readability" | "hierarchy";
export type Severity = "low" | "medium" | "high";
export type BrowserLogLevel = "log" | "warning" | "error" | "pageerror";

export interface ViewportConfig {
  name: string;
  width: number;
  height: number;
}

export interface StyleSystemConfig {
  type: StyleSystemType;
  entryPoints: string[];
}

export interface SourceMapConfig {
  componentRoots: string[];
}

export interface BetterBrowseConfig {
  engine: EngineName;
  framework: FrameworkType;
  baseUrl: string;
  viewports: ViewportConfig[];
  routes: string[];
  routesFile?: string;
  writeMode: WriteMode;
  styleSystem: StyleSystemConfig;
  sourceMap: SourceMapConfig;
}

export interface BetterBrowsePaths {
  rootDir: string;
  configPath: string;
  routesPath: string;
  initMetaPath: string;
  reportsDir: string;
  screenshotsDir: string;
  patchesDir: string;
  latestReportPath: string;
}

export interface BrowserLog {
  level: BrowserLogLevel;
  text: string;
  location?: string;
}

export interface DomBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  right: number;
  bottom: number;
}

export interface DomNode {
  selector: string;
  tagName: string;
  role: string | null;
  textPreview: string;
  classList: string[];
  attributes: Record<string, string | undefined>;
  bounds: DomBounds;
  parentSelector?: string;
  computed: {
    display: string;
    position: string;
    overflowX: string;
    overflowY: string;
    textAlign: string;
    justifyContent: string;
    alignItems: string;
    color: string;
    backgroundColor: string;
    fontSize: number;
    fontWeight: number;
  };
  metrics: {
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
  };
  visibility: {
    visible: boolean;
    inViewport: boolean;
    clipped: boolean;
  };
  accessibleName?: string;
}

export interface DomSnapshot {
  url: string;
  title: string;
  viewport: ViewportConfig;
  document: {
    scrollWidth: number;
    clientWidth: number;
    scrollHeight: number;
    clientHeight: number;
  };
  nodes: DomNode[];
}

export interface EngineConfig {
  headless?: boolean;
}

export interface RouteArtifact {
  route: string;
  viewport: ViewportConfig;
  url: string;
  screenshotPath: string;
  domSnapshot: DomSnapshot;
  consoleMessages: BrowserLog[];
}

export interface AuditContext {
  projectRoot: string;
  config: BetterBrowseConfig;
  artifact: RouteArtifact;
}

export interface SafeFixHint {
  kind: "replace-tailwind-class";
  family: string;
  from: string;
  to: string;
  selector?: string;
}

export interface IssueMetadata {
  tagName?: string;
  classList?: string[];
  elementText?: string;
  accessibleName?: string;
  routeSegments?: string[];
  matchingTextTokens?: string[];
  fixHints?: SafeFixHint[];
}

export interface AuditIssue {
  id: string;
  type: AuditIssueType;
  severity: Severity;
  route: string;
  viewport: string;
  selector?: string;
  description: string;
  evidence: {
    screenshot?: string;
  };
  suspectedSourceFiles: string[];
  recommendedFix: string;
  confidence: number;
  metadata?: IssueMetadata;
}

export interface RouteSummary {
  route: string;
  viewport: string;
  screenshotPath: string;
  consoleMessages: BrowserLog[];
  issueIds: string[];
}

export interface ConsoleSummary {
  errorCount: number;
  warningCount: number;
  pageErrorCount: number;
  messages: BrowserLog[];
}

export interface AuditReport {
  version: 1;
  generatedAt: string;
  projectRoot: string;
  engine: EngineName;
  baseUrl: string;
  routes: RouteSummary[];
  consoleSummary: ConsoleSummary;
  issues: AuditIssue[];
}

export interface BrowserEngine {
  start(config?: EngineConfig): Promise<void>;
  setViewport(viewport: ViewportConfig): Promise<void>;
  goto(url: string): Promise<void>;
  screenshot(outputPath: string): Promise<string>;
  getDomSnapshot(viewport: ViewportConfig): Promise<DomSnapshot>;
  getConsoleMessages(): Promise<BrowserLog[]>;
  stop(): Promise<void>;
}

export interface AuditCollector {
  collect(route: string, viewport: ViewportConfig): Promise<RouteArtifact>;
}

export interface Analyzer {
  name: string;
  run(context: AuditContext): Promise<AuditIssue[]>;
}

export interface MapperContext {
  projectRoot: string;
  config: BetterBrowseConfig;
  artifact: RouteArtifact;
}

export interface SourceMapper {
  map(issue: AuditIssue, context: MapperContext): Promise<string[]>;
}

export interface PatchInput {
  projectRoot: string;
  issue: AuditIssue;
  outputDir: string;
  apply: boolean;
}

export interface PatchResult {
  issueId: string;
  applied: boolean;
  diff: string;
  diffPath: string;
  explanation: string;
  touchedFiles: string[];
}

export interface Patcher {
  generatePatch(input: PatchInput): Promise<PatchResult>;
}

export interface VerifyInput {
  projectRoot: string;
  route: string;
  viewportName: string;
}

export interface VerificationResult {
  reportPath: string;
  screenshotPath?: string;
}

export interface Verifier {
  verify(input: VerifyInput): Promise<VerificationResult | null>;
}

export interface AuditRunOptions {
  projectRoot: string;
  route?: string;
  mobileOnly?: boolean;
  viewportName?: string;
}

export interface AuditRunResult {
  report: AuditReport;
  reportPath: string;
}

export interface InitProjectResult {
  configPath: string;
  routesPath: string;
  framework: FrameworkType;
  styleSystem: StyleSystemConfig;
  routes: string[];
  addedScripts: string[];
}

export interface FixRunOptions {
  projectRoot: string;
  issueId?: string;
  apply?: boolean;
}

export interface FixRunResult {
  issue: AuditIssue;
  patch: PatchResult;
  beforeEvidence?: string;
  verification?: VerificationResult | null;
}

export interface UninstallResult {
  removedPaths: string[];
  removedScripts: string[];
}
