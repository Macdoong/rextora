/**
 * Next.js server instrumentation — recover orphaned strategy-search jobs on boot.
 * Never touches SAFE strategy files.
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === "edge") return;
  // Skip during `next build` / static analysis so NFT does not crawl trial trees.
  if (
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.npm_lifecycle_event === "build"
  ) {
    return;
  }

  // Defer so the server can finish bootstrapping before disk resume.
  setTimeout(() => {
    void (async () => {
      try {
        const { recoverOrphanSearchJobs } = await import(
          "./src/lib/rextora/strategySearch/orphanJobRecovery"
        );
        const result = recoverOrphanSearchJobs();
        if (result.resumed.length > 0 || result.errors.length > 0) {
          console.info("[rextora] orphan search recovery", result);
        }
      } catch (err) {
        console.warn(
          "[rextora] orphan search recovery skipped",
          err instanceof Error ? err.message : err,
        );
      }
    })();
  }, 1500);
}
