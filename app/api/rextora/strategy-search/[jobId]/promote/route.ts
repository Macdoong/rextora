import {

  promoteSelectedTrialsFromJob,

  promoteSearchCandidateToStrategy,

} from "@/src/lib/rextora/strategySearch/promoteFromSearch";

import {

  strategySearchError,

  strategySearchJson,

} from "@/src/lib/rextora/strategySearch/jobApiHttp";



type Ctx = { params: Promise<{ jobId: string }> };



/**

 * POST /api/rextora/strategy-search/[jobId]/promote

 * Explicit registration only. Requires iteration or iterations[].

 * Does not auto-register all passed trials from the UI.

 */

export async function POST(request: Request, context: Ctx) {

  const start = Date.now();

  try {

    const { jobId } = await context.params;

    let body: {

      iteration?: number;

      iterations?: number[];

      name?: string;

    } = {};

    try {

      body = (await request.json()) as typeof body;

    } catch {

      body = {};

    }



    if (Array.isArray(body.iterations) && body.iterations.length > 0) {

      const data = promoteSelectedTrialsFromJob(jobId, body.iterations);

      return strategySearchJson({ promoted: data }, Date.now() - start);

    }



    if (body.iteration == null || !Number.isInteger(body.iteration)) {

      const { StrategySearchApiError } = await import(

        "@/src/lib/rextora/strategySearch/jobApiService"

      );

      throw new StrategySearchApiError(

        "INVALID_REQUEST",

        "iteration or iterations[] is required for explicit registration",

        400,

      );

    }

    const data = promoteSearchCandidateToStrategy({

      jobId,

      iteration: body.iteration,

      name: body.name,

    });

    return strategySearchJson(data, Date.now() - start);

  } catch (err) {

    return strategySearchError(err, Date.now() - start);

  }

}


