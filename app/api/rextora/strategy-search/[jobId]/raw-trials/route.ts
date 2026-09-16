import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";
import {
  executeRawTrialCleanup,
  getRawTrialRetentionPolicy,
  previewRawTrialCleanup,
  setRawTrialRetentionPolicy,
  type RawTrialRetentionPolicy,
} from "@/src/lib/rextora/strategySearch/rawTrialRetention";

type Ctx = { params: Promise<{ jobId: string }> };

const POLICIES = new Set<RawTrialRetentionPolicy>([
  "keep_indefinitely",
  "keep_30_days",
  "keep_7_days",
  "cleanup_after_top10",
]);

/** GET /api/rextora/strategy-search/[jobId]/raw-trials — cleanup preview */
export async function GET(_request: Request, context: Ctx) {
  const denied = await denyUnlessAuthenticated(_request);
  if (denied) return denied;

  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const preview = previewRawTrialCleanup(jobId);
    return strategySearchJson(
      {
        ...preview,
        policy: getRawTrialRetentionPolicy(),
      },
      Date.now() - start,
    );
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/**
 * POST /api/rextora/strategy-search/[jobId]/raw-trials
 * body: { action: "preview" | "cleanup" | "setPolicy", dryRun?: boolean, policy?: string }
 */
export async function POST(request: Request, context: Ctx) {
  const denied = await denyUnlessPermitted(request, "research:run");
  if (denied) return denied;
  const start = Date.now();
  try {
    const { jobId } = await context.params;
    const body = (await request.json().catch(() => null)) as {
      action?: string;
      dryRun?: boolean;
      policy?: string;
    } | null;
    const action = body?.action ?? "preview";

    if (action === "setPolicy") {
      const policy = body?.policy as RawTrialRetentionPolicy | undefined;
      if (!policy || !POLICIES.has(policy)) {
        throw new Error("invalid retention policy");
      }
      setRawTrialRetentionPolicy(policy);
      return strategySearchJson(
        { policy: getRawTrialRetentionPolicy(), jobId },
        Date.now() - start,
      );
    }

    if (action === "cleanup") {
      const result = executeRawTrialCleanup(jobId, {
        dryRun: body?.dryRun !== false ? true : false,
        policy: POLICIES.has(body?.policy as RawTrialRetentionPolicy)
          ? (body?.policy as RawTrialRetentionPolicy)
          : undefined,
      });
      return strategySearchJson(result, Date.now() - start);
    }

    const preview = previewRawTrialCleanup(jobId, {
      policy: POLICIES.has(body?.policy as RawTrialRetentionPolicy)
        ? (body?.policy as RawTrialRetentionPolicy)
        : undefined,
    });
    return strategySearchJson(preview, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
