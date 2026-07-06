import { alertHistorySeed, alertRulesSeed } from "./seedData";
import { loadAlertRules, saveAlertRules } from "./localStore";
import type { AlertHistoryItem, AlertRule } from "./types";

let history = [...alertHistorySeed];

export function getAlertRules(): AlertRule[] {
  return loadAlertRules();
}

export function createAlertRule(rule: Omit<AlertRule, "id" | "serviceState"> & { id?: string }): AlertRule {
  const next: AlertRule = {
    ...rule,
    id: rule.id ?? `rule-${Date.now()}`,
    serviceState: "mock"
  };
  saveAlertRules([next, ...getAlertRules()]);
  return next;
}

export function toggleAlertRule(id: string): AlertRule[] {
  const next = getAlertRules().map((rule) => (rule.id === id ? { ...rule, enabled: !rule.enabled } : rule));
  return saveAlertRules(next);
}

export function getAlertHistory(): AlertHistoryItem[] {
  return history;
}

export function evaluateMockAlertConditions(): AlertHistoryItem[] {
  const rules = getAlertRules().filter((rule) => rule.enabled);
  const generated = rules.slice(0, 1).map<AlertHistoryItem>((rule) => ({
    id: `alert-${Date.now()}`,
    time: "mock-now",
    asset: rule.asset,
    type: rule.type,
    message: `${rule.condition} 조건을 mock 평가했습니다.`,
    riskLevel: "중간",
    status: "mock",
    serviceState: "mock"
  }));
  history = [...generated, ...history];
  return generated;
}
