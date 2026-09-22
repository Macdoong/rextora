import {
  duplicateStrategySearchConfig,
  listStrategySearchConfigs,
  renameStrategySearchConfig,
  saveStrategySearchConfig,
  setDefaultStrategySearchConfig,
} from "@/src/lib/rextora/strategySearch/searchConfigStore";
import {
  strategySearchError,
  strategySearchJson,
} from "@/src/lib/rextora/strategySearch/jobApiHttp";
import { StrategySearchApiError } from "@/src/lib/rextora/strategySearch/jobApiService";
import {
  requireAuthenticatedUser,
  requirePermission,
} from "@/src/lib/rextora/auth/requireUser";

/** GET /api/rextora/strategy-search/configs — list saved operator configs */
export async function GET(request: Request) {
  const auth = requireAuthenticatedUser(request);
  if (!auth.ok) return auth.response;

  const start = Date.now();
  try {
    const data = listStrategySearchConfigs({
      ownerUserId: auth.user.userId,
      viewerRole: auth.user.role,
    });
    return strategySearchJson(data, Date.now() - start);
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}

/** POST /api/rextora/strategy-search/configs — save or manage named operator config */
export async function POST(request: Request) {
  const auth = requirePermission(request, "research:run");
  if (!auth.ok) return auth.response;
  const start = Date.now();
  try {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      throw new StrategySearchApiError("INVALID_REQUEST", "body required", 400);
    }
    const ownerOpts = { ownerUserId: auth.user.userId };
    const action = (body as { action?: unknown }).action;
    const name = (body as { name?: unknown }).name;
    const newName = (body as { newName?: unknown }).newName;

    if (action === "rename") {
      if (typeof name !== "string" || typeof newName !== "string") {
        throw new StrategySearchApiError(
          "INVALID_REQUEST",
          "name and newName are required for rename",
          400,
        );
      }
      const data = renameStrategySearchConfig(name, newName, ownerOpts);
      return strategySearchJson(data, Date.now() - start);
    }

    if (action === "duplicate") {
      if (typeof name !== "string" || typeof newName !== "string") {
        throw new StrategySearchApiError(
          "INVALID_REQUEST",
          "name and newName are required for duplicate",
          400,
        );
      }
      const data = duplicateStrategySearchConfig(name, newName, ownerOpts);
      return strategySearchJson(data, Date.now() - start, { status: 201 });
    }

    if (action === "setDefault") {
      if (typeof name !== "string") {
        throw new StrategySearchApiError(
          "INVALID_REQUEST",
          "name is required for setDefault",
          400,
        );
      }
      const data = setDefaultStrategySearchConfig(name, ownerOpts);
      return strategySearchJson(data, Date.now() - start);
    }

    const form = (body as { form?: unknown }).form;
    if (typeof name !== "string" || !form || typeof form !== "object") {
      throw new StrategySearchApiError(
        "INVALID_REQUEST",
        "name and form are required",
        400,
      );
    }
    const overwrite = (body as { overwrite?: unknown }).overwrite;
    const data = saveStrategySearchConfig(name, form as never, {
      ...ownerOpts,
      overwrite: overwrite === false ? false : true,
    });
    return strategySearchJson(data, Date.now() - start, { status: 201 });
  } catch (err) {
    return strategySearchError(err, Date.now() - start);
  }
}
