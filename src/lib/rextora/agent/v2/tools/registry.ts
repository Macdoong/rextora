/**
 * Agent V2 Tool Registry — read-first + controlled execution adapters.
 * Lookup by id / intent / capability / category.
 * No Live / Exchange / SAFE mutation tools are registered.
 */

import type { AnyToolDefinition, ToolCapability, ToolCategory } from "./toolTypes";
import {
  backtestRunInputSchema,
  emptyObjectSchema,
  genericOutputSchema,
  jobIdInputSchema,
  listLimitSchema,
  paperPrepareInputSchema,
  paperControlInputSchema,
  resultsPromoteInputSchema,
  runIdInputSchema,
  searchCreateInputSchema,
  sessionIdInputSchema,
  strategyIdInputSchema,
  strategyDeleteInputSchema,
  strategyMutationInputSchema,
  strategyRenameInputSchema,
} from "./toolSchemas";
import {
  handleBacktestDetail,
  handleBacktestList,
  handleLifecycleCurrent,
  handleMemoryExport,
  handleMemoryRecall,
  handlePaperSession,
  handlePaperStatus,
  handleResearchSummary,
  handleResultsDetail,
  handleResultsList,
  handleSearchList,
  handleSearchResult,
  handleSearchStatus,
  handleSettingsCurrent,
  handleStrategyDetail,
  handleStrategyList,
  handleWorkspaceCurrent,
} from "./readHandlers";
import {
  handleBacktestRun,
  handleMemoryReset,
  handlePaperPrepare,
  handlePaperApproveStart,
  handlePaperPause,
  handlePaperResume,
  handlePaperStop,
  handleResultsPromote,
  handleSearchCancel,
  handleSearchCreate,
  handleSearchPause,
  handleSearchStart,
  handleStrategyArchive,
  handleStrategyDelete,
  handleStrategyRename,
  handleStrategyRestore,
} from "./execHandlers";

function tool(def: AnyToolDefinition): AnyToolDefinition {
  return def;
}

const TOOLS: AnyToolDefinition[] = [
  // ── READ: Search ──────────────────────────────────────────
  tool({
    id: "search.list",
    name: "List search jobs",
    description: "List strategy search jobs from the existing job store",
    category: "search",
    inputSchema: listLimitSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["list"],
    intents: ["search_status", "research_workspace"],
    handler: handleSearchList,
  }),
  tool({
    id: "search.status",
    name: "Search job status",
    description: "Get status of a strategy search job",
    category: "search",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["status"],
    intents: ["search_status", "search_failure_explanation"],
    handler: handleSearchStatus,
  }),
  tool({
    id: "search.result",
    name: "Search best result",
    description: "Get best trial/candidate for a search job",
    category: "search",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["detail"],
    intents: ["search_status", "recommend_next"],
    handler: handleSearchResult,
  }),

  // ── READ: Results ─────────────────────────────────────────
  tool({
    id: "results.list",
    name: "Results list",
    description: "List research results summary for a job",
    category: "results",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["list"],
    intents: ["recommend_next", "research_workspace"],
    handler: handleResultsList,
  }),
  tool({
    id: "results.detail",
    name: "Results detail",
    description: "Full research results summary for a job",
    category: "results",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["detail"],
    intents: ["recommend_next"],
    handler: handleResultsDetail,
  }),

  // ── READ: Strategy ────────────────────────────────────────
  tool({
    id: "strategy.list",
    name: "List strategies",
    description: "List strategies from the strategy store",
    category: "strategy",
    inputSchema: listLimitSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["list"],
    intents: ["compare_strategies", "explain_strategy"],
    handler: handleStrategyList,
  }),
  tool({
    id: "strategy.detail",
    name: "Strategy detail",
    description: "Get a strategy by id",
    category: "strategy",
    inputSchema: strategyIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["detail"],
    intents: ["explain_strategy"],
    handler: handleStrategyDetail,
  }),

  // ── READ: Backtest ────────────────────────────────────────
  tool({
    id: "backtest.list",
    name: "List backtests",
    description: "List saved backtest runs",
    category: "backtest",
    inputSchema: {
      type: "object",
      properties: {
        limit: { type: "number" },
        strategyId: { type: "string" },
      },
      additionalProperties: false,
    },
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["list"],
    intents: ["backtest_summary"],
    handler: handleBacktestList,
  }),
  tool({
    id: "backtest.detail",
    name: "Backtest detail",
    description: "Get a saved backtest by run id",
    category: "backtest",
    inputSchema: runIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["detail"],
    intents: ["backtest_summary"],
    handler: handleBacktestDetail,
  }),

  // ── READ: Paper ───────────────────────────────────────────
  tool({
    id: "paper.status",
    name: "Paper status",
    description: "Active paper session status overview",
    category: "paper",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["status", "current"],
    intents: ["paper_status", "paper_start_request"],
    handler: handlePaperStatus,
  }),
  tool({
    id: "paper.session",
    name: "Paper session",
    description: "Get paper session by id or active session",
    category: "paper",
    inputSchema: sessionIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["detail", "status"],
    intents: ["paper_start_request"],
    handler: handlePaperSession,
  }),

  // ── READ: Workspace / Lifecycle / Settings / Research ─────
  tool({
    id: "workspace.current",
    name: "Current workspace",
    description: "Current agent workspace snapshot or research workspace",
    category: "workspace",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["workspace_status", "research_workspace", "continue_session"],
    handler: handleWorkspaceCurrent,
  }),
  tool({
    id: "workspace.get",
    name: "Get workspace",
    description: "Compatibility read alias for the current agent workspace",
    category: "workspace",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["research_workspace", "continue_session"],
    handler: handleWorkspaceCurrent,
  }),
  tool({
    id: "lifecycle.current",
    name: "Current lifecycle",
    description: "Inferred pipeline lifecycle stage",
    category: "lifecycle",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["recommend_next", "continue_session"],
    handler: handleLifecycleCurrent,
  }),
  tool({
    id: "lifecycle.get",
    name: "Get lifecycle",
    description: "Compatibility read alias for the current lifecycle stage",
    category: "lifecycle",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["recommend_next", "continue_session"],
    handler: handleLifecycleCurrent,
  }),
  tool({
    id: "settings.current",
    name: "Current settings",
    description: "Read-only Rextora settings snapshot",
    category: "settings",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["risk_summary"],
    handler: async () => handleSettingsCurrent(),
  }),
  tool({
    id: "settings.get",
    name: "Get settings",
    description: "Compatibility read alias for the read-only settings snapshot",
    category: "settings",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["current"],
    intents: ["risk_summary"],
    handler: async () => handleSettingsCurrent(),
  }),
  tool({
    id: "research.summary",
    name: "Research summary",
    description: "Research workspace or per-job results summary",
    category: "research",
    inputSchema: {
      type: "object",
      properties: { jobId: { type: "string" } },
      additionalProperties: false,
    },
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["summary"],
    intents: ["research_workspace", "recommend_next"],
    handler: handleResearchSummary,
  }),
  tool({
    id: "memory.recall",
    name: "Recall verified memory",
    description: "Search evidence-linked long-term employee memory",
    category: "memory",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
      additionalProperties: false,
    },
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["recall"],
    intents: ["memory_recall"],
    handler: handleMemoryRecall,
  }),
  tool({
    id: "memory.export",
    name: "Export verified memory",
    description: "Export bounded evidence-linked memory for the current operator session",
    category: "memory",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: false,
    executionMode: "read",
    capabilities: ["export"],
    intents: ["memory_export"],
    handler: handleMemoryExport,
  }),
  tool({
    id: "memory.reset",
    name: "Reset verified memory",
    description: "Explicitly reset long-term employee memory for the current session",
    category: "memory",
    inputSchema: emptyObjectSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["reset"],
    intents: ["memory_reset"],
    handler: handleMemoryReset,
  }),

  // ── WRITE: Search / Backtest / Paper / Results ────────────
  tool({
    id: "search.create",
    name: "Create search job",
    description: "Create a strategy search job via existing API",
    category: "search",
    inputSchema: searchCreateInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["create"],
    intents: ["prepare_search_plan", "approve_pending"],
    handler: handleSearchCreate,
  }),
  tool({
    id: "search.start",
    name: "Start search job",
    description: "Start a strategy search job via existing API",
    category: "search",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["start"],
    intents: ["approve_pending", "search_resume_request"],
    handler: handleSearchStart,
  }),
  tool({
    id: "search.pause",
    name: "Pause search job",
    description: "Pause a running strategy search job",
    category: "search",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["pause"],
    intents: ["search_pause_request"],
    handler: handleSearchPause,
  }),
  tool({
    id: "search.cancel",
    name: "Cancel search job",
    description: "Cancel a strategy search job",
    category: "search",
    inputSchema: jobIdInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["cancel"],
    intents: [],
    handler: handleSearchCancel,
  }),
  tool({
    id: "backtest.run",
    name: "Run backtest",
    description: "Run and save a backtest via existing runner",
    category: "backtest",
    inputSchema: backtestRunInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["run"],
    intents: ["prepare_backtest_plan", "approve_pending"],
    handler: handleBacktestRun,
  }),
  tool({
    id: "paper.prepare",
    name: "Prepare paper session",
    description: "Prepare paper session (pending_approval) via existing service",
    category: "paper",
    inputSchema: paperPrepareInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["prepare"],
    intents: ["prepare_paper_plan", "approve_pending"],
    handler: handlePaperPrepare,
  }),
  tool({
    id: "paper.approve_start",
    name: "Approve and start paper session",
    description: "Explicitly approve and activate an existing Paper session via the canonical service",
    category: "paper",
    inputSchema: paperControlInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["approve_start"],
    intents: ["paper_activate_request", "approve_pending"],
    handler: handlePaperApproveStart,
  }),
  tool({
    id: "paper.pause",
    name: "Pause paper session",
    description: "Pause an active Paper session via the canonical service",
    category: "paper",
    inputSchema: paperControlInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["pause"],
    intents: ["paper_pause_request"],
    handler: handlePaperPause,
  }),
  tool({
    id: "paper.resume",
    name: "Resume paper session",
    description: "Resume a paused Paper session via the canonical service",
    category: "paper",
    inputSchema: paperControlInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["resume"],
    intents: ["paper_resume_request"],
    handler: handlePaperResume,
  }),
  tool({
    id: "paper.stop",
    name: "Stop paper session",
    description: "Stop a Paper session via the canonical service",
    category: "paper",
    inputSchema: paperControlInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["stop"],
    intents: ["paper_stop_request"],
    handler: handlePaperStop,
  }),
  tool({
    id: "results.promote",
    name: "Promote research result",
    description: "Register/promote research trials via existing promote APIs",
    category: "results",
    inputSchema: resultsPromoteInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["promote"],
    intents: ["results_promote_request", "approve_pending"],
    handler: handleResultsPromote,
  }),
  tool({
    id: "strategy.rename",
    name: "Rename strategy",
    description: "Rename a non-protected strategy without changing its identity or parameters",
    category: "strategy",
    inputSchema: strategyRenameInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["rename"],
    intents: ["strategy_rename_request"],
    handler: handleStrategyRename,
  }),
  tool({
    id: "strategy.archive",
    name: "Archive strategy",
    description: "Apply the existing display-only archive tag to a non-protected strategy",
    category: "strategy",
    inputSchema: strategyMutationInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["archive"],
    intents: ["strategy_archive_request"],
    handler: handleStrategyArchive,
  }),
  tool({
    id: "strategy.restore",
    name: "Restore strategy",
    description: "Remove the existing display-only archive tag from a non-protected strategy",
    category: "strategy",
    inputSchema: strategyMutationInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["restore"],
    intents: ["strategy_restore_request"],
    handler: handleStrategyRestore,
  }),
  tool({
    id: "strategy.delete",
    name: "Delete strategy",
    description: "Delete a non-protected strategy only when the dependency policy allows",
    category: "strategy",
    inputSchema: strategyDeleteInputSchema,
    outputSchema: genericOutputSchema,
    requiresApproval: true,
    executionMode: "write",
    capabilities: ["delete"],
    intents: ["strategy_delete_request"],
    handler: handleStrategyDelete,
  }),
];

const BY_ID = new Map(TOOLS.map((t) => [t.id, t]));

export function listTools(): AnyToolDefinition[] {
  return [...TOOLS];
}

export function getToolById(id: string): AnyToolDefinition | null {
  return BY_ID.get(id) ?? null;
}

export function getToolsByCategory(category: ToolCategory): AnyToolDefinition[] {
  return TOOLS.filter((t) => t.category === category);
}

export function getToolsByCapability(
  capability: ToolCapability,
): AnyToolDefinition[] {
  return TOOLS.filter((t) => t.capabilities.includes(capability));
}

export function getToolsByIntent(intent: string): AnyToolDefinition[] {
  return TOOLS.filter((t) => t.intents?.includes(intent));
}

export function listToolIds(): string[] {
  return TOOLS.map((t) => t.id);
}

export function listReadToolIds(): string[] {
  return TOOLS.filter((t) => t.executionMode === "read").map((t) => t.id);
}

export function listWriteToolIds(): string[] {
  return TOOLS.filter((t) => t.executionMode === "write").map((t) => t.id);
}

/** Guard: ensure no forbidden tools ever register. */
export function assertRegistrySafe(): void {
  for (const t of TOOLS) {
    if (
      t.id.startsWith("live.") ||
      t.id.startsWith("exchange.") ||
      t.id.startsWith("order.") ||
      t.id.startsWith("safe.")
    ) {
      throw new Error(`FORBIDDEN_TOOL_REGISTERED:${t.id}`);
    }
  }
}

assertRegistrySafe();
