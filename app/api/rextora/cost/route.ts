import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { calculateCostBreakdown } from "@/src/lib/rextora/costEngine";
import { getTopCandidates } from "@/src/lib/rextora/aiRanker";

export async function GET() {
  const start = Date.now();

  try {
    const candidates = getTopCandidates(5);
    const breakdowns = candidates.map((c) =>
      calculateCostBreakdown({ symbol: c.symbol, expectedProfitPct: c.expectedProfitPct })
    );

    return apiJsonResponse(
      { candidates, breakdowns },
      {
        source: "cost-engine",
        cached: true,
        durationMs: Date.now() - start,
        updatedAt: new Date().toISOString()
      }
    );
  } catch (error) {
    return apiErrorResponse(error instanceof Error ? error.message : "cost analysis failed", Date.now() - start);
  }
}
