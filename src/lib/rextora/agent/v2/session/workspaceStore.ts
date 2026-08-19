/**
 * Workspace store helpers — build & extract workspace fields from session records.
 */

import type { ConversationEntityMemory } from "../../conversationContext";
import type { MissionTimeline } from "../../missionTimeline";
import type { ProposedAction } from "../../proposedAction";
import type { ResearchWorkspaceSummary } from "../../researchWorkspace";
import type { AgentLifecycleContext } from "../../types";
import type { AgentSessionRecord, AgentWorkspaceSnapshot } from "./sessionTypes";
import { buildWorkspaceSnapshot } from "./workspaceMerge";

export function extractWorkspaceFromSession(
  record: AgentSessionRecord,
): AgentWorkspaceSnapshot {
  return record.workspace;
}

export function syncWorkspaceFromClientState(input: {
  record: AgentSessionRecord;
  context?: AgentLifecycleContext | null;
  entityMemory?: ConversationEntityMemory | null;
  researchWorkspace?: ResearchWorkspaceSummary | null;
  pendingApproval?: ProposedAction | null;
  missionTimeline?: MissionTimeline | null;
}): AgentWorkspaceSnapshot {
  return buildWorkspaceSnapshot({
    context: input.context,
    entityMemory: input.entityMemory ?? input.record.entityMemory,
    researchWorkspace:
      input.researchWorkspace ?? input.record.workspace.researchWorkspace,
    pendingApproval:
      input.pendingApproval ?? input.record.pendingApproval,
    missionTimeline: input.missionTimeline ?? input.record.missionTimeline,
    now: new Date().toISOString(),
  });
}

export function workspaceMatchesRoute(
  workspace: AgentWorkspaceSnapshot,
  route: string | null | undefined,
): boolean {
  if (!route) return true;
  return workspace.currentPage === route || workspace.lastRoute === route;
}
