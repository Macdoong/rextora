import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { getTopCandidates, rankCandidates, getCandidateSnapshotAgeMs } from "@/src/lib/rextora/aiRanker";

export async function GET(request: Request) {
  const start = Date.now();
  const { searchParams } = new URL(request.url);
  const force = searchParams.get("force") === "true";
  const limit = Math.min(5, Math.max(1, Number(searchParams.get("limit") ?? 5)));

  try {
    const candidates = force ? rankCandidates(limit, { force: true }) : getTopCandidates(limit);
    const ageMs = getCandidateSnapshotAgeMs();

    return apiJsonResponse(
      { candidates },
      {
        source: "candidate-cache",
        cached: !force && Number.isFinite(ageMs) && ageMs < 60_000,
        durationMs: Date.now() - start,
        updatedAt: Number.isFinite(ageMs) ? new Date(Date.now() - ageMs).toISOString() : new Date().toISOString()
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "candidates fetch failed", Date.now() - start);
  }
}
