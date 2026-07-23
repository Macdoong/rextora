/**
 * HTTP helpers for Strategy Search routes (keeps code out of shared apiResponse.ts).
 */

import { NextResponse } from "next/server";
import { buildApiMeta, type RextoraApiResponse } from "../apiResponse";
import { StrategySearchApiError } from "./jobApiService";

export function strategySearchJson<T>(
  data: T,
  durationMs: number,
  init?: ResponseInit,
): NextResponse<RextoraApiResponse<T> & { code?: undefined }> {
  return NextResponse.json(
    {
      ok: true,
      data,
      meta: buildApiMeta({
        source: "rextora-strategy-search",
        cached: false,
        durationMs,
      }),
    },
    init,
  );
}

export function strategySearchError(
  err: unknown,
  durationMs: number,
): NextResponse<
  RextoraApiResponse<null> & { code: string; details?: string[] }
> {
  if (err instanceof StrategySearchApiError) {
    return NextResponse.json(
      {
        ok: false,
        data: null,
        meta: buildApiMeta({
          source: "rextora-strategy-search",
          cached: false,
          durationMs,
        }),
        error: err.message,
        code: err.code,
        ...(err.details.length > 0 ? { details: err.details } : {}),
      },
      { status: err.httpStatus },
    );
  }
  return NextResponse.json(
    {
      ok: false,
      data: null,
      meta: buildApiMeta({
        source: "rextora-strategy-search",
        cached: false,
        durationMs,
      }),
      error: err instanceof Error ? err.message : "strategy-search request failed",
      code: "INTERNAL_EXECUTION_FAILURE",
    },
    { status: 500 },
  );
}
