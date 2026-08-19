/**
 * Normalized tool result envelope.
 */

export type ToolResultStatus =
  | "ok"
  | "denied"
  | "validation_error"
  | "policy_error"
  | "execution_error";

export interface ToolResult<T = unknown> {
  ok: boolean;
  status: ToolResultStatus;
  toolId: string;
  data: T | null;
  errorCode: string | null;
  errorMessage: string | null;
  durationMs: number;
  approved: boolean;
  requiresApproval: boolean;
  audited: boolean;
  meta: {
    category: string;
    executionMode: "read" | "write";
    sessionId: string | null;
  };
}

export function okResult<T>(
  toolId: string,
  data: T,
  opts: {
    durationMs: number;
    approved: boolean;
    requiresApproval: boolean;
    category: string;
    executionMode: "read" | "write";
    sessionId: string | null;
    audited?: boolean;
  },
): ToolResult<T> {
  return {
    ok: true,
    status: "ok",
    toolId,
    data,
    errorCode: null,
    errorMessage: null,
    durationMs: opts.durationMs,
    approved: opts.approved,
    requiresApproval: opts.requiresApproval,
    audited: opts.audited ?? true,
    meta: {
      category: opts.category,
      executionMode: opts.executionMode,
      sessionId: opts.sessionId,
    },
  };
}

export function failResult(
  toolId: string,
  status: Exclude<ToolResultStatus, "ok">,
  errorCode: string,
  errorMessage: string,
  opts: {
    durationMs: number;
    approved?: boolean;
    requiresApproval?: boolean;
    category?: string;
    executionMode?: "read" | "write";
    sessionId?: string | null;
    audited?: boolean;
  },
): ToolResult<null> {
  return {
    ok: false,
    status,
    toolId,
    data: null,
    errorCode,
    errorMessage,
    durationMs: opts.durationMs,
    approved: opts.approved ?? false,
    requiresApproval: opts.requiresApproval ?? false,
    audited: opts.audited ?? true,
    meta: {
      category: opts.category ?? "unknown",
      executionMode: opts.executionMode ?? "read",
      sessionId: opts.sessionId ?? null,
    },
  };
}
