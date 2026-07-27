/**
 * FINAL_RELEASE acceptance matrix — official HTTP API only (production server owns execution).
 * Disposable records prefixed FINAL_RELEASE_.
 */
import {
  createDefaultOperatorFormState,
  operatorFormToCreateBody,
} from "./components/rextora/strategySearch/formDefaults.ts";
import type { PatternCombinationBlockConfig } from "./components/rextora/strategySearch/types.ts";
import fs from "node:fs";

const BASE = "http://localhost:3000";
const OUT = "tmp-final-release-evidence.json";

function blocks(
  families: Array<"order_block" | "fvg" | "trendline" | "support_resistance">,
  roles: Array<"entry_zone" | "trend_filter" | "confirmation" | "invalidation">,
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
  return form;
}

type Scenario = {
  name: string;
  configure: (form: ReturnType<typeof createDefaultOperatorFormState>) => void;
};

const scenarios: Scenario[] = [
  {
    name: "FINAL_RELEASE_CFG_BASIC",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.patternStrength = "strict";
      form.patternRetestMode = "required";
      form.leverageMode = "automatic";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_RELEASE_CFG_EXPERT",
    configure(form) {
      form.patternConfigLevel = "expert";
      form.patternExpiryBars = "72";
      form.patternConfirmationWindow = "6";
      form.leverageMode = "automatic";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_RELEASE_OP_SEQUENCE",
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
    name: "FINAL_RELEASE_LEV_FIXED",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "fixed";
      form.leverageFixed = "3";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_RELEASE_LEV_RANGE",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "range";
      form.leverageMin = "2";
      form.leverageMax = "4";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_RELEASE_LEV_DISABLED",
    configure(form) {
      form.patternConfigLevel = "basic";
      form.leverageMode = "disabled";
      form.selectedSpaceIds = ["order_block", "fvg"];
      form.patternCombinationFamilies = ["order_block", "fvg"];
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg"],
        ["entry_zone", "trend_filter"],
      );
    },
  },
  {
    name: "FINAL_RELEASE_PAT_FULL",
    configure(form) {
      form.patternConfigLevel = "basic";
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
      form.patternCombinationOperator = "or";
      form.patternCombinationTemplate = "confluence";
      form.patternCombinationBlocks = blocks(
        ["order_block", "fvg", "trendline", "support_resistance"],
        ["entry_zone", "trend_filter", "confirmation", "invalidation"],
      );
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

async function getJob(jobId: string) {
  const res = await fetch(`${BASE}/api/rextora/strategy-search/${jobId}`);
  const json = (await res.json()) as { data?: Record<string, unknown> };
  return json.data ?? (json as Record<string, unknown>);
}

async function waitTerminal(jobId: string, maxMs = 600_000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const j = await getJob(jobId);
    const status = String(j.status);
    if (
      ["completed", "failed", "cancelled"].includes(status) ||
      (status === "completed" && j.finishedAt)
    ) {
      return j;
    }
    if (status === "failed" || status === "cancelled") return j;
    // Also treat completed from disk
    if (status === "completed") return j;
    await new Promise((r) => setTimeout(r, 5000));
  }
  return getJob(jobId);
}

const evidence: Record<string, unknown> = {
  buildId: fs.readFileSync(".next/BUILD_ID", "utf8").trim(),
  createdAt: new Date().toISOString(),
  jobs: [] as unknown[],
};

for (const scenario of scenarios) {
  const form = baseForm(scenario.name);
  scenario.configure(form);
  const body = operatorFormToCreateBody(form);
  const created = await post("/api/rextora/strategy-search", body);
  const jobId = created.data.id;
  await post(`/api/rextora/strategy-search/${jobId}/start`, {});
  console.log("started", scenario.name, jobId);
  const terminal = await waitTerminal(jobId);
  const planPath = `data/rextora/strategy-search/jobs/${jobId}.plan.json`;
  const plan = fs.existsSync(planPath)
    ? JSON.parse(fs.readFileSync(planPath, "utf8"))
    : null;
  const cp = terminal.checkpoint as { statistics?: { errors?: number } } | undefined;
  evidence.jobs.push({
    name: scenario.name,
    jobId,
    status: terminal.status,
    failureMessage: terminal.failureMessage,
    evaluated: terminal.evaluatedCount,
    qualified: terminal.qualifiedCount,
    errors: cp?.statistics?.errors ?? null,
    plan: plan
      ? {
          patternConfigLevel: plan.patternConfigLevel,
          operator: plan.patternCombinationOperator,
          leverageMode: plan.leverageMode,
          leverageMin: plan.leverageMin,
          leverageMax: plan.leverageMax,
          leverageFixed: plan.leverageFixed,
          families: plan.patternCombinationFamilies,
        }
      : null,
  });
  console.log(
    JSON.stringify({
      name: scenario.name,
      jobId,
      status: terminal.status,
      errors: cp?.statistics?.errors,
    }),
  );
}

fs.writeFileSync(OUT, JSON.stringify(evidence, null, 2));
console.log("WROTE", OUT);
