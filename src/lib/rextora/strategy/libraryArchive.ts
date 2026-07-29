/**
 * Display-only library archive tag. Never participates in paramsHash / identity.
 */
export function applyLibraryArchiveTag(
  description: string | null | undefined,
  archived: boolean,
): string {
  const cleaned = (description ?? "")
    .replace(/\s*·?\s*libraryCategory=archive\b/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s·\s·/g, " · ")
    .trim()
    .replace(/^·\s*/, "")
    .replace(/\s·$/, "");
  if (!archived) return cleaned;
  return cleaned
    ? `${cleaned} · libraryCategory=archive`
    : "libraryCategory=archive";
}

export function descriptionHasLibraryArchive(
  description: string | null | undefined,
): boolean {
  return (description ?? "").includes("libraryCategory=archive");
}
