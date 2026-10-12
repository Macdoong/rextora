export type CompareSectionPosition = {
  id: string;
  top: number;
};

/**
 * Select the first section start at or below the fixed navigation's activation
 * line. At the document end, the final section owns the remaining bottom area.
 */
export function selectActiveCompareSection(
  sections: readonly CompareSectionPosition[],
  activationLine: number,
  atDocumentEnd = false,
): string | null {
  if (sections.length === 0) return null;
  if (atDocumentEnd) return sections[sections.length - 1]?.id ?? null;
  return sections.find((section) => section.top >= activationLine)?.id
    ?? sections[sections.length - 1]?.id
    ?? null;
}
