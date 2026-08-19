import crypto from "node:crypto";
import { applyAgentEvent, createAgentEvent } from "./lifecycleService";

export interface SearchLifecycleSnapshot {
  status: string;
  progress: number | null;
}

export function startBoundedSearchLifecycleWatcher(input: {
  sessionId: string;
  jobId: string;
  readStatus: () => SearchLifecycleSnapshot | Promise<SearchLifecycleSnapshot>;
  intervalMs?: number;
  maxPolls?: number;
}): { stop: () => void; done: Promise<void> } {
  let stopped = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let polls = 0;
  let lastSignature = "";
  let resolveDone!: () => void;
  const done = new Promise<void>((resolve) => { resolveDone = resolve; });
  const finish = () => {
    if (stopped) return;
    stopped = true;
    if (timer) clearTimeout(timer);
    resolveDone();
  };
  const poll = async () => {
    if (stopped) return;
    polls += 1;
    try {
      const snapshot = await input.readStatus();
      const signature = `${snapshot.status}:${snapshot.progress ?? ""}`;
      if (signature !== lastSignature) {
        lastSignature = signature;
        const type = snapshot.status === "completed" ? "search.completed"
          : snapshot.status === "failed" ? "search.failed"
            : snapshot.status === "cancelled" ? "search.cancelled"
              : snapshot.status === "paused" ? "search.paused"
                : "search.progress";
        applyAgentEvent(createAgentEvent({
          eventId: `watch_${crypto.createHash("sha256").update(`${input.jobId}:${signature}`).digest("hex").slice(0, 20)}`,
          type,
          sessionId: input.sessionId,
          entityId: input.jobId,
          taskId: null,
          source: "engine_store",
          payload: { status: snapshot.status, progress: snapshot.progress },
        }));
      }
      if (["completed", "failed", "cancelled"].includes(snapshot.status)) return finish();
    } catch {
      // A transient store read does not create a false failed event.
    }
    if (polls >= (input.maxPolls ?? 180)) return finish();
    timer = setTimeout(poll, input.intervalMs ?? 1_000);
    timer.unref?.();
  };
  void poll();
  return { stop: finish, done };
}
