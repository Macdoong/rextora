import { pathToFileURL } from "node:url";
import path from "node:path";
const ROOT = process.cwd();
const imp = (rel) => import(pathToFileURL(path.join(ROOT, rel)).href);

const { buildCombinedEventSequence, buildCombinationSpec } = await imp(
  "src/lib/rextora/strategySearch/patternCombination.ts",
);
const { defaultDefinition } = await imp("src/lib/rextora/strategy/definition/validator.ts");
const { runEventSequenceBacktest } = await imp(
  "src/lib/rextora/strategy/eventSequenceBacktest.ts",
);
const { generateSyntheticCandles } = await imp("src/lib/rextora/data/ohlcvTypes.ts");

function comboDef(operator, families, failurePolicy = "any") {
  const spec = buildCombinationSpec({
    templateId: "confluence",
    families,
    operator,
  });
  if (failurePolicy !== "any") {
    spec.failurePolicy = failurePolicy;
    spec.invalidationMode = failurePolicy;
  }
  return {
    spec,
    def: defaultDefinition({
      strategyId: "trace",
      strategyName: "trace",
      timeframe: "15m",
      eventSequence: buildCombinedEventSequence(spec),
    }),
  };
}

const candles = generateSyntheticCandles(400, 100, 0.0015, {
  startOpenTime: Date.UTC(2024, 0, 1),
  intervalMs: 900_000,
});

function sample(key, operator, families, failurePolicy = "any") {
  const { spec, def } = comboDef(operator, families, failurePolicy);
  const bt = runEventSequenceBacktest({
    def,
    symbol: "BTCUSDT",
    candles,
    balance: 10_000,
    feeRate: 0.0004,
    slippageRate: 0.0002,
  });
  const reject =
    bt.rejectedSetups.find((r) => (r.patternBlocks?.length ?? 0) >= 2) ??
    bt.rejectedSetups[0] ??
    null;
  return {
    key,
    definition: {
      combination: {
        operator: spec.operator,
        failurePolicy: spec.failurePolicy,
        invalidationMode: spec.invalidationMode,
        blocks: spec.blocks.map((b) => ({
          family: b.family,
          role: b.role,
          required: b.required,
          order: b.order,
        })),
      },
    },
    backtest: {
      tradeCount: bt.trades.length,
      rejectedCount: bt.rejectedSetups.length,
    },
    evidence: reject
      ? {
          combinationOperator: reject.combinationOperator ?? null,
          combinationResult: reject.combinationResult ?? null,
          combinationFailurePolicy: reject.combinationFailurePolicy ?? null,
          combinationInvalidationMode: reject.combinationInvalidationMode ?? null,
          patternBlocks: reject.patternBlocks?.map((b) => ({
            family: b.family,
            role: b.role,
            required: b.required,
            order: b.order,
            status: b.status,
            operatorPassed: b.operatorPassed ?? null,
            operator: b.operator ?? null,
            reasonCode: b.reasonCode ?? null,
          })),
          reasonCode: reject.reasonCode ?? null,
        }
      : null,
  };
}

console.log(
  JSON.stringify(
    {
      A: sample("A", "and", ["order_block"]),
      B: sample("B", "and", ["order_block", "fvg"], "majority"),
      C: sample("C", "or", ["fvg", "trendline"]),
    },
    null,
    2,
  ),
);
