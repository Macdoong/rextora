/**
 * Agent V2 Tool Layer public exports.
 */

export type {
  AnyToolDefinition,
  ToolCapability,
  ToolCategory,
  ToolDefinition,
  ToolEvent,
  ToolEventType,
  ToolExecutionMode,
  ToolJsonSchema,
} from "./toolTypes";
export { FORBIDDEN_TOOL_IDS } from "./toolTypes";
export type { ToolContext } from "./toolContext";
export { createToolContext } from "./toolContext";
export type { ToolResult, ToolResultStatus } from "./toolResult";
export { executeTool } from "./toolExecutor";
export {
  assertRegistrySafe,
  getToolById,
  getToolsByCapability,
  getToolsByCategory,
  getToolsByIntent,
  listReadToolIds,
  listToolIds,
  listTools,
  listWriteToolIds,
} from "./registry";
export { evaluateToolPolicy, isForbiddenToolId } from "./toolPolicy";
export { validateAgainstSchema } from "./toolValidator";
export { writeToolAudit, readToolAuditLines } from "./toolAudit";
export {
  clearToolEventsForTests,
  emitToolEvent,
  getRecentToolEvents,
  onToolEvent,
} from "./toolEvents";
