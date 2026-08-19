"use strict";

const path = require("node:path");

function rextoraDataRoot() {
  const override = process.env.REXTORA_DATA_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(process.cwd(), "data", "rextora");
}

function productionRextoraDataRootCanonical() {
  return path.join(process.cwd(), "data", "rextora");
}

function strategySearchRoot() {
  const override = process.env.REXTORA_STRATEGY_SEARCH_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "strategy-search");
}

function backtestsRoot() {
  const override = process.env.REXTORA_BACKTESTS_DIR?.trim();
  if (override) return path.resolve(override);
  return path.join(rextoraDataRoot(), "backtests");
}

function strategiesRootDefault() {
  return path.join(rextoraDataRoot(), "strategies");
}

function productionStrategiesRootCanonical() {
  return path.join(productionRextoraDataRootCanonical(), "strategies");
}

function paperSessionsRootDefault() {
  return path.join(rextoraDataRoot(), "paper-sessions");
}

function firstRunStatePath() {
  return path.join(rextoraDataRoot(), "first-run.json");
}

module.exports = Object.freeze({
  backtestsRoot,
  firstRunStatePath,
  paperSessionsRootDefault,
  productionRextoraDataRootCanonical,
  productionStrategiesRootCanonical,
  rextoraDataRoot,
  strategiesRootDefault,
  strategySearchRoot,
});
