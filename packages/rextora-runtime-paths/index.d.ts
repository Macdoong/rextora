interface RuntimePaths {
  backtestsRoot(): string;
  firstRunStatePath(): string;
  paperSessionsRootDefault(): string;
  productionRextoraDataRootCanonical(): string;
  productionStrategiesRootCanonical(): string;
  rextoraDataRoot(): string;
  strategiesRootDefault(): string;
  strategySearchRoot(): string;
}

declare const runtimePaths: Readonly<RuntimePaths>;

export = runtimePaths;
