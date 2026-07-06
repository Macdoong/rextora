import { NextResponse } from "next/server";

export type ApiMeta = {
  source: string;
  cached: boolean;
  durationMs: number;
  updatedAt: string | null;
};

export type RextoraApiResponse<T> = {
  ok: boolean;
  data: T;
  meta: ApiMeta;
  error?: string;
};

export function buildApiMeta(partial: Partial<ApiMeta> & { durationMs: number }): ApiMeta {
  return {
    source: partial.source ?? "rextora",
    cached: partial.cached ?? false,
    durationMs: partial.durationMs,
    updatedAt: partial.updatedAt ?? new Date().toISOString()
  };
}

export function apiJsonResponse<T>(
  data: T,
  meta: Partial<ApiMeta> & { durationMs: number; ok?: boolean },
  init?: ResponseInit
): NextResponse<RextoraApiResponse<T>> {
  const ok = meta.ok ?? true;
  return NextResponse.json(
    {
      ok,
      data,
      meta: buildApiMeta(meta)
    },
    init
  );
}

export function apiErrorResponse(message: string, durationMs: number, status = 500): NextResponse<RextoraApiResponse<null>> {
  return NextResponse.json(
    {
      ok: false,
      data: null,
      meta: buildApiMeta({ source: "rextora", cached: false, durationMs }),
      error: message
    },
    { status }
  );
}

export async function timedApiHandler<T>(
  fn: () => T | Promise<T>,
  meta?: Partial<ApiMeta>
): Promise<NextResponse<RextoraApiResponse<T | null>>> {
  const start = Date.now();
  try {
    const data = await fn();
    return apiJsonResponse(data, { ...meta, durationMs: Date.now() - start, ok: true });
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "request failed", Date.now() - start);
  }
}
