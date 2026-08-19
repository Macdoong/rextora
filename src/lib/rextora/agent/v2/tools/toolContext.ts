/**
 * Tool execution context — session-scoped, no secrets.
 */

import type { ConversationEntityMemory } from "../../conversationContext";
import type { AgentLifecycleContext } from "../../types";

export interface ToolContext {
  sessionId: string | null;
  /** Explicit approval grant for write tools. */
  approved: boolean;
  /** Optional approval ticket / command id for audit. */
  approvalId: string | null;
  lifecycleContext: AgentLifecycleContext | null;
  entityMemory: ConversationEntityMemory | null;
  /** Wall-clock now override for tests. */
  now?: () => Date;
}

export function createToolContext(
  partial: Partial<ToolContext> = {},
): ToolContext {
  return {
    sessionId: partial.sessionId ?? null,
    approved: partial.approved ?? false,
    approvalId: partial.approvalId ?? null,
    lifecycleContext: partial.lifecycleContext ?? null,
    entityMemory: partial.entityMemory ?? null,
    now: partial.now,
  };
}
