/** Mobile/desktop guided setup footer layout (presentation only). */
export function resolveGuidedFooterActionsClassName(input: {
  canGoPrevious: boolean;
  hasPrimaryAction: boolean;
}): string {
  const base = "ss-guided-footer-actions";
  if (input.canGoPrevious && input.hasPrimaryAction) {
    return `${base} ss-guided-footer-actions--with-back`;
  }
  return base;
}

export function resolveGuidedFooterPairedRow(input: {
  canGoPrevious: boolean;
  hasPrimaryAction: boolean;
}): boolean {
  return input.canGoPrevious && input.hasPrimaryAction;
}
