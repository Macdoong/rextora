/**
 * First-run state persistence (operator setup preferences).
 * Lives at data/rextora/first-run.json — never contains secrets.
 */

import fs from "node:fs";
import path from "node:path";
import { firstRunStatePath, rextoraDataRoot } from "../storage/runtimePaths";
import { DEMO_BUNDLE_ID } from "./demoIdentity";

export interface FirstRunPersistedState {
  version: 1;
  setupDismissedAt: string | null;
  setupCompletedAt: string | null;
  demoInitializedAt: string | null;
  demoBundleId: typeof DEMO_BUNDLE_ID | null;
  demoJobId: string | null;
  demoStrategyId: string | null;
  demoRunId: string | null;
  updatedAt: string;
}

export function emptyFirstRunState(): FirstRunPersistedState {
  const now = new Date().toISOString();
  return {
    version: 1,
    setupDismissedAt: null,
    setupCompletedAt: null,
    demoInitializedAt: null,
    demoBundleId: null,
    demoJobId: null,
    demoStrategyId: null,
    demoRunId: null,
    updatedAt: now,
  };
}

export function loadFirstRunState(): FirstRunPersistedState {
  const fp = firstRunStatePath();
  if (!fs.existsSync(fp)) return emptyFirstRunState();
  try {
    const raw = JSON.parse(fs.readFileSync(fp, "utf8")) as Partial<FirstRunPersistedState>;
    return {
      ...emptyFirstRunState(),
      ...raw,
      version: 1,
    };
  } catch {
    return emptyFirstRunState();
  }
}

export function saveFirstRunState(
  patch: Partial<FirstRunPersistedState>,
): FirstRunPersistedState {
  fs.mkdirSync(rextoraDataRoot(), { recursive: true });
  const current = loadFirstRunState();
  const next: FirstRunPersistedState = {
    ...current,
    ...patch,
    version: 1,
    updatedAt: new Date().toISOString(),
  };
  const fp = firstRunStatePath();
  const tmp = `${fp}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), "utf8");
  fs.renameSync(tmp, fp);
  return next;
}

export function clearFirstRunDemoPointers(): FirstRunPersistedState {
  return saveFirstRunState({
    demoInitializedAt: null,
    demoBundleId: null,
    demoJobId: null,
    demoStrategyId: null,
    demoRunId: null,
  });
}
