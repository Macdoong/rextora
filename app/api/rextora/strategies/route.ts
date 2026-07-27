import { NextResponse } from "next/server";
import {
  copyStrategy,
  createStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  restoreCloneFromSource,
  saveStrategy,
  setLiveActiveStrategy,
  setPaperActiveStrategy,
  updateStrategyDisplayMeta,
  validateStrategyById
} from "@/src/lib/rextora/strategy/strategyStore";
import {
  deleteStrategyWithSafety,
  detachResearchProvenance,
  previewStrategyDeletion,
} from "@/src/lib/rextora/strategySearch/strategyDeletionSafety";
import { listProductionStrategies } from "@/src/lib/rextora/strategy/strategyMetadata";
import type { SafeV44Params, StrategyTimeframe } from "@/src/lib/rextora/strategy/strategyTypes";
import type { CanonicalStrategyDefinition } from "@/src/lib/rextora/strategy/definition/types";
import { getSafeParamCatalog } from "@/src/lib/rextora/strategy/definition/safeParamCatalog";
import { StrategyValidationError } from "@/src/lib/rextora/strategy/definition/validator";
import { defaultDefinition } from "@/src/lib/rextora/strategy/definition/validator";
import { buildComboAwareStrategyName } from "@/src/lib/rextora/strategySearch/readableStrategyName";

function koreanError(error: unknown): string {
  if (error instanceof StrategyValidationError) return error.message;
  if (error instanceof Error) {
    if (error.message.includes("잠긴") || error.message.includes("원본")) return error.message;
    if (error.message.includes("id required")) return "전략 고유번호가 필요합니다.";
    if (error.message.includes("unknown action")) return "알 수 없는 요청입니다.";
    return error.message;
  }
  return "요청을 처리할 수 없습니다.";
}

export async function GET(request: Request) {
  ensureStrategyStore();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  const catalog = searchParams.get("catalog");
  const includeTest = searchParams.get("includeTest") === "1";
  if (catalog === "safe_params") {
    return NextResponse.json({ ok: true, data: getSafeParamCatalog() });
  }
  if (id) {
    try {
      const strategy = getStrategyById(id);
      if (!strategy) return NextResponse.json({ ok: false, error: "전략을 찾을 수 없습니다." }, { status: 404 });
      return NextResponse.json({ ok: true, data: strategy });
    } catch (error) {
      return NextResponse.json({ ok: false, error: koreanError(error) }, { status: 400 });
    }
  }
  const data = includeTest ? listStrategies() : listProductionStrategies();
  return NextResponse.json({ ok: true, data });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action: string;
    id?: string;
    name?: string;
    description?: string;
    params?: SafeV44Params;
    patch?: Partial<{
      name: string;
      description: string;
      displayAlias: string | null;
      displayName: string | null;
      timeframe: StrategyTimeframe;
      params: SafeV44Params;
      definition: CanonicalStrategyDefinition;
      strategyType: "safe_params" | "condition_builder";
    }>;
    displayAlias?: string | null;
    displayName?: string | null;
    definition?: CanonicalStrategyDefinition;
    strategyType?: "safe_params" | "condition_builder";
    timeframe?: StrategyTimeframe;
    detachRefsFirst?: boolean;
    includeRelatedRecords?: boolean;
  };

  try {
    switch (body.action) {
      case "create": {
        const def =
          body.definition ??
          (body.strategyType === "condition_builder"
            ? defaultDefinition({
                strategyId: "pending",
                strategyName: body.name ?? "새 전략",
                strategyType: "condition_builder",
                timeframe: body.timeframe ?? "15m"
              })
            : undefined);
        return NextResponse.json({
          ok: true,
          data: createStrategy({
            name: body.name ?? "새 전략",
            description: body.description,
            params: body.params,
            strategyType: body.strategyType ?? "condition_builder",
            timeframe: body.timeframe,
            definition: def
          })
        });
      }
      case "copy":
      case "clone":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({ ok: true, data: copyStrategy(body.id, body.name) });
      case "save":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({
          ok: true,
          data: saveStrategy(body.id, body.patch ?? { params: body.params, definition: body.definition })
        });
      case "rename_display": {
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({
          ok: true,
          data: updateStrategyDisplayMeta(body.id, {
            displayAlias:
              body.displayAlias !== undefined
                ? body.displayAlias
                : body.patch?.displayAlias,
            displayName:
              body.displayName !== undefined
                ? body.displayName
                : body.patch?.displayName,
            description: body.description ?? body.patch?.description,
            name: body.name ?? body.patch?.name,
          }),
        });
      }
      case "restore_alias": {
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({
          ok: true,
          data: updateStrategyDisplayMeta(body.id, { displayAlias: null }),
        });
      }
      case "regenerate_auto_name": {
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        const strategy = getStrategyById(body.id);
        if (!strategy) throw new StrategyValidationError("전략을 찾을 수 없습니다.");
        const automaticName = buildComboAwareStrategyName({
          params: strategy.params as unknown as Record<string, unknown>,
          symbol: strategy.symbols?.[0] ?? "BTCUSDT",
          timeframe: strategy.timeframe,
        });
        return NextResponse.json({
          ok: true,
          // Deliberately preserve editable displayName; regenerate alias only.
          data: updateStrategyDisplayMeta(body.id, {
            displayAlias: automaticName,
          }),
        });
      }
      case "delete":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        if (body.detachRefsFirst === true || body.includeRelatedRecords === true) {
          deleteStrategyWithSafety(body.id, {
            detachRefsFirst: body.detachRefsFirst === true,
            includeRelatedRecords: body.includeRelatedRecords === true,
          });
        } else {
          const impact = previewStrategyDeletion(body.id);
          if (impact.classification === "absolute_protect") {
            throw new StrategyValidationError(impact.reasonsKo[0] ?? "삭제할 수 없습니다.");
          }
          if (impact.classification === "detach_then_delete") {
            throw new StrategyValidationError(
              `${impact.reasonsKo[0]} ${impact.nextActionKo}`,
            );
          }
          deleteStrategyWithSafety(body.id);
        }
        return NextResponse.json({ ok: true });
      case "deletion_impact":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({
          ok: true,
          data: previewStrategyDeletion(body.id),
        });
      case "detach_research_provenance":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({
          ok: true,
          data: detachResearchProvenance(body.id),
        });
      case "apply_paper":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({ ok: true, data: setPaperActiveStrategy(body.id) });
      case "apply_live":
      case "mark_live_candidate":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({ ok: true, data: setLiveActiveStrategy(body.id) });
      case "validate":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({ ok: true, data: validateStrategyById(body.id) });
      case "restore":
        if (!body.id) throw new StrategyValidationError("전략 고유번호가 필요합니다.");
        return NextResponse.json({ ok: true, data: restoreCloneFromSource(body.id) });
      default:
        throw new StrategyValidationError("알 수 없는 요청입니다.");
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: koreanError(error) }, { status: 400 });
  }
}
