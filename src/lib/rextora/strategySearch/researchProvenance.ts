/**
 * Research provenance markers on registered strategies.
 * Kept separate to avoid circular imports between retention / deletion modules.
 */

export const RESEARCH_PROVENANCE_DETACH_MARKER = "researchProvenanceDetached=true";
export const RESEARCH_PROVENANCE_SNAPSHOT_PREFIX = "provenanceSnapshot=";

export function isProvenanceDetached(
  description: string | null | undefined,
): boolean {
  return (description ?? "").includes(RESEARCH_PROVENANCE_DETACH_MARKER);
}
