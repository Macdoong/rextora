import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";

import { getRiskEngineStatus, updateRiskSettings } from "@/src/lib/rextora/riskEngine";

import { denyUnlessPermitted, denyUnlessAuthenticated } from "@/src/lib/rextora/auth/requireUser";


export async function GET(request: Request) {
  const denied = await denyUnlessAuthenticated(request);
  if (denied) return denied;


  const start = Date.now();



  try {

    return apiJsonResponse(

      { risk: getRiskEngineStatus() },

      {

        source: "risk-state",

        cached: true,

        durationMs: Date.now() - start,

        updatedAt: new Date().toISOString()

      }

    );

  } catch (error) {

    return apiErrorResponse(error instanceof Error ? error.message : "risk fetch failed", Date.now() - start);

  }

}



export async function POST(request: Request) {
  const denied = await denyUnlessPermitted(request, "risk:write");
  if (denied) return denied;

  const start = Date.now();



  try {

    const body = await request.json().catch(() => ({}));

    return apiJsonResponse(

      { risk: updateRiskSettings(body.settings ?? {}) },

      {

        source: "risk-state",

        cached: false,

        durationMs: Date.now() - start,

        updatedAt: new Date().toISOString()

      }

    );

  } catch (error) {

    return apiErrorResponse(error instanceof Error ? error.message : "risk update failed", Date.now() - start);

  }

}

