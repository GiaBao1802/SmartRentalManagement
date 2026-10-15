import { billingPeriod, businessDate, resolveEffectiveContractEndDate, type BillingPeriod } from "./invoice.billing.js";

export type ScheduledContract = {
  ownerId: bigint;
  contractId: bigint;
  startDate: Date;
  endDate: Date;
  terminationDate: Date | null;
  status: string;
};

export interface BillingScheduleStore {
  listEligibleContracts(): Promise<ScheduledContract[]>;
  ensurePeriodEndReminder(contract: ScheduledContract, period: BillingPeriod, today: Date): Promise<boolean>;
  ensurePeriodDraft(contract: ScheduledContract, period: BillingPeriod, today: Date): Promise<boolean>;
}

export interface BillingSchedulerLogger {
  info(entry: Record<string, unknown>): void;
  warn(entry: Record<string, unknown>): void;
  error(entry: Record<string, unknown>): void;
}

const defaultLogger: BillingSchedulerLogger = {
  info: (entry) => console.info(JSON.stringify(entry)),
  warn: (entry) => console.warn(JSON.stringify(entry)),
  error: (entry) => console.error(JSON.stringify(entry)),
};

const DAY_MS = 86_400_000;
const MAX_PERIODS = 1_200;
const HOUR_MS = 60 * 60 * 1_000;

export function dueBillingPeriods(contract: ScheduledContract, today: Date) {
  if (!(["active", "expired", "terminated"] as string[]).includes(contract.status)) return { periods: [], malformed: true };
  if (!(contract.startDate instanceof Date) || Number.isNaN(contract.startDate.valueOf())
    || !(contract.endDate instanceof Date) || Number.isNaN(contract.endDate.valueOf())
    || contract.endDate <= contract.startDate) return { periods: [], malformed: true };
  if (contract.terminationDate !== null && (!(contract.terminationDate instanceof Date)
    || Number.isNaN(contract.terminationDate.valueOf())
    || contract.terminationDate < contract.startDate || contract.terminationDate > contract.endDate)) {
    return { periods: [], malformed: true };
  }
  if (contract.status !== "terminated" && contract.terminationDate !== null) return { periods: [], malformed: true };

  const effectiveEnd = resolveEffectiveContractEndDate(contract);
  const periods: BillingPeriod[] = [];
  for (let offset = 0; offset < MAX_PERIODS; offset += 1) {
    const period = billingPeriod(contract.startDate, effectiveEnd, offset);
    if (!period || period.periodEnd > today) return { periods, malformed: false };
    periods.push(period);
  }
  const next = billingPeriod(contract.startDate, effectiveEnd, MAX_PERIODS);
  return { periods, malformed: next !== null && next.periodEnd < today };
}

function isoDate(date: Date) { return date.toISOString().slice(0, 10); }
function safeErrorCode(error: unknown) {
  if (error && typeof error === "object" && "code" in error && typeof error.code === "string") return error.code;
  return "UNEXPECTED_ERROR";
}

export class BillingScheduler {
  private inFlight: Promise<void> | null = null;
  private initialTimer: ReturnType<typeof setTimeout> | null = null;
  private interval: ReturnType<typeof setInterval> | null = null;
  private started = false;
  private stopped = false;

  constructor(
    private readonly store: BillingScheduleStore,
    private readonly clock: () => Date = () => new Date(),
    private readonly logger: BillingSchedulerLogger = defaultLogger,
  ) {}

  async runOnce(): Promise<void> {
    if (this.stopped) return;
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.run(this.clock()).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  start(options: { initialDelayMs?: number; intervalMs?: number } = {}) {
    if (this.started || this.stopped) return;
    this.started = true;
    const initialDelayMs = options.initialDelayMs ?? 30_000;
    const intervalMs = options.intervalMs ?? HOUR_MS;
    this.initialTimer = setTimeout(() => {
      this.initialTimer = null;
      void this.runOnce();
      this.interval = setInterval(() => { void this.runOnce(); }, intervalMs);
    }, initialDelayMs);
  }

  async stop() {
    this.stopped = true;
    if (this.initialTimer) clearTimeout(this.initialTimer);
    if (this.interval) clearInterval(this.interval);
    this.initialTimer = null;
    this.interval = null;
    await this.inFlight;
  }

  private async run(now: Date) {
    const today = businessDate(now);
    const summary = { contractsScanned: 0, remindersCreated: 0, remindersExisting: 0, draftsCreated: 0, draftsExisting: 0, failures: 0 };
    this.logger.info({ event: "billing_scheduler_started", business_date: isoDate(today) });

    let contracts: ScheduledContract[];
    try { contracts = await this.store.listEligibleContracts(); }
    catch (error) {
      this.logger.error({ event: "billing_scheduler_contract_scan_failed", business_date: isoDate(today), error_code: safeErrorCode(error) });
      this.logger.info({ event: "billing_scheduler_finished", business_date: isoDate(today), ...summary });
      return;
    }

    for (const contract of contracts) {
      summary.contractsScanned += 1;
      const result = dueBillingPeriods(contract, today);
      if (result.malformed) {
        summary.failures += 1;
        this.logger.error({ event: "billing_scheduler_contract_invalid", owner_id: contract.ownerId.toString(), contract_id: contract.contractId.toString(), business_date: isoDate(today) });
        continue;
      }
      // Reminders are retried for every past period until persisted. A failed reminder
      // does not block the independent next-day draft guarantee.
      for (const period of result.periods) {
        try {
          if (await this.store.ensurePeriodEndReminder(contract, period, today)) summary.remindersCreated += 1;
          else summary.remindersExisting += 1;
        } catch (error) {
          summary.failures += 1;
          this.logger.error({ event: "billing_period_reminder_failed", owner_id: contract.ownerId.toString(), contract_id: contract.contractId.toString(), period_start: isoDate(period.periodStart), period_end: isoDate(period.periodEnd), error_code: safeErrorCode(error) });
        }
      }

      // Missing Invoice periods are ensured in chronological order. Stop this
      // Contract at the first failed period so a later period cannot hide a gap.
      for (const period of result.periods.filter((item) => item.periodEnd < today)) {
        try {
          if (await this.store.ensurePeriodDraft(contract, period, today)) summary.draftsCreated += 1;
          else summary.draftsExisting += 1;
        } catch (error) {
          summary.failures += 1;
          this.logger.error({ event: "billing_period_draft_failed", owner_id: contract.ownerId.toString(), contract_id: contract.contractId.toString(), period_start: isoDate(period.periodStart), period_end: isoDate(period.periodEnd), error_code: safeErrorCode(error) });
          break;
        }
      }
    }
    this.logger.info({ event: "billing_scheduler_finished", business_date: isoDate(today), ...summary });
  }
}

export const BILLING_SCHEDULER_INTERVAL_MS = HOUR_MS;
export const BILLING_SCHEDULER_INITIAL_DELAY_MS = 30_000;
export const BILLING_SCHEDULER_DAY_MS = DAY_MS;
