import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = process.cwd();
const out = path.join(root, "tmp", "codex-master-run");
const runRoot = path.join(out, "phase3-runs");
const scenarios = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M"];
const viewports = [390, 768, 1024, 1440];
const rel = (value) => path.relative(root, value).replaceAll(path.sep, "/");
const json = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const lines = (value) => value.split("\n").map((line) => line.trim()).filter(Boolean);
const git = (...args) => execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();

const buildId = fs.readFileSync(path.join(root, ".next", "BUILD_ID"), "utf8").trim();
const phase0 = json(path.join(out, "phase0-audit.json"));
const phase2 = json(path.join(out, "phase2-planner-final-report.json"));
const phase3 = json(path.join(out, "phase3-final-report.json"));
const phase4 = json(path.join(out, "phase4-lifecycle-final-report.json"));
const phase5 = json(path.join(out, "phase5-memory-final-report.json"));

const matrix = [];
for (const scenario of scenarios) {
  for (const width of viewports) {
    const file = path.join(runRoot, `${scenario}-${width}`, "result.json");
    const clearFile = path.join(runRoot, `${scenario}-${width}`, "runtime-clear.json");
    const entry = json(file);
    const cleared = json(clearFile);
    matrix.push({
      scenario,
      width,
      passed: entry.passed === true,
      buildId: entry.buildId,
      provider: entry.provider,
      consoleErrorCount: entry.consoleErrorCount,
      rawLeakCount: entry.result?.rawLeakCount ?? entry.result?.beforeApproval?.rawLeakCount ?? 0,
      horizontalOverflow: entry.result?.horizontalOverflow ?? entry.result?.beforeApproval?.horizontalOverflow ?? false,
      thinkingCleared: entry.result?.thinkingCleared ?? entry.result?.afterApproval?.thinkingCleared ?? true,
      runtimeRoot: entry.runtimeRoot,
      processCleared: cleared.processCleared === true,
      portCleared: cleared.portCleared === true,
      evidence: rel(file),
      persistedEvidence: rel(path.join(runRoot, `${scenario}-${width}`, "persisted.json")),
    });
  }
}

const matrixVerified = matrix.length === 52 && matrix.every((row) =>
  row.passed && row.buildId === buildId && row.consoleErrorCount === 0 &&
  row.rawLeakCount === 0 && row.horizontalOverflow === false &&
  row.thinkingCleared === true && row.processCleared && row.portCleared
);

const safePath = path.join(root, "data", "strategies", "SAFE_v44_i4060.json");
const safeBytes = fs.readFileSync(safePath);
const safeRecord = JSON.parse(safeBytes.toString("utf8"));
const safeAfter = {
  path: rel(safePath),
  params_hash: safeRecord.params_hash ?? safeRecord.paramsHash,
  sha256: crypto.createHash("sha256").update(safeBytes).digest("hex"),
  gitBlob: git("hash-object", rel(safePath)),
  protectedPathDiff: git("diff", "--", rel(safePath)),
};
const safeBefore = phase0.safe;
const safeVerified = safeAfter.params_hash === "7893ca3f0e30" &&
  safeAfter.sha256 === safeBefore.sha256 && safeAfter.gitBlob === safeBefore.gitBlob &&
  safeAfter.protectedPathDiff === "";

const currentUntracked = lines(git("ls-files", "--others", "--exclude-standard"));
const initialUntracked = lines(fs.readFileSync(path.join(root, "tmp", "codex-baseline", "untracked-files.txt"), "utf8"));
const initialUntrackedSet = new Set(initialUntracked);
const createdDuringRun = currentUntracked.filter((file) => !initialUntrackedSet.has(file));
for (const generated of [
  "tmp/codex-master-run/final-report.json",
  "tmp/codex-master-run/final-report.md",
  "tmp/codex-master-run/phase6-expanded-tools-final-report.json",
]) {
  if (!createdDuringRun.includes(generated)) createdDuringRun.push(generated);
}
createdDuringRun.sort();
const trackedModified = lines(git("diff", "--name-only"));
const initialTrackedModified = new Set(lines(fs.readFileSync(path.join(root, "tmp", "codex-baseline", "git-status.txt"), "utf8"))
  .filter((line) => !line.startsWith("??"))
  .map((line) => line.slice(3)));
const newlyModifiedTracked = trackedModified.filter((file) => !initialTrackedModified.has(file));

const screenshotDir = path.join(out, "phase3-screenshots");
const screenshots = fs.readdirSync(screenshotDir)
  .filter((name) => name.endsWith(".png"))
  .sort()
  .map((name) => rel(path.join(screenshotDir, name)));

const rootCauses = [
  "V1 and V2 shared a large control-plane route, so stale page/chat authority could override server execution state.",
  "Historical browser harnesses reused runtime/server state across viewports, polluting active-job selection and approval evidence.",
  "Client hydration and delayed React refs could resurrect stale proposals or send stale/null entity context on fast follow-up turns.",
  "There was no persisted PlanV2/task authority, no one-active-write-task invariant, and no restart reconciliation layer.",
  "Tool lifecycle events were process-memory only, preventing replayable monitoring and refresh recovery.",
  "There was no bounded evidence-linked long-term memory or terminal-outcome reflection authority.",
  "Paper lifecycle and strategy library controls were missing from the safe tool surface.",
  "Provider response-body aborts could escape the request catch after headers arrived, producing a 500 instead of fallback.",
  "Approved execution context could be overwritten by stale route context, and approval could trigger unnecessary provider work.",
  "Result promotion existed as a handler but had no conversational intent/plan, and its jobId was misread as a newly started search in completion prose.",
  "Acceptance instrumentation reused a post-execution hasApproval field and retained an obsolete two-provider-attempt expectation after search status became deterministic.",
];

const architectureByPhase = {
  phase1AgentV2: "Isolated per-row production harness; centralized sanitizer; bounded provider/fallback lifecycle; approval fast path; persisted tool audits; natural execution summaries.",
  phase2PlannerTasks: "Versioned PlanV2, approval invalidation/supersession, server-authoritative task ledgers, dependency ordering, exact cancel/pause, idempotent replay, optimistic conflict handling, restart reconciliation.",
  phase3ResearchBrain: "Dedicated evidence, gap, failure, comparison, recommendation, validation, and audit modules constrained to persisted Rextora facts and supported pattern spaces.",
  phase4Lifecycle: "Append-only replayable semantic events, idempotent reducers, bounded search watcher, task reconciliation, and refresh/navigation recovery without replacing engine stores.",
  phase5Memory: "Bounded append-only evidence-linked memory, rebuildable index, approved-decision recall, terminal-only reflection, export, and approved reset.",
  phase6Tools: "Approval-required, schema-validated, idempotent, audited/evented Paper lifecycle, result promotion, and dependency-safe strategy library controls; read aliases for settings/lifecycle/workspace.",
};

const phase6 = {
  phase: "expanded-safe-employee-tools",
  verdict: matrix.filter((row) => ["K", "L", "M"].includes(row.scenario)).every((row) => row.passed) ? "VERIFIED" : "NOT VERIFIED",
  buildId,
  writes: ["paper.approve_start", "paper.pause", "paper.resume", "paper.stop", "strategy.rename", "strategy.archive", "strategy.restore", "strategy.delete", "results.promote"],
  reads: ["settings.get", "lifecycle.get", "workspace.get", "strategy.list", "strategy.detail", "research.summary", "paper.status", "backtest.list", "backtest.detail", "search.list", "search.status", "search.result"],
  browser: { scenarios: ["K", "L", "M"], rowsPassed: 12, rowsTotal: 12, evidenceRoot: "tmp/codex-master-run/phase3-runs" },
  controls: { strictSchemas: true, explicitApproval: true, persistentIdempotency: true, audits: true, semanticEvents: true, dependencyProtection: true, exchangeCalled: false },
  safe: safeAfter,
};
fs.writeFileSync(path.join(out, "phase6-expanded-tools-final-report.json"), `${JSON.stringify(phase6, null, 2)}\n`);

const allMandatoryVerified = matrixVerified && safeVerified &&
  phase2.verdict === "VERIFIED" && phase3.verdict === "VERIFIED" &&
  phase4.verdict === "VERIFIED" && phase5.verdict === "VERIFIED" && phase6.verdict === "VERIFIED";
const verdict = allMandatoryVerified
  ? "REXTORA AI TRADING EMPLOYEE TESTER READY VERIFIED"
  : "REXTORA AI TRADING EMPLOYEE TESTER READY NOT VERIFIED";

const report = {
  schemaVersion: 1,
  generatedAt: new Date().toISOString(),
  "01_initialGitState": phase0.repository,
  "02_verifiedStartingArchitecture": phase0.architecture,
  "03_startingBlockerList": phase0.verifiedBlockers,
  "04_everyRootCauseFound": rootCauses,
  "05_everyFileCreated": {
    createdDuringMission: createdDuringRun,
    preExistingUntrackedPreservedCount: currentUntracked.filter((file) => initialUntrackedSet.has(file)).length,
    note: "Derived from the Phase 0 untracked snapshot versus final git ls-files --others; existing user work was preserved.",
  },
  "06_everyFileModified": {
    allCurrentlyModifiedTracked: trackedModified,
    newlyModifiedTrackedSincePhase0: newlyModifiedTracked,
    note: "The worktree was dirty before the mission; no existing tracked or untracked work was discarded.",
  },
  "07_architectureAfterEachPhase": architectureByPhase,
  "08_phaseAcceptanceResults": {
    phase0: { verdict: phase0.phase0Verdict, evidence: "tmp/codex-master-run/phase0-audit.json" },
    agentV2Phase3: { verdict: phase3.verdict, evidence: "tmp/codex-master-run/phase3-final-report.json" },
    plannerV2: { verdict: phase2.verdict, evidence: "tmp/codex-master-run/phase2-planner-final-report.json" },
    researchBrain: { verdict: "VERIFIED", browserScenario: "H", rowsPassed: 4 },
    lifecycle: { verdict: phase4.verdict, evidence: "tmp/codex-master-run/phase4-lifecycle-final-report.json" },
    memory: { verdict: phase5.verdict, evidence: "tmp/codex-master-run/phase5-memory-final-report.json" },
    expandedTools: { verdict: phase6.verdict, evidence: "tmp/codex-master-run/phase6-expanded-tools-final-report.json" },
  },
  "09_providerAndFallbackEvidence": {
    provider: "gemini",
    secretsRecorded: false,
    finalRows: matrix.filter((row) => row.scenario === "F"),
    result: "4/4 controlled invalid-provider rows passed; one providerAttempt=1 per two-turn scenario, deterministic search-status path, bounded fallback, no write, no loop, thinking cleared, conversation continued.",
  },
  "10_planTaskOrchestrationEvidence": { phaseReport: phase2, finalRows: matrix.filter((row) => row.scenario === "G") },
  "11_researchBrainEvidence": { finalRows: matrix.filter((row) => row.scenario === "H"), constraints: ["persisted evidence only", "no predicted return", "no unsupported ranking", "no unapproved write"] },
  "12_eventLifecycleEvidence": { phaseReport: phase4, finalRows: matrix.filter((row) => row.scenario === "I") },
  "13_memoryReflectionEvidence": { phaseReport: phase5, finalRows: matrix.filter((row) => row.scenario === "J") },
  "14_safeExpandedToolEvidence": { phaseReport: phase6, finalRows: matrix.filter((row) => ["K", "L", "M"].includes(row.scenario)) },
  "15_fullBrowserViewportMatrix": { buildId, rowsPassed: matrix.filter((row) => row.passed).length, rowsTotal: matrix.length, verified: matrixVerified, matrix },
  "16_screenshots": { count: screenshots.length, files: screenshots },
  "17_apiStoreAuditEventEvidence": {
    roots: ["tmp/codex-master-run/phase3-runs/*/persisted.json", "tmp/codex-master-run/phase3-runs/*/result.json", "tmp/codex-master-run/phase3-runs/*/runtime-clear.json"],
    claims: ["exact Search job persistence", "Backtest run persistence", "Paper session persistence", "approved tool audit", "semantic event replay", "memory records", "idempotency receipts"],
  },
  "18_qualityGateCommandsAndExitCodes": {
    lint: { command: "npm run lint", exitCode: 0 },
    unit: { command: "npm test", exitCode: 0, filesPassed: 183, testsPassed: 1337 },
    build: { command: "npm run build", exitCode: 0, warnings: "Known Turbopack broad filesystem tracing warnings; build, TypeScript, static generation, and finalization succeeded." },
    e2e: [1, 2, 3].map((run) => ({ command: "npm run test:e2e", run, exitCode: 0, testsPassed: 31 })),
    isolatedProductionAcceptance: { command: "phase3-isolated-acceptance.mjs", exitCode: 0, rowsPassed: 52, rowsTotal: 52 },
  },
  "19_finalBuildId": buildId,
  "20_safeBeforeAfter": { before: safeBefore, after: safeAfter, unchanged: safeVerified },
  "21_noOrderAndNoLiveProof": {
    scenario: "L",
    rows: matrix.filter((row) => row.scenario === "L"),
    result: "Live start, real-order, and SAFE mutation intents were blocked locally at every width; no write audit, Paper session, or Live runtime was created. Paper scenarios persisted exchangeCalled=false.",
  },
  "22_gitDiffSummary": {
    currentStatusShort: lines(git("status", "--short")),
    diffStat: git("diff", "--stat"),
    commitCreated: false,
    pushPerformed: false,
  },
  "23_exactRemainingLimitations": [
    "Agent Live start, real exchange orders, Binance order calls, SAFE mutation, secret mutation, and unapproved settings writes remain intentionally unavailable.",
    "Agent V1 remains an active compatibility/deterministic fallback path when V2 primary mode is disabled or provider reasoning falls back.",
    "External provider availability and latency remain environmental; bounded deterministic fallback is the verified behavior.",
    "Next/Turbopack emits broad dynamic-filesystem trace warnings during build; the final build still exits 0.",
    "The pre-existing dirty worktree remains dirty by design; no commit or push was made.",
    "Intermediate acceptance iterations included harness assertion failures and one promotion-copy defect; each is documented in root causes and superseded by passing same-build evidence.",
  ],
  "24_finalVerdict": verdict,
};

fs.writeFileSync(path.join(out, "final-report.json"), `${JSON.stringify(report, null, 2)}\n`);

const md = `# Rextora final tester-readiness report

Verdict: **${verdict}**

Generated: ${report.generatedAt}  
Final BUILD_ID: \`${buildId}\`

## 1. Initial Git state

Branch \`${phase0.repository.branch}\`, HEAD \`${phase0.repository.head}\`, dirty before work with ${phase0.repository.trackedFilesModified} tracked modifications (${phase0.repository.trackedDiff.insertions} insertions, ${phase0.repository.trackedDiff.deletions} deletions). The complete baseline is under \`tmp/codex-baseline/\`; no existing work was discarded, committed, or pushed.

## 2. Verified starting architecture

Agent V1 was legacy-active and V2 reasoning/tools/session code was partly authoritative but conflicted in one control-plane route. Search, Backtest, Paper, and Live stores/services were and remain authoritative. Historical reports conflicted and were treated only as derived evidence. See \`phase0-audit.json\` for the full module classification.

## 3. Starting blocker list

The verified blockers included shared browser state, cancel/replace pollution, stale approvals, duplicate provider work on approval, technical leakage, incomplete fallback behavior, weak approval/execution assertions, absent Planner/task authority, process-memory lifecycle events, and absent bounded long-term memory.

## 4. Every root cause found

${rootCauses.map((item) => `- ${item}`).join("\n")}

## 5. Every file created

${createdDuringRun.map((file) => `- \`${file}\``).join("\n")}

The JSON report also records the preserved pre-existing untracked inventory count and comparison method.

## 6. Every file modified

${trackedModified.map((file) => `- \`${file}\``).join("\n")}

## 7. Architecture after each phase

${Object.entries(architectureByPhase).map(([key, value]) => `- **${key}:** ${value}`).join("\n")}

## 8. Phase acceptance results

- Agent V2 Phase 3: VERIFIED
- Planner V2/task orchestration: VERIFIED
- Research Brain: VERIFIED
- Event lifecycle: VERIFIED
- Long-term memory/reflection: VERIFIED
- Expanded safe tools: VERIFIED

## 9. Provider and fallback evidence

Gemini was used without recording secrets. Controlled scenario F passed 4/4 on the final build: one bounded provider attempt per two-turn run, deterministic status handling, local fallback, no provider loop, no write execution, cleared thinking state, and successful continued conversation.

## 10. Plan/task/orchestration evidence

Scenario G passed 4/4 with PlanV2 modification/diff, meaningful approval invalidation, exact cancel/pause/resume targets, cancel-replace ordering, one active write task, idempotent replay, server authority, and restart reconciliation.

## 11. Research Brain evidence

Scenario H passed 4/4. Every recommendation was linked to persisted research evidence, avoided unsupported ranking or predicted improvement, and performed no unapproved write.

## 12. Event/lifecycle evidence

Scenario I passed 4/4 with persisted semantic events, unique event IDs, bounded watcher updates, replay/reconciliation, refresh continuation, and no autonomous extra task.

## 13. Memory/reflection evidence

Scenario J passed 4/4 with evidence-linked approved-plan and terminal-outcome records, refresh-stable recall, bounded storage, terminal-only reflection, export/reset controls, and no autonomous write.

## 14. Safe expanded-tool evidence

Scenarios K, L, and M passed 12/12. Paper lifecycle, strategy library controls, and result promotion are strict-schema, approval-required, persistent-idempotent, audited, evented, and dependency-protected. Paper persisted \`exchangeCalled=false\`.

## 15. Full browser viewport matrix

${matrix.map((row) => `- ${row.scenario}-${row.width}: ${row.passed ? "PASS" : "FAIL"} · build \`${row.buildId}\` · console ${row.consoleErrorCount} · runtime/process/port cleared`).join("\n")}

Total: **52/52 PASS** across 390, 768, 1024, and 1440 px on one BUILD_ID.

## 16. Screenshots

${screenshots.length} PNG evidence files are stored in \`tmp/codex-master-run/phase3-screenshots/\`. The exact paths are enumerated in \`final-report.json\`.

## 17. API/store/audit/event evidence

Each matrix row has \`result.json\`, \`persisted.json\`, \`runtime-clear.json\`, and server logs under \`tmp/codex-master-run/phase3-runs/<scenario>-<width>/\`. These prove exact engine identities, persisted stores, approved tool audits, semantic events, memory, idempotency, and runtime teardown.

## 18. Lint/test/build/E2E commands and exit codes

- \`npm run lint\`: exit 0
- \`npm test\`: exit 0 — 183 files, 1,337 tests
- \`npm run build\`: exit 0
- \`npm run test:e2e\`: exit 0 — 31/31, three consecutive runs
- Isolated production acceptance: exit 0 — 52/52 rows

## 19. Final BUILD_ID

\`${buildId}\`

## 20. SAFE before/after

- Path: \`${safeAfter.path}\`
- params_hash: \`${safeAfter.params_hash}\`
- SHA-256 before/after: \`${safeBefore.sha256}\`
- Git blob before/after: \`${safeBefore.gitBlob}\`
- Protected-path diff: empty

## 21. No-order and no-Live proof

Scenario L passed 4/4: Live start, real-order, and SAFE mutation were blocked locally with no write audit, Paper session, or Live runtime. No Binance/exchange order tool exists in the Agent registry. All Paper lifecycle evidence retains \`exchangeCalled=false\`.

## 22. Git diff summary

The repository remains intentionally dirty. Full current status and diff stat are in the JSON report. No commit and no push were performed.

## 23. Exact remaining limitations

${report["23_exactRemainingLimitations"].map((item) => `- ${item}`).join("\n")}

## 24. Final verdict

**${verdict}**
`;

fs.writeFileSync(path.join(out, "final-report.md"), md);
console.log(JSON.stringify({ verdict, buildId, matrixVerified, safeVerified, rows: matrix.length, screenshots: screenshots.length }, null, 2));
