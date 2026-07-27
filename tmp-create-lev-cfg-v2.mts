/**
 * Create remaining leverage-mode jobs one-by-one via official API.
 */
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "./components/rextora/strategySearch/formDefaults.ts";
import type { PatternCombinationBlockConfig } from "./components/rextora/strategySearch/types.ts";

const BASE = "http://localhost:3000";

function blocks(
  families: Array<"order_block" | "fvg">,
  roles: Array<"entry_zone" | "trend_filter">,
): PatternCombinationBlockConfig[] {
  return families.map((family, order) => ({
    id: `${family}_${order}`,
    family,
    role: roles[order] ?? "trend_filter",
    order,
    required: true,
    weight: 1,
    priority: order,
    params: {},
  }));
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(`${path} ${res.status} ${JSON.stringify(json)}`);
  return json as { ok: boolean; data: { id: string } };
}

const modes = [
  {
    name: "FINAL_COMMERCIAL_READY_LEV_FIXED_V2",
    configure(form: ReturnType<typeof createDefaultOperatorFormState>) {
      form.leverageMode = "fixed";
      form.leverageFixed = "3";
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_LEV_RANGE_V2",
    configure(form: ReturnType<typeof createDefaultOperatorFormState>) {
      form.leverageMode = "range";
      form.leverageMin = "2";
      form.leverageMax = "4";
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_LEV_DISABLED_V2",
    configure(form: ReturnType<typeof createDefaultOperatorFormState>) {
      form.leverageMode = "disabled";
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_CFG_BASIC_V2",
    configure(form: ReturnType<typeof createDefaultOperatorFormState>) {
      form.patternConfigLevel = "basic";
      form.patternStrength = "strict";
      form.patternRetestMode = "required";
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_CFG_EXPERT_V2",
    configure(form: ReturnType<typeof createDefaultOperatorFormState>) {
      form.patternConfigLevel = "expert";
      form.patternExpiryBars = "72";
      form.patternConfirmationWindow = "6";
    },
  },
] as const;

for (const mode of modes) {
  const form = createDefaultOperatorFormState();
  form.searchName = mode.name;
  form.durationPreset = "60";
  form.maxRuntimeMinutesOverride = "45";
  form.depthProfile = "fast";
  form.qualificationProfile = "aggressive";
  form.autoStrategyCombo = false;
  form.timeframe = "15m";
  form.stressEnabled = true;
  form.jitterEnabled = true;
  form.patternConfigLevel = "basic";
  form.leverageMode = "automatic";
  form.selectedSpaceIds = ["order_block", "fvg"];
  form.patternCombinationFamilies = ["order_block", "fvg"];
  form.patternCombinationOperator = "or";
  form.patternCombinationTemplate = "confluence";
  form.patternCombinationBlocks = blocks(
    ["order_block", "fvg"],
    ["entry_zone", "trend_filter"],
  );
  mode.configure(form);
  const created = await post(
    "/api/rextora/strategy-search",
    operatorFormToCreateBody(form),
  );
  await post(`/api/rextora/strategy-search/${created.data.id}/start`, {});
  console.log(JSON.stringify({ name: mode.name, jobId: created.data.id }));
  await new Promise((r) => setTimeout(r, 2000));
}
