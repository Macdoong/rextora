import { apiErrorResponse, apiJsonResponse } from "@/src/lib/rextora/apiResponse";
import { exportSettingsJson, getRextoraSettings, importSettingsJson, resetRextoraSettings, updateRextoraSettings } from "@/src/lib/rextora/settings/settingsService";

export async function GET() {
  const start = Date.now();
  const settings = getRextoraSettings();
  return apiJsonResponse(
    {
      settings,
      secretsNotice: "API 키와 Telegram 토큰은 환경변수로만 관리됩니다. settings.json에는 비밀값을 저장하지 않습니다."
    },
    { source: "settings", cached: false, durationMs: Date.now() - start }
  );
}

export async function PUT(request: Request) {
  const start = Date.now();
  const body = await request.json().catch(() => ({}));
  const action = body.action as string | undefined;

  if (action === "reset") {
    const settings = resetRextoraSettings();
    return apiJsonResponse({ settings }, { source: "settings-reset", cached: false, durationMs: Date.now() - start });
  }

  if (action === "export") {
    return apiJsonResponse({ json: exportSettingsJson() }, { source: "settings-export", cached: false, durationMs: Date.now() - start });
  }

  if (action === "import") {
    const result = importSettingsJson(String(body.json ?? ""));
    if (!result.ok) return apiErrorResponse(result.errors?.map((e) => e.message).join("; ") ?? "import failed", Date.now() - start, 400);
    return apiJsonResponse({ settings: result.settings }, { source: "settings-import", cached: false, durationMs: Date.now() - start });
  }

  const result = updateRextoraSettings(body.settings ?? body);
  if (!result.ok) {
    return apiErrorResponse(result.errors?.map((e) => `${e.field}: ${e.message}`).join("; ") ?? "validation failed", Date.now() - start, 400);
  }
  return apiJsonResponse({ settings: result.settings }, { source: "settings-save", cached: false, durationMs: Date.now() - start });
}
