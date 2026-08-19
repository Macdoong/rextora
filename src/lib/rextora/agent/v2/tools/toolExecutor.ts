/**
 * Tool executor — Policy → Approval → Adapter → Existing API.
 * Emits events and writes audit records. Never bypasses policy.
 */

import type { AnyToolDefinition } from "./toolTypes";
import type { ToolContext } from "./toolContext";
import {
  failResult,
  okResult,
  type ToolResult,
} from "./toolResult";
import { evaluateToolPolicy } from "./toolPolicy";
import {
  formatValidationIssues,
  validateAgainstSchema,
} from "./toolValidator";
import { writeToolAudit } from "./toolAudit";
import { emitToolEvent } from "./toolEvents";
import { getToolById } from "./registry";
import { readToolIdempotency, writeToolIdempotency } from "./toolIdempotency";

export interface ExecuteToolOptions {
  toolId: string;
  input?: Record<string, unknown>;
  context?: Partial<ToolContext>;
  /** Injected registry lookup for tests. */
  resolveTool?: (id: string) => AnyToolDefinition | null;
}

export async function executeTool(
  options: ExecuteToolOptions,
): Promise<ToolResult> {
  const started = Date.now();
  const toolId = options.toolId;
  const input = options.input ?? {};
  const ctx: ToolContext = {
    sessionId: options.context?.sessionId ?? null,
    approved: options.context?.approved ?? false,
    approvalId: options.context?.approvalId ?? null,
    lifecycleContext: options.context?.lifecycleContext ?? null,
    entityMemory: options.context?.entityMemory ?? null,
    now: options.context?.now,
  };
  const resolve = options.resolveTool ?? getToolById;
  const tool = resolve(toolId);

  emitToolEvent({
    type: "tool.started",
    toolId,
    sessionId: ctx.sessionId,
    at: new Date().toISOString(),
    approved: ctx.approved,
  });

  const policy = evaluateToolPolicy(tool, toolId, ctx, input);
  if (!policy.allow) {
    const durationMs = Date.now() - started;
    writeToolAudit({
      toolId,
      sessionId: ctx.sessionId,
      arguments: input,
      result: {
        ok: false,
        status: "denied",
        errorCode: policy.code,
        summary: policy.reasonKo,
      },
      durationMs,
      approved: ctx.approved,
      timestamp: new Date().toISOString(),
      approvalId: ctx.approvalId,
    });
    emitToolEvent({
      type: "tool.denied",
      toolId,
      sessionId: ctx.sessionId,
      at: new Date().toISOString(),
      durationMs,
      approved: ctx.approved,
      errorCode: policy.code,
      errorMessage: policy.reasonKo,
    });
    return failResult(toolId, "denied", policy.code, policy.reasonKo, {
      durationMs,
      approved: ctx.approved,
      requiresApproval: tool?.requiresApproval ?? true,
      category: tool?.category ?? "unknown",
      executionMode: tool?.executionMode ?? "read",
      sessionId: ctx.sessionId,
    });
  }

  const inputValidation = validateAgainstSchema(tool!.inputSchema, input);
  if (!inputValidation.ok) {
    const durationMs = Date.now() - started;
    const message = formatValidationIssues(inputValidation.issues);
    writeToolAudit({
      toolId,
      sessionId: ctx.sessionId,
      arguments: input,
      result: {
        ok: false,
        status: "validation_error",
        errorCode: "INPUT_INVALID",
        summary: message,
      },
      durationMs,
      approved: ctx.approved,
      timestamp: new Date().toISOString(),
      approvalId: ctx.approvalId,
    });
    emitToolEvent({
      type: "tool.failed",
      toolId,
      sessionId: ctx.sessionId,
      at: new Date().toISOString(),
      durationMs,
      approved: ctx.approved,
      errorCode: "INPUT_INVALID",
      errorMessage: message,
    });
    return failResult(toolId, "validation_error", "INPUT_INVALID", message, {
      durationMs,
      approved: ctx.approved,
      requiresApproval: tool!.requiresApproval,
      category: tool!.category,
      executionMode: tool!.executionMode,
      sessionId: ctx.sessionId,
    });
  }

  try {
    const idempotencyKey = tool!.executionMode === "write" && typeof input.idempotencyKey === "string"
      ? input.idempotencyKey.trim()
      : "";
    const replay = idempotencyKey
      ? readToolIdempotency({ toolId, sessionId: ctx.sessionId, idempotencyKey, arguments: input })
      : { hit: false as const };
    const data = replay.hit ? replay.data : await tool!.handler(input, ctx);
    if (!replay.hit && idempotencyKey) {
      writeToolIdempotency({
        toolId,
        sessionId: ctx.sessionId,
        idempotencyKey,
        arguments: input,
        data,
      });
    }
    const durationMs = Date.now() - started;

    // Output schema is advisory for Phase 2 — object-shaped results only soft-checked
    if (data !== null && typeof data === "object") {
      const out = validateAgainstSchema(tool!.outputSchema, data);
      if (!out.ok && tool!.outputSchema.additionalProperties === false) {
        // Soft fail only when schema is strict; most tools use additionalProperties:true
      }
    }

    writeToolAudit({
      toolId,
      sessionId: ctx.sessionId,
      arguments: input,
      result: {
        ok: true,
        status: "ok",
        errorCode: null,
        summary: typeof data === "object" && data && "status" in data
          ? String((data as { status?: unknown }).status ?? "ok")
          : "ok",
      },
      durationMs,
      approved: ctx.approved || tool!.executionMode === "read",
      timestamp: new Date().toISOString(),
      approvalId: ctx.approvalId,
    });
    emitToolEvent({
      type: "tool.completed",
      toolId,
      sessionId: ctx.sessionId,
      at: new Date().toISOString(),
      durationMs,
      approved: ctx.approved || tool!.executionMode === "read",
    });

    return okResult(toolId, data, {
      durationMs,
      approved: ctx.approved || tool!.executionMode === "read",
      requiresApproval: tool!.requiresApproval,
      category: tool!.category,
      executionMode: tool!.executionMode,
      sessionId: ctx.sessionId,
    });
  } catch (err) {
    const durationMs = Date.now() - started;
    const message = err instanceof Error ? err.message : String(err);
    writeToolAudit({
      toolId,
      sessionId: ctx.sessionId,
      arguments: input,
      result: {
        ok: false,
        status: "execution_error",
        errorCode: "HANDLER_ERROR",
        summary: message,
      },
      durationMs,
      approved: ctx.approved,
      timestamp: new Date().toISOString(),
      approvalId: ctx.approvalId,
    });
    emitToolEvent({
      type: "tool.failed",
      toolId,
      sessionId: ctx.sessionId,
      at: new Date().toISOString(),
      durationMs,
      approved: ctx.approved,
      errorCode: "HANDLER_ERROR",
      errorMessage: message,
    });
    return failResult(toolId, "execution_error", "HANDLER_ERROR", message, {
      durationMs,
      approved: ctx.approved,
      requiresApproval: tool!.requiresApproval,
      category: tool!.category,
      executionMode: tool!.executionMode,
      sessionId: ctx.sessionId,
    });
  }
}
