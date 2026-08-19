/**
 * In-process tool event bus for Agent V2.
 */

import type { ToolEvent } from "./toolTypes";

type ToolEventListener = (event: ToolEvent) => void;

const listeners = new Set<ToolEventListener>();
const recent: ToolEvent[] = [];
const MAX_RECENT = 200;

export function onToolEvent(listener: ToolEventListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function emitToolEvent(event: ToolEvent): void {
  recent.push(event);
  if (recent.length > MAX_RECENT) recent.shift();
  for (const listener of listeners) {
    try {
      listener(event);
    } catch {
      // never break tool execution on listener failure
    }
  }
}

export function getRecentToolEvents(limit = 50): ToolEvent[] {
  return recent.slice(-limit);
}

export function clearToolEventsForTests(): void {
  recent.length = 0;
  listeners.clear();
}
