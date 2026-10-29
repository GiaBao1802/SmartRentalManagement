type BackgroundJob = { start(): void };

/** Opt out of automatic writes during a local UI review; production always runs its jobs. */
export function startBackgroundJobs(nodeEnv: "development" | "test" | "production", disableForReview: string | undefined, jobs: readonly BackgroundJob[]) {
  if (nodeEnv === "development" && disableForReview === "1") return false;
  for (const job of jobs) job.start();
  return true;
}
