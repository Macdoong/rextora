import { preflightLiveExecution } from "./liveExecutionEngine";
import { startLiveBotRuntime, stopBotRuntime } from "./botRuntime";
import type { EngineResult } from "./types";

export function preflightLiveStart() {
  const preflight = preflightLiveExecution();
  return preflight;
}

export async function startLiveBot(): Promise<EngineResult> {
  return startLiveBotRuntime();
}

export async function stopLiveBot(): Promise<EngineResult> {
  return stopBotRuntime();
}
