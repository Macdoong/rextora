import { NextResponse } from "next/server";
import {
  copyStrategy,
  createStrategy,
  deleteStrategy,
  ensureStrategyStore,
  getStrategyById,
  listStrategies,
  saveStrategy,
  setLiveActiveStrategy,
  setPaperActiveStrategy
} from "@/src/lib/rextora/strategy/strategyStore";
import type { SafeV44Params, StrategyTimeframe } from "@/src/lib/rextora/strategy/strategyTypes";

export async function GET(request: Request) {
  ensureStrategyStore();
  const { searchParams } = new URL(request.url);
  const id = searchParams.get("id");
  if (id) {
    const strategy = getStrategyById(id);
    if (!strategy) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, data: strategy });
  }
  return NextResponse.json({ ok: true, data: listStrategies() });
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    action: string;
    id?: string;
    name?: string;
    description?: string;
    params?: SafeV44Params;
    patch?: Partial<{ name: string; description: string; timeframe: StrategyTimeframe; params: SafeV44Params }>;
  };

  try {
    switch (body.action) {
      case "create":
        return NextResponse.json({ ok: true, data: createStrategy({ name: body.name ?? "새 전략", description: body.description, params: body.params }) });
      case "copy":
        if (!body.id) throw new Error("id required");
        return NextResponse.json({ ok: true, data: copyStrategy(body.id, body.name) });
      case "save":
        if (!body.id) throw new Error("id required");
        return NextResponse.json({ ok: true, data: saveStrategy(body.id, body.patch ?? { params: body.params }) });
      case "delete":
        if (!body.id) throw new Error("id required");
        deleteStrategy(body.id);
        return NextResponse.json({ ok: true });
      case "apply_paper":
        if (!body.id) throw new Error("id required");
        return NextResponse.json({ ok: true, data: setPaperActiveStrategy(body.id) });
      case "apply_live":
        if (!body.id) throw new Error("id required");
        return NextResponse.json({ ok: true, data: setLiveActiveStrategy(body.id) });
      default:
        throw new Error("unknown action");
    }
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "failed" }, { status: 400 });
  }
}
