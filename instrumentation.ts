/**
 * Next.js server instrumentation — recover orphaned strategy-search jobs,
 * then restore an eligible Paper executor after process death.
 * Never auto-starts Live. Never touches SAFE strategy files.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }
  // next-dev + Turbopack cannot compile Settings/Agent routes while boot-time
  // orphan recovery walks multi-thousand job/trial trees on a shared disk.
  // Production still recovers; development opts in via REXTORA_ORPHAN_RECOVERY=1.
  if (
    process.env.NODE_ENV === "development" &&
    process.env.REXTORA_ORPHAN_RECOVERY !== "1"
  ) {
    return;
  }

  setTimeout(() => {
    void (async () => {
      try {
        const { recoverOrphanSearchJobs } = await import(
          "@/src/lib/rextora/strategySearch/orphanJobRecovery"
        );
        const result = recoverOrphanSearchJobs();
        if ((result.resumed?.length ?? 0) > 0 || (result.errors?.length ?? 0) > 0) {
          console.info("[rextora] orphan search recovery", result);
        }
      } catch (err) {
        console.warn(
          "[rextora] orphan search recovery skipped",
          err instanceof Error ? err.message : err,
        );
      }
      try {
        const { recoverPaperRuntimeAfterBoot } = await import(
          "@/src/lib/rextora/paper/paperRuntimeRecovery"
        );
        await recoverPaperRuntimeAfterBoot();
      } catch (err) {
        console.warn(
          "[PAPER RECOVERY] failed reason=" +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    })();
  }, 1500);
}
