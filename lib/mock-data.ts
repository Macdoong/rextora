import { getApiStatus } from "@/src/lib/rextora/apiStatusService";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";
import {
  aiBriefingSeed,
  alertHistorySeed,
  alertRulesSeed,
  botStatusSeed,
  dashboardDataSeed,
  emergencyActionsSeed,
  positionsSeed,
  preservedStrategies,
  riskStatusSeed,
  scalpingDashboardSeed
} from "@/src/lib/rextora/seedData";

export const safeBaselineStrategy = preservedStrategies[0];
export const strategies = preservedStrategies;
export const defaultRiskStatus = riskStatusSeed;
export const defaultApiStatus = getApiStatus();
export const defaultChecklist = {
  exchangeConnectionNormal: defaultApiStatus.binanceFuturesConnected,
  balanceFetchNormal: defaultApiStatus.readPermission === "정상",
  accountReadNormal: defaultApiStatus.readPermission === "정상",
  orderPermissionNormal: defaultApiStatus.orderPermission === "정상",
  futuresPermissionNormal: defaultApiStatus.futuresPermission === "정상",
  serverTpSlEnabled: defaultApiStatus.serverTpSlActive,
  liveSettingEnabled: false,
  emergencyStopActive: false,
  candidateReady: false
};
export const botStatus = botStatusSeed;
export const currentPosition = positionsSeed[0];
export const alertRules = alertRulesSeed;
export const alertHistory = alertHistorySeed;
export const aiBriefing = aiBriefingSeed;
export const emergencyActions = emergencyActionsSeed;
export const dashboardData = { ...dashboardDataSeed, api: defaultApiStatus };
export const scalpingDashboard = { ...scalpingDashboardSeed, api: defaultApiStatus, topCandidates: getTopCandidates(5) };
