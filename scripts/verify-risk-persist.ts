import { updateRiskSettings } from "../src/lib/rextora/riskManager";
import { loadRiskState } from "../src/lib/rextora/riskStateStore";

const probe = {
  dailyLossLimitPct: -4.25,
  totalLossLimitPct: -9.5,
  consecutiveLossLimit: 4,
  maxDailyTrades: 17,
  maxLeverage: 2.2,
  maxSimultaneousPositions: 1,
  maxPositionSizePerCoinPct: 2.75,
  overtradingCooldownMinutes: 18,
};

const saved = updateRiskSettings(probe);
console.log("SAVE_OK", JSON.stringify(saved.settings));

const reloaded = loadRiskState();
const match =
  reloaded.settings.dailyLossLimitPct === -4.25 &&
  reloaded.settings.maxDailyTrades === 17 &&
  reloaded.settings.maxLeverage === 2.2 &&
  reloaded.settings.overtradingCooldownMinutes === 18;

console.log("RELOAD_MATCH", match);
console.log("RELOADED", JSON.stringify(reloaded.settings));

if (!match) process.exit(1);
