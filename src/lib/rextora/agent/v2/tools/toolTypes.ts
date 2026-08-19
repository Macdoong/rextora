/**
 * Agent V2 Tool Layer — type definitions.
 * Tools wrap existing services only. Never Live / Exchange / SAFE.
 */

export type ToolCategory =
  | "search"
  | "backtest"
  | "paper"
  | "results"
  | "strategy"
  | "research"
  | "lifecycle"
  | "workspace"
  | "settings"
  | "memory";

export type ToolExecutionMode = "read" | "write";

export type ToolCapability =
  | "list"
  | "status"
  | "detail"
  | "create"
  | "start"
  | "pause"
  | "cancel"
  | "run"
  | "prepare"
  | "approve_start"
  | "resume"
  | "stop"
  | "promote"
  | "rename"
  | "archive"
  | "restore"
  | "delete"
  | "summary"
  | "current"
  | "recall"
  | "export"
  | "reset";

/** Lightweight JSON-schema subset for tool I/O. */
export interface ToolJsonSchema {
  type: "object" | "string" | "number" | "boolean" | "array" | "null";
  properties?: Record<string, ToolJsonSchema>;
  required?: string[];
  items?: ToolJsonSchema;
  description?: string;
  additionalProperties?: boolean;
  enum?: Array<string | number | boolean>;
  nullable?: boolean;
}

export interface ToolDefinition<TInput = Record<string, unknown>, TOutput = unknown> {
  id: string;
  name: string;
  description: string;
  category: ToolCategory;
  inputSchema: ToolJsonSchema;
  outputSchema: ToolJsonSchema;
  requiresApproval: boolean;
  executionMode: ToolExecutionMode;
  capabilities: ToolCapability[];
  /** Optional intent hints for future reasoning lookup. */
  intents?: string[];
  handler: (input: TInput, ctx: import("./toolContext").ToolContext) => Promise<TOutput>;
}

export type AnyToolDefinition = ToolDefinition<Record<string, unknown>, unknown>;

export type ToolEventType =
  | "tool.started"
  | "tool.completed"
  | "tool.failed"
  | "tool.denied";

export interface ToolEvent {
  type: ToolEventType;
  toolId: string;
  sessionId: string | null;
  at: string;
  durationMs?: number;
  approved?: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export const FORBIDDEN_TOOL_IDS = [
  "live.start",
  "live.stop",
  "live.order",
  "exchange.order",
  "exchange.call",
  "order.place",
  "safe.modify",
  "safe.mutate",
] as const;
