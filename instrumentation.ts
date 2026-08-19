/**
 * Next.js server instrumentation — recover orphaned strategy-search jobs on boot.
 * Never touches SAFE strategy files.
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
        const port = process.env.PORT || "3000";
        const response = await fetch(
          `http://127.0.0.1:${port}/api/rextora/internal/orphan-recovery`,
          {
            method: "POST",
            headers: { "x-rextora-boot": "1" },
          },
        );
        if (!response.ok) {
          throw new Error(`orphan_recovery_http_${response.status}`);
        }
        const result = (await response.json()) as {
          resumed?: string[];
          errors?: unknown[];
        };
        if ((result.resumed?.length ?? 0) > 0 || (result.errors?.length ?? 0) > 0) {
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
