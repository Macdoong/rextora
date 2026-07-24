/** Marks / filters verification-only research jobs from production UI. */

const TEST_JOB_NAME_RE =
  /lifecycle-browser-verify|검증용|UI_TEST_SAFE_COPY/i;

export function isTestResearchJob(job: {
  id?: string;
  searchName?: string | null;
  name?: string | null;
  testData?: boolean;
  metadata?: { testData?: boolean };
}): boolean {
  if (job.testData === true) return true;
  if (job.metadata?.testData === true) return true;
  const name = job.searchName ?? job.name ?? "";
  return TEST_JOB_NAME_RE.test(name) || TEST_JOB_NAME_RE.test(job.id ?? "");
}
