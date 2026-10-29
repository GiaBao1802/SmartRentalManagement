import { createHmac } from "node:crypto";
import type { Prisma, PrismaClient } from "@prisma/client";
import { ApiError, validationError } from "../middleware/api-error.js";

export const CLOUDY_FEEDBACK_RETENTION_DAYS = 30;
const DAY_MS = 86_400_000;
const MODEL_VERSION = "qwen3:1.7b";
const REVIEW_STATUSES = ["new", "reviewed", "no_action", "included_in_eval"] as const;
const CURATED_INTENTS = ["services", "meter", "requests", "invoice", "other", "ambiguous"] as const;
export type CloudyFeedbackStatus = typeof REVIEW_STATUSES[number];
export type CloudyFeedbackIntent = typeof CURATED_INTENTS[number];

export function sanitizeCloudyFeedbackMessage(value: unknown): string | null {
  if (typeof value !== "string") throw validationError("Tin nhắn Cloudy không hợp lệ.");
  const input = value.trim().slice(0, 500);
  const sanitized = input
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/giu, "[đã ẩn email]")
    .replace(/(?<!\d)\d{12}(?!\d)/gu, "[đã ẩn số định danh]")
    .replace(/(?<!\d)(?:\+?84|0)[ .()-]*(?:\d[ .()-]*){8,10}(?!\d)/gu, (phone) => `[đã ẩn số điện thoại]${phone.match(/\s+$/u)?.[0] ?? ""}`)
    .replace(/\s+/gu, " ")
    .trim()
    .slice(0, 500);
  return sanitized ? sanitized : null;
}

export function cloudyFeedbackDigest(message: string, serverSecret: string): string {
  if (serverSecret.length < 32) throw new Error("Cloudy feedback digest secret is not configured safely.");
  return createHmac("sha256", serverSecret).update("goctro-cloudy-feedback-v1\0").update(message).digest("hex");
}

export type CloudyFeedbackPreference = { enabled: boolean };
export type CloudyFeedbackFilter = { page: number; pageSize: number; status?: CloudyFeedbackStatus; intent?: CloudyFeedbackIntent; from?: Date; to?: Date };

export interface CloudyFeedbackRepository {
  getPreference(accountId: bigint): Promise<CloudyFeedbackPreference>;
  setPreference(accountId: bigint, enabled: boolean): Promise<CloudyFeedbackPreference>;
  capture(accountId: bigint, message: string): Promise<boolean>;
  list(filter: CloudyFeedbackFilter): Promise<{ rows: unknown[]; total: number }>;
  detail(feedbackId: bigint): Promise<unknown | null>;
  review(input: { feedbackId: bigint; reviewerAccountId: bigint; expectedUpdatedAt: Date; status?: CloudyFeedbackStatus; intent?: CloudyFeedbackIntent | null; evaluationSetVersion?: string | null }): Promise<unknown | null>;
  deleteExpired(now?: Date): Promise<number>;
}

const feedbackSelect = {
  feedbackId: true, sanitizedMessage: true, source: true, predictedIntent: true, curatedIntent: true,
  status: true, modelVersion: true, occurrenceCount: true, firstSeenAt: true, lastSeenAt: true,
  latestReviewedByAccountId: true, latestReviewedAt: true, evaluationSetVersion: true, updatedAt: true,
} satisfies Prisma.CloudyUnresolvedFeedbackSelect;

function feedbackDto(row: Record<string, any>) {
  return {
    feedback_id: row.feedbackId.toString(), sanitized_message: row.sanitizedMessage,
    source: row.source, predicted_intent: row.predictedIntent, curated_intent: row.curatedIntent,
    status: row.status, model_version: row.modelVersion, occurrence_count: row.occurrenceCount,
    first_seen_at: row.firstSeenAt.toISOString(), last_seen_at: row.lastSeenAt.toISOString(),
    latest_reviewed_by_account_id: row.latestReviewedByAccountId?.toString() ?? null,
    latest_reviewed_at: row.latestReviewedAt?.toISOString() ?? null,
    evaluation_set_version: row.evaluationSetVersion, updated_at: row.updatedAt.toISOString(),
    ...(row.reviews ? { reviews: row.reviews.map((review: Record<string, any>) => ({
      review_id: review.reviewId.toString(), reviewer_account_id: review.reviewerAccountId.toString(),
      action: review.action, previous_status: review.previousStatus, next_status: review.nextStatus,
      previous_intent: review.previousIntent, next_intent: review.nextIntent,
      previous_evaluation_set_version: review.previousEvaluationSetVersion,
      next_evaluation_set_version: review.nextEvaluationSetVersion, created_at: review.createdAt.toISOString(),
    })) } : {}),
  };
}

export class PrismaCloudyFeedbackRepository implements CloudyFeedbackRepository {
  constructor(private readonly prisma: PrismaClient, private readonly digestSecret: string, private readonly clock: () => Date = () => new Date()) {}

  async getPreference(accountId: bigint): Promise<CloudyFeedbackPreference> {
    const account = await this.prisma.account.findFirst({ where: { accountId, role: "resident" }, select: { cloudyFeedbackOptInAt: true } });
    if (!account) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tài khoản cư dân.");
    return { enabled: account.cloudyFeedbackOptInAt !== null };
  }

  async setPreference(accountId: bigint, enabled: boolean): Promise<CloudyFeedbackPreference> {
    const result = await this.prisma.account.updateMany({
      where: { accountId, role: "resident" },
      data: { cloudyFeedbackOptInAt: enabled ? this.clock() : null },
    });
    if (result.count !== 1) throw new ApiError(404, "NOT_FOUND", "Không tìm thấy tài khoản cư dân.");
    return { enabled };
  }

  async capture(accountId: bigint, message: string): Promise<boolean> {
    const account = await this.prisma.account.findFirst({ where: { accountId, role: "resident", cloudyFeedbackOptInAt: { not: null } }, select: { accountId: true } });
    if (!account) return false;
    const sanitizedMessage = sanitizeCloudyFeedbackMessage(message);
    if (!sanitizedMessage) return false;
    const now = this.clock();
    const messageDigest = cloudyFeedbackDigest(sanitizedMessage, this.digestSecret);
    await this.prisma.cloudyUnresolvedFeedback.upsert({
      where: { messageDigest },
      create: { messageDigest, sanitizedMessage, source: "resident_cloudy_chat", predictedIntent: "help", modelVersion: MODEL_VERSION, firstSeenAt: now, lastSeenAt: now, updatedAt: now },
      update: { occurrenceCount: { increment: 1 }, lastSeenAt: now, updatedAt: now },
    });
    return true;
  }

  async list(filter: CloudyFeedbackFilter) {
    const where: Prisma.CloudyUnresolvedFeedbackWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.intent ? { OR: [{ predictedIntent: filter.intent }, { curatedIntent: filter.intent }] } : {}),
      ...(filter.from || filter.to ? { firstSeenAt: { ...(filter.from ? { gte: filter.from } : {}), ...(filter.to ? { lte: filter.to } : {}) } } : {}),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.cloudyUnresolvedFeedback.findMany({ where, select: feedbackSelect, orderBy: [{ lastSeenAt: "desc" }, { feedbackId: "desc" }], skip: (filter.page - 1) * filter.pageSize, take: filter.pageSize }),
      this.prisma.cloudyUnresolvedFeedback.count({ where }),
    ]);
    return { rows: rows.map((row) => feedbackDto(row)), total };
  }

  async detail(feedbackId: bigint) {
    const row = await this.prisma.cloudyUnresolvedFeedback.findUnique({
      where: { feedbackId }, select: { ...feedbackSelect, reviews: { orderBy: [{ createdAt: "asc" }, { reviewId: "asc" }], select: {
        reviewId: true, reviewerAccountId: true, action: true, previousStatus: true, nextStatus: true,
        previousIntent: true, nextIntent: true, previousEvaluationSetVersion: true, nextEvaluationSetVersion: true, createdAt: true,
      } } },
    });
    return row ? feedbackDto(row) : null;
  }

  async review(input: { feedbackId: bigint; reviewerAccountId: bigint; expectedUpdatedAt: Date; status?: CloudyFeedbackStatus; intent?: CloudyFeedbackIntent | null; evaluationSetVersion?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const before = await tx.cloudyUnresolvedFeedback.findUnique({ where: { feedbackId: input.feedbackId }, select: feedbackSelect });
      if (!before || before.updatedAt.getTime() !== input.expectedUpdatedAt.getTime()) return null;

      let nextStatus = input.status ?? before.status;
      let nextIntent = input.intent === undefined ? before.curatedIntent : input.intent;
      let nextEvaluation = input.evaluationSetVersion === undefined ? before.evaluationSetVersion : input.evaluationSetVersion;
      if (input.status === "included_in_eval" && input.evaluationSetVersion === undefined && !nextEvaluation) throw validationError("Chọn phiên bản bộ đánh giá để đưa ví dụ vào.");
      if (input.evaluationSetVersion && input.status === undefined) nextStatus = "included_in_eval";
      if (nextStatus === "included_in_eval" && !nextEvaluation) throw validationError("Chọn phiên bản bộ đánh giá để đưa ví dụ vào.");
      if (nextStatus !== "included_in_eval") nextEvaluation = null;
      const now = this.clock();
      const audits: Prisma.CloudyUnresolvedFeedbackReviewCreateManyInput[] = [];
      if (nextStatus !== before.status) audits.push({ feedbackId: input.feedbackId, reviewerAccountId: input.reviewerAccountId, action: "status_changed", previousStatus: before.status, nextStatus, createdAt: now });
      if (nextIntent !== before.curatedIntent) audits.push({ feedbackId: input.feedbackId, reviewerAccountId: input.reviewerAccountId, action: "intent_labeled", previousIntent: before.curatedIntent, nextIntent, createdAt: now });
      if (nextEvaluation !== before.evaluationSetVersion) audits.push({ feedbackId: input.feedbackId, reviewerAccountId: input.reviewerAccountId, action: "evaluation_set_changed", previousEvaluationSetVersion: before.evaluationSetVersion, nextEvaluationSetVersion: nextEvaluation, createdAt: now });
      if (audits.length === 0) return feedbackDto(before);

      const changed = await tx.cloudyUnresolvedFeedback.updateMany({
        where: { feedbackId: input.feedbackId, updatedAt: input.expectedUpdatedAt },
        data: { status: nextStatus, curatedIntent: nextIntent, evaluationSetVersion: nextEvaluation, latestReviewedByAccountId: input.reviewerAccountId, latestReviewedAt: now, updatedAt: now },
      });
      if (changed.count !== 1) return null;
      if (audits.length) await tx.cloudyUnresolvedFeedbackReview.createMany({ data: audits });
      const updated = await tx.cloudyUnresolvedFeedback.findUnique({ where: { feedbackId: input.feedbackId }, select: feedbackSelect });
      return updated ? feedbackDto(updated) : null;
    });
  }

  async deleteExpired(now = this.clock()) {
    const cutoff = new Date(now.getTime() - CLOUDY_FEEDBACK_RETENTION_DAYS * DAY_MS);
    return this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('goctro.cloudy_feedback_retention_cleanup', 'on', true)`;
      const result = await tx.cloudyUnresolvedFeedback.deleteMany({ where: { firstSeenAt: { lt: cutoff } } });
      return result.count;
    });
  }
}

export function validateCloudyFeedbackReviewInput(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw validationError("Nội dung duyệt không hợp lệ.");
  const body = value as Record<string, unknown>;
  const allowed = ["expected_updated_at", "status", "intent", "evaluation_set_version"];
  if (Object.keys(body).some((key) => !allowed.includes(key)) || typeof body.expected_updated_at !== "string") throw validationError("Nội dung duyệt không hợp lệ.");
  const expectedUpdatedAt = new Date(body.expected_updated_at);
  if (!Number.isFinite(expectedUpdatedAt.getTime()) || expectedUpdatedAt.toISOString() !== body.expected_updated_at) throw validationError("Thời điểm phiên bản không hợp lệ.");
  if (body.status !== undefined && !REVIEW_STATUSES.includes(body.status as CloudyFeedbackStatus)) throw validationError("Trạng thái duyệt không hợp lệ.");
  if (body.intent !== undefined && body.intent !== null && !CURATED_INTENTS.includes(body.intent as CloudyFeedbackIntent)) throw validationError("Nhãn ý định không hợp lệ.");
  if (body.evaluation_set_version !== undefined && body.evaluation_set_version !== null && (typeof body.evaluation_set_version !== "string" || !/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,63}$/u.test(body.evaluation_set_version))) throw validationError("Phiên bản bộ đánh giá không hợp lệ.");
  if (body.status === undefined && body.intent === undefined && body.evaluation_set_version === undefined) throw validationError("Chọn thông tin cần cập nhật.");
  return {
    expectedUpdatedAt,
    ...(body.status !== undefined ? { status: body.status as CloudyFeedbackStatus } : {}),
    ...(body.intent !== undefined ? { intent: body.intent as CloudyFeedbackIntent | null } : {}),
    ...(body.evaluation_set_version !== undefined ? { evaluationSetVersion: body.evaluation_set_version as string | null } : {}),
  };
}
