/**
 * Object-level Strategy Search authorization.
 * Distinct from jobExecutionOwnership.ownerId (process/PID lease).
 *
 * Owned resource: only the ownerUserId may read or mutate.
 * Ownerless legacy resource: quarantined. Ordinary operator/viewer accounts
 * cannot list, read, or mutate it. CEO/admin may inspect it read-only using
 * the existing requireAdmin maintenance convention. Mutation of ownerless
 * data is denied for every role until ownership is explicitly established.
 * Locked product baseline strategies remain readable (and executable) by any
 * authenticated user. They are never writable.
 */

import type { RextoraRole } from "./authTypes";

export type OwnedResource = {
  ownerUserId?: string | null;
};

export type StoredStrategyAccessSource = OwnedResource & {
  locked?: boolean;
};

export type ResourceActor = {
  userId: string;
  role?: RextoraRole;
};

export type ResourceAccessClass = "owner" | "legacy_unresolved" | "denied";

export const LEGACY_UNSPECIFIED_OWNER_LABEL_KO = "기존 데이터 · 소유자 미지정";

export function normalizeOwnerUserId(
  value: string | null | undefined,
): string | null {
  const trimmed = value?.trim() ?? "";
  return trimmed ? trimmed : null;
}

export function isLegacyOwnerlessResource(resource: OwnedResource): boolean {
  return normalizeOwnerUserId(resource.ownerUserId) == null;
}

export function isMaintenanceInspector(user: ResourceActor): boolean {
  return user.role === "ceo" || user.role === "admin";
}

export function classifyOwnedResourceAccess(
  userId: string,
  resource: OwnedResource,
): ResourceAccessClass {
  const owner = normalizeOwnerUserId(resource.ownerUserId);
  if (!owner) return "legacy_unresolved";
  return owner === userId ? "owner" : "denied";
}

export function canReadOwnedResource(
  user: ResourceActor,
  resource: OwnedResource,
): boolean {
  const cls = classifyOwnedResourceAccess(user.userId, resource);
  if (cls === "owner") return true;
  if (cls === "legacy_unresolved") return isMaintenanceInspector(user);
  return false;
}

export function canMutateOwnedResource(
  user: ResourceActor,
  resource: OwnedResource,
): boolean {
  return classifyOwnedResourceAccess(user.userId, resource) === "owner";
}

export function canReadStrategySearchResource(
  user: ResourceActor,
  resource: OwnedResource,
): boolean {
  return canReadOwnedResource(user, resource);
}

export function canWriteStrategySearchResource(
  user: ResourceActor,
  resource: OwnedResource,
): boolean {
  return canMutateOwnedResource(user, resource);
}

export function canReadStoredStrategy(
  user: ResourceActor,
  strategy: StoredStrategyAccessSource,
): boolean {
  if (strategy.locked === true) return true;
  return canReadOwnedResource(user, strategy);
}

export function canWriteStoredStrategy(
  user: ResourceActor,
  strategy: StoredStrategyAccessSource,
): boolean {
  if (strategy.locked === true) return false;
  return canMutateOwnedResource(user, strategy);
}

/** Execution (backtest/run) from a stored strategy. Owner or locked baseline only. */
export function canExecuteStoredStrategy(
  user: ResourceActor,
  strategy: StoredStrategyAccessSource,
): boolean {
  if (strategy.locked === true) return true;
  return canMutateOwnedResource(user, strategy);
}

export function legacyOwnershipMarker(resource: OwnedResource): {
  legacyUnspecifiedOwner: boolean;
  ownershipLabelKo: string | null;
} {
  const legacy = isLegacyOwnerlessResource(resource);
  return {
    legacyUnspecifiedOwner: legacy,
    ownershipLabelKo: legacy ? LEGACY_UNSPECIFIED_OWNER_LABEL_KO : null,
  };
}

export function assertSafeOwnerPathSegment(ownerUserId: string): string {
  const id = ownerUserId.trim();
  if (!id || id.includes("..") || id.includes("/") || id.includes("\\")) {
    throw new Error("invalid ownerUserId");
  }
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(id)) {
    throw new Error("invalid ownerUserId");
  }
  return id;
}
