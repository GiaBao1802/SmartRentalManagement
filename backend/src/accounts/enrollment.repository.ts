import { Prisma, type PrismaClient } from "@prisma/client";
import { ApiError } from "../middleware/api-error.js";
import { foreignResourceNotFound } from "../middleware/auth.js";
import { invalidToken, normalizeVietnamPhone } from "./credential-infrastructure.js";
const invitationSelect = { invitationId: true, residentId: true, status: true, expiresAt: true, acceptedAt: true, createdAt: true, updatedAt: true } satisfies Prisma.AccountInvitationSelect;
export type EnrollmentInvitation = Prisma.AccountInvitationGetPayload<{ select: typeof invitationSelect }> & { created: boolean };
export type EnrollmentResident = { residentId: bigint; ownerId: bigint; phone: string | null; email: string | null; archivedAt: Date | null; hasAccount: boolean };
export type ResetAccount = { accountId: bigint; ownerId: bigint | null; residentId: bigint | null; role: string; phone: string | null; passwordHash: string; status: string; resident: { ownerId: bigint } | null };
export interface EnrollmentRepository {
  resident(ownerId: bigint, residentId: bigint): Promise<EnrollmentResident | null>;
  account(accountId: bigint): Promise<ResetAccount | null>;
  lookup(login: string): Promise<ResetAccount[]>;
  issue(ownerId: bigint, residentId: bigint, actor: bigint, hash: string, phone: string, expiresAt: Date, resend: boolean, now: Date): Promise<EnrollmentInvitation>;
  inspectInvitation(hash: string, phone: string, now: Date): Promise<Date | null>;
  accept(hash: string, phone: string, passwordHash: string, now: Date): Promise<void>;
  password(accountId: bigint, hash: string, revoke: () => Promise<void>): Promise<void>;
}
export class PrismaEnrollmentRepository implements EnrollmentRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async resident(ownerId: bigint, residentId: bigint) {
    const row = await this.prisma.resident.findFirst({ where: { ownerId, residentId }, select: { residentId: true, ownerId: true, phone: true, email: true, archivedAt: true, account: { select: { accountId: true } } } });
    return row ? { ...row, hasAccount: row.account !== null } : null;
  }
  account(accountId: bigint) { return this.prisma.account.findUnique({ where: { accountId }, include: { resident: { select: { ownerId: true } } } }); }
  lookup(login: string) {
    const phones = login.startsWith("+84") ? [login, "0" + login.slice(3)] : [login];
    return this.prisma.account.findMany({ where: { OR: [{ email: { equals: login, mode: "insensitive" } }, { phone: { in: phones } }] }, include: { resident: { select: { ownerId: true } } }, take: 2 });
  }
  issue(ownerId: bigint, residentId: bigint, actor: bigint, hash: string, phone: string, expiresAt: Date, resend: boolean, now: Date) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT resident_id FROM residents WHERE resident_id=${residentId} AND owner_id=${ownerId} FOR UPDATE`;
      const resident = await tx.resident.findFirst({ where: { ownerId, residentId, archivedAt: null }, include: { account: { select: { accountId: true } } } });
      if (!resident) foreignResourceNotFound();
      if (resident.account) throw new ApiError(409, "ACCOUNT_ALREADY_EXISTS", "Cư dân đã có tài khoản.");
      if (!resident.phone || normalizeVietnamPhone(resident.phone) !== phone) throw new ApiError(409, "RECIPIENT_CHANGED", "Thông tin người nhận đã thay đổi.");
      const pending = await tx.accountInvitation.findFirst({ where: { ownerId, residentId, status: "pending" }, select: invitationSelect });
      if (pending && pending.expiresAt > now) {
        if (!resend) throw new ApiError(409, "INVITATION_PENDING", "Cư dân đang có lời mời còn hiệu lực. Dùng gửi lại.");
        return { ...pending, created: false };
      }
      if (pending) await tx.accountInvitation.update({ where: { invitationId: pending.invitationId }, data: { status: "expired", updatedAt: now } });
      const created = await tx.accountInvitation.create({ data: { ownerId, residentId, createdByAccountId: actor, tokenHash: hash, expiresAt, createdAt: now, updatedAt: now }, select: invitationSelect });
      return { ...created, created: true };
    });
  }
  async inspectInvitation(hash: string, phone: string, now: Date) {
    const row = await this.prisma.accountInvitation.findUnique({ where: { tokenHash: hash }, select: { status: true, expiresAt: true, resident: { select: { phone: true, archivedAt: true, account: { select: { accountId: true } } } } } });
    if (!row || row.status !== "pending" || row.expiresAt <= now || row.resident.archivedAt || row.resident.account || !row.resident.phone) return null;
    try { return normalizeVietnamPhone(row.resident.phone) === phone ? row.expiresAt : null; } catch { return null; }
  }
  async accept(hash: string, phone: string, passwordHash: string, now: Date) {
    try {
      await this.prisma.$transaction(async tx => {
        const original = await tx.accountInvitation.findUnique({ where: { tokenHash: hash }, select: { residentId: true, ownerId: true } });
        if (!original) throw invalidToken();
        // Same lock order as issuance: Resident, then Invitation.
        await tx.$queryRaw`SELECT resident_id FROM residents WHERE resident_id=${original.residentId} AND owner_id=${original.ownerId} FOR UPDATE`;
        await tx.$queryRaw`SELECT invitation_id FROM account_invitations WHERE token_hash=${hash} FOR UPDATE`;
        const acceptedAt = new Date(Math.max(now.getTime(), Date.now()));
        const invitation = await tx.accountInvitation.findUnique({ where: { tokenHash: hash } });
        const resident = await tx.resident.findFirst({ where: { residentId: original.residentId, ownerId: original.ownerId, archivedAt: null }, include: { account: true } });
        if (!invitation || invitation.status !== "pending" || invitation.expiresAt <= acceptedAt || !resident || !resident.phone) throw invalidToken();
        let currentPhone: string; try { currentPhone = normalizeVietnamPhone(resident.phone); } catch { throw invalidToken(); }
        if (currentPhone !== phone) throw invalidToken();
        if (resident.account) throw new ApiError(409, "ACCOUNT_IDENTITY_CONFLICT", "Không thể tạo tài khoản với thông tin hiện tại.");
        const collision = await tx.account.findFirst({ where: { OR: [{ phone: { in: [phone, "0" + phone.slice(3)] } }, ...(resident.email ? [{ email: { equals: resident.email, mode: "insensitive" as const } }] : [])] }, select: { accountId: true } });
        if (collision) throw new ApiError(409, "ACCOUNT_IDENTITY_CONFLICT", "Không thể tạo tài khoản với thông tin hiện tại.");
        await tx.account.create({ data: { residentId: resident.residentId, role: "resident", phone, email: resident.email?.toLowerCase() ?? null, passwordHash, status: "active" } });
        await tx.accountInvitation.update({ where: { invitationId: invitation.invitationId }, data: { status: "accepted", acceptedAt, updatedAt: acceptedAt } });
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") throw new ApiError(409, "ACCOUNT_IDENTITY_CONFLICT", "Không thể tạo tài khoản với thông tin hiện tại.");
      throw error;
    }
  }
  async password(accountId: bigint, hash: string, revoke: () => Promise<void>) {
    await this.prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<Array<{ account_id: bigint }>>`SELECT account_id FROM accounts WHERE account_id=${accountId} FOR UPDATE`;
      if (!rows.length) throw invalidToken();
      await tx.account.update({ where: { accountId }, data: { passwordHash: hash, updatedAt: new Date() } });
      await revoke();
    });
  }
}
