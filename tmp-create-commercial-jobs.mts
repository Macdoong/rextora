/**
 * Disposable FINAL_COMMERCIAL_READY_* job creation via official HTTP API only.
 * Does NOT run in-process orchestrator — production server owns execution.
 */
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "./components/rextora/strategySearch/formDefaults.ts";
import type { PatternCombinationBlockConfig } from "./components/rextora/strategySearch/types.ts";

const BASE = "http://localhost:3000";

function blocks(
  families: Array<
    "order_block" | "fvg" | "trendline" | "support_resistance"
  >,
  roles: Array<
    | "entry_zone"
    | "trend_filter"
    | "confirmation"
    | "invalidation"
  >,
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

function baseForm(name: string) {
  const form = createDefaultOperatorFormState();
  form.searchName = name;
  form.durationPreset = "60";
  form.maxRuntimeMinutesOverride = "60";
  form.depthProfile = "fast";
  form.qualificationProfile = "aggressive";
  form.autoStrategyCombo = false;
  form.marketMode = "recommended";
  form.manualSymbol = "BTCUSDT";
  form.timeframe = "15m";
  form.stressEnabled = true;
  form.jitterEnabled = true;
  form.costValidationEnabled = true;
  form.robustnessValidationEnabled = true;
  return form;
}

type Scenario = {
  name: string;
  configure: (form: ReturnType<typeof createDefaultOperatorFormState>) => void;
};

const scenarios: Scenario[] = [
  {
    name: "FINAL_COMMERCIAL_READY_SEQUENCE",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "automatic";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "sequence";
      form.patternCombinationTemplate = "ordered_sequence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "confirmation"],
      );
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_4PATTERN",
    configure(form) {
      form.patternConfigLevel = "automatic";
      form.leverageMode = "automatic";
      form.selectedSpaceIds = [
        "order_block",
        "fvg",
        "trendline",
        "support_resistance",
      ];
      form.patternCombinationFamilies = [
        "order_block",
        "fvg",
        "trendline",
        "support_resistance",
      ];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg", "trendline", "support_resistance"],
        ["entry_zone", "trend_filter", "confirmation", "invalidation"],
      );
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_CFG_AUTO",
    configure(form) {
      form.patternConfigLevel = "automatic";
      form.leverageMode = "automatic";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_CFG_EXPERT",
    configure(form) {
      form.patternConfigLevel = "expert";
      form.leverageMode = "automatic";
      form.patternExpiryBars = "72";
      form.patternConfirmationWindow = "6";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_LEV_FIXED",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "fixed";
      form.leverageFixed = "3";
      form.selectedSpaceIds = ["order_block"];
      form.patternCombinationFamilies = ["order_block"];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "single";
      form.patternCombinationBlocks = blocks(["order_block"], ["entry_zone"]);
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_LEV_RANGE",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "range";
      form.leverageMin = "2";
      form.leverageMax = "4";
      form.selectedSpaceIds = ["order_block"];
      form.patternCombinationFamilies = ["order_block"];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "single";
      form.patternCombinationBlocks = blocks(["order_block"], ["entry_zone"]);
    },
  },
  {
    name: "FINAL_COMMERCIAL_READY_LEV_DISABLED",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "disabled";
      form.selectedSpaceIds = ["order_block"];
      form.patternCombinationFamilies = ["order_block"];
      form.patternCombinationOperator = "and";
      form.patternCombinationTemplate = "single";
      form.patternCombinationBlocks = blocks(["order_block"], ["entry_zone"]);
    },
  },
];

async function post(path: string, body: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`${path} ${res.status}: ${text.slice(0, 200)}`);
  }
  if (!res.ok) {
    throw new Error(`${path} ${res.status}: ${JSON.stringify(json)}`);
  }
  return json as { ok: boolean; data: { id: string; status: string } };
}

const results: Array<{ name: string; jobId: string; status: string }> = [];

for (const scenario of scenarios) {
  const form = baseForm(scenario.name);
  scenario.configure(form);
  const body = operatorFormToCreateBody(form);
  const created = await post("/api/rextora/strategy-search", body);
  const jobId = created.data.id;
  await post(`/api/rextora/strategy-search/${jobId}/start`, {});
  results.push({ name: scenario.name, jobId, status: created.data.status });
  console.log(JSON.stringify({ name: scenario.name, jobId, create: created.data.status }));
}

console.log("---SUMMARY---");
console.log(JSON.stringify(results, null, 2));
