/**
 * Agent V2 Reasoning feature flags — SERVER-SIDE ONLY.
 *
 * Activation is settings/credential driven. Legacy AGENT_V2_REASONING_ENABLED
 * remains as a force-enable hint inside providerRuntimeConfig.
 * AGENT_V2_REASONING_EMERGENCY_DISABLE / settings.emergencyDisabled hard-stop.
 */

import { isProviderRuntimeActive } from "../providers/providerRuntimeConfig";

export type ReasoningMode = "disabled" | "shadow" | "enabled";

export interface ReasoningConfig {
  mode: ReasoningMode;
  /** Minimum LLM confidence to accept reasoning (0–1). */
  minConfidence: number;
  /** Max conversation turns sent to the reasoning provider. */
  maxHistoryTurns: number;
  /** Max verified facts in reasoning input. */
  maxFacts: number;
}

function envFlag(name: string): boolean {
  const v = process.env[name]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export function getReasoningConfig(): ReasoningConfig {
  const shadow = envFlag("AGENT_V2_REASONING_SHADOW");
  const forceEnabled = envFlag("AGENT_V2_REASONING_ENABLED");
  const runtimeActive = isProviderRuntimeActive();

  let mode: ReasoningMode = "disabled";
  if (runtimeActive || forceEnabled) {
    mode = shadow && !forceEnabled ? "shadow" : "enabled";
  } else if (shadow) {
    mode = "shadow";
  }

  // If runtime is active, prefer primary (enabled) over shadow-only unless
  // AGENT_V2_REASONING_SHADOW is set without ENABLED and without settings.
  if (runtimeActive && !shadow) mode = "enabled";
  if (runtimeActive && shadow && forceEnabled) mode = "enabled";

  const minRaw = process.env.AGENT_V2_REASONING_MIN_CONFIDENCE?.trim();
  const minConfidence = minRaw ? Math.min(1, Math.max(0, Number(minRaw))) : 0.55;

  return {
    mode,
    minConfidence: Number.isFinite(minConfidence) ? minConfidence : 0.55,
    maxHistoryTurns: 6,
    maxFacts: 24,
  };
}

export function isReasoningActive(): boolean {
  const { mode } = getReasoningConfig();
  return mode === "enabled" || mode === "shadow";
}

export function isReasoningPrimary(): boolean {
  return getReasoningConfig().mode === "enabled";
}
