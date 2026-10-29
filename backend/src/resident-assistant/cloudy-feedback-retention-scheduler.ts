import type { CloudyFeedbackRepository } from "./cloudy-feedback.repository.js";

const HOUR_MS = 3_600_000;
export const CLOUDY_FEEDBACK_RETENTION_INTERVAL_MS = HOUR_MS;

export class CloudyFeedbackRetentionScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private inFlight: Promise<void> | null = null;
  private stopped = false;

  constructor(
    private readonly repository: Pick<CloudyFeedbackRepository, "deleteExpired">,
    private readonly logger = { info: (entry: Record<string, unknown>) => console.info(JSON.stringify(entry)), error: (entry: Record<string, unknown>) => console.error(JSON.stringify(entry)) },
  ) {}

  async runOnce() {
    if (this.stopped) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      try {
        const deleted = await this.repository.deleteExpired();
        this.logger.info({ event: "cloudy_feedback_retention_finished", deleted });
      } catch (error) {
        const code = error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "UNEXPECTED_ERROR";
        this.logger.error({ event: "cloudy_feedback_retention_failed", error_code: code });
      }
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  start(options: { initialDelayMs?: number; intervalMs?: number } = {}) {
    if (this.timer || this.initialTimer || this.stopped) return;
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.runOnce();
      this.timer = setInterval(() => { void this.runOnce(); }, options.intervalMs ?? HOUR_MS);
    }, options.initialDelayMs ?? 30_000);
  }

  async stop() {
    this.stopped = true;
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.timer) clearInterval(this.timer);
    this.initialTimer = null;
    this.timer = null;
    await this.inFlight;
  }
}
