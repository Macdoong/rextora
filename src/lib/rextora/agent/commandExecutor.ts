/**
 * Execute approved typed commands through existing application services.
 * Never Live, never exchange orders, never SAFE mutation.
 */

import {
  createStrategySearchJobApi,
  startStrategySearchJobApi,
} from "@/src/lib/rextora/strategySearch/jobApiService";
import { runAndSaveBacktest } from "@/src/lib/rextora/backtest/backtestRunner";
import type { BacktestConfig } from "@/src/lib/rextora/backtest/backtestTypes";
import { preparePaperFromResults } from "@/src/lib/rextora/paper/paperSessionService";
import { getStrategyById } from "@/src/lib/rextora/strategy/strategyStore";
import {
  isCommandExpired,
  markApproved,
  markExecuted,
  markFailed,
  validateCommandSchema,
  type TypedCommand,
} from "./typedCommand";
import { findByIdempotencyKey, saveCommand } from "./commandStore";

export interface CommandExecutionResult {
  command: TypedCommand;
  alreadyExecuted: boolean;
  summaryKo: string;
}

export async function executeApprovedCommand(
  draft: TypedCommand,
): Promise<CommandExecutionResult> {
  const schema = validateCommandSchema(draft);
  if (!schema.ok) {
    const failed = markFailed(
      draft,
      "SCHEMA_INVALID",
      schema.issues.join("; "),
    );
    saveCommand(failed);
    return {
      command: failed,
      alreadyExecuted: false,
      summaryKo: `명령 검증 실패: ${schema.issues.join(", ")}`,
    };
  }

  if (isCommandExpired(draft)) {
    const expired: TypedCommand = {
      ...draft,
      approvalStatus: "expired",
      executionStatus: "failed",
      errorCode: "EXPIRED",
      errorMessage: "승인 유효 시간이 만료되었습니다. 계획을 다시 준비하세요.",
    };
    saveCommand(expired);
    return {
      command: expired,
      alreadyExecuted: false,
      summaryKo: "승인이 만료되었습니다. 새 계획을 준비해 주세요.",
    };
  }

  // Prefer idempotency match even when the client resends the pending draft.
  const prior = findByIdempotencyKey(draft.idempotencyKey);
  if (
    prior &&
    (prior.executionStatus === "succeeded" ||
      prior.executionStatus === "skipped_idempotent") &&
    prior.resultReference
  ) {
    const skipped: TypedCommand = {
      ...markExecuted(
        {
          ...draft,
          approvalStatus: "approved",
          approvedAt: draft.approvedAt ?? new Date().toISOString(),
          parameters: {
            ...draft.parameters,
            ...prior.parameters,
            exchangeCalled: false,
            executorStarted: false,
          },
        },
        {
          executionStatus: "skipped_idempotent",
          jobId: prior.jobId,
          runId: prior.runId,
          resultReference: prior.resultReference,
        },
      ),
    };
    saveCommand(skipped);
    return {
      command: skipped,
      alreadyExecuted: true,
      summaryKo: `이미 실행된 동일 명령입니다. 결과: ${prior.resultReference}`,
    };
  }

  let approved = markApproved(draft);
  approved = { ...approved, executionStatus: "running" };
  saveCommand(approved);

  try {
    switch (approved.commandType) {
      case "create_strategy_search_job": {
        const body = approved.parameters.createBody ?? approved.parameters;
        const job = createStrategySearchJobApi(body);
        const started = startStrategySearchJobApi(job.id);
        const done = markExecuted(approved, {
          jobId: started.id ?? job.id,
          resultReference: `job:${started.id ?? job.id}`,
          executionStatus: "succeeded",
        });
        saveCommand(done);
        return {
          command: done,
          alreadyExecuted: false,
          summaryKo: `탐색 작업을 생성하고 시작했습니다. 작업 ID: ${done.jobId}. 상태: ${started.status ?? "queued/running"}.`,
        };
      }
      case "run_backtest": {
        const strategyId = String(
          approved.strategyId ?? approved.parameters.strategyId ?? "",
        );
        if (!strategyId) {
          throw new Error("strategyId가 필요합니다.");
        }
        const strategy = getStrategyById(strategyId);
        if (!strategy) throw new Error("전략을 찾을 수 없습니다.");
        const symbols = Array.isArray(approved.parameters.symbols)
          ? (approved.parameters.symbols as string[])
          : [String(approved.symbol ?? "BTCUSDT")];
        const config: BacktestConfig = {
          strategyId,
          symbols,
          timeframe: String(
            approved.timeframe ??
              approved.parameters.timeframe ??
              strategy.timeframe ??
              "15m",
          ) as BacktestConfig["timeframe"],
          fromOpenTime:
            typeof approved.parameters.fromOpenTime === "number"
              ? approved.parameters.fromOpenTime
              : undefined,
          toOpenTime:
            typeof approved.parameters.toOpenTime === "number"
              ? approved.parameters.toOpenTime
              : undefined,
          balance:
            typeof approved.parameters.balance === "number"
              ? approved.parameters.balance
              : 10_000,
          feeRate:
            typeof approved.parameters.feeRate === "number"
              ? approved.parameters.feeRate
              : 0.0004,
          slippageRate:
            typeof approved.parameters.slippageRate === "number"
              ? approved.parameters.slippageRate
              : 0.0002,
          fundingRate: 0.0001,
          applyFunding: false,
          applySpread: false,
          spreadRate: 0.0001,
          costStressMultipliers: [1, 1.5, 2],
          costGuardK: 3,
          dataMode: "binance",
        };
        const result = await runAndSaveBacktest(config);
        const runId = result.saved?.id ?? null;
        const finalCmd: TypedCommand = {
          ...markExecuted(approved, {
            runId,
            resultReference: runId ? `run:${runId}` : `strategy:${strategyId}`,
            executionStatus: "succeeded",
          }),
          strategyId,
          strategyHash:
            approved.strategyHash ??
            strategy.strategyHash ??
            strategy.paramsHash ??
            null,
        };
        saveCommand(finalCmd);
        return {
          command: finalCmd,
          alreadyExecuted: false,
          summaryKo: runId
            ? `백테스트를 실행하고 저장했습니다. 실행 ID: ${runId}. 전략: ${strategyId}.`
            : `백테스트를 실행했습니다. 전략: ${strategyId}.`,
        };
      }
      case "prepare_paper_session": {
        const strategyId = String(
          approved.strategyId ?? approved.parameters.strategyId ?? "",
        );
        if (!strategyId) throw new Error("strategyId가 필요합니다.");
        const prepared = preparePaperFromResults({
          strategyId,
          backtestRunId:
            (approved.parameters.backtestRunId as string | null | undefined) ??
            approved.runId ??
            null,
          backtestResultId:
            (approved.parameters.backtestResultId as string | null | undefined) ??
            null,
          symbol: approved.symbol ?? null,
          timeframe: approved.timeframe ?? null,
          sourceResearchJobId: null,
          sourceTrialIteration: null,
        });
        const status = prepared.session.status;
        if (status !== "pending_approval" && status !== "ready") {
          throw new Error(`예상치 못한 Paper 상태: ${status}`);
        }
        const sessionId = prepared.session.id;
        const finalCmd: TypedCommand = {
          ...markExecuted(approved, {
            resultReference: `paper:${sessionId}`,
            executionStatus: "succeeded",
          }),
          strategyId,
          parameters: {
            ...approved.parameters,
            paperStatus: status,
            exchangeCalled: false,
            executorStarted: false,
            paperApprovalDeepLink: prepared.paperApprovalDeepLink,
          },
        };
        saveCommand(finalCmd);
        return {
          command: finalCmd,
          alreadyExecuted: false,
          summaryKo: `Paper 세션을 승인 대기로 준비했습니다. 상태: ${status}. 실행기는 시작되지 않았습니다. exchangeCalled=false.`,
        };
      }
      default: {
        const failed = markFailed(
          approved,
          "UNSUPPORTED",
          "지원하지 않는 명령입니다.",
        );
        saveCommand(failed);
        return {
          command: failed,
          alreadyExecuted: false,
          summaryKo: "지원하지 않는 명령입니다.",
        };
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "실행 실패";
    const failed = markFailed(approved, "EXECUTION_FAILED", message);
    saveCommand(failed);
    return {
      command: failed,
      alreadyExecuted: false,
      summaryKo: `실행 실패: ${message}`,
    };
  }
}
