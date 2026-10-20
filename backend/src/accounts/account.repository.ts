import { Prisma, type PrismaClient } from "@prisma/client";
import type { AccountListQuery, AccountManagementRepository } from "./account.types.js";

// Explicit projections: never select password/token hashes for administration DTOs.
const accountSelect = {
  accountId: true, residentId: true, role: true, email: true, phone: true, status: true,
  lastLoginAt: true, createdAt: true, updatedAt: true,
  resident: { select: { residentId: true, fullName: true } },
} satisfies Prisma.AccountSelect;
const invitationSelect = {
  invitationId: true, residentId: true, status: true, expiresAt: true, acceptedAt: true, createdAt: true, updatedAt: true,
} satisfies Prisma.AccountInvitationSelect;
const scope = (ownerId: bigint): Prisma.AccountWhereInput => ({ OR: [{ role: "admin", ownerId }, { role: "resident", resident: { ownerId } }] });

export class PrismaAccountManagementRepository implements AccountManagementRepository {
  constructor(private readonly prisma: PrismaClient) {}
  async list(ownerId: bigint, query: AccountListQuery) {
    const where: Prisma.AccountWhereInput = { AND: [scope(ownerId), { role: query.role, status: query.status, residentId: query.residentId }] };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.account.findMany({ where, select: accountSelect, orderBy: { accountId: "asc" }, skip: (query.page - 1) * query.page_size, take: query.page_size }),
      this.prisma.account.count({ where }),
    ]);
    return { rows, total };
  }
  find(ownerId: bigint, accountId: bigint) {
    return this.prisma.account.findFirst({ where: { AND: [scope(ownerId), { accountId }] }, select: accountSelect });
  }
  async setResidentStatus(ownerId: bigint, accountId: bigint, status: "active" | "locked", revoke: () => Promise<void>) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ account_id: bigint }>>`SELECT a.account_id FROM accounts a JOIN residents r ON r.resident_id=a.resident_id WHERE a.account_id=${accountId} AND a.role='resident' AND r.owner_id=${ownerId} FOR UPDATE OF a, r`;
      if (!locked.length) return null;
      const row = await tx.account.update({ where: { accountId }, data: { status, updatedAt: new Date() }, select: accountSelect });
      // Reuse Auth's store. Failure rolls back status; locked account checks also fail closed.
      // Unlock also revokes stale sessions, so it never restores a previously locked session.
      await revoke();
      return row;
    });
  }
  async residentExists(ownerId: bigint, residentId: bigint) {
    return Boolean(await this.prisma.resident.findFirst({ where: { ownerId, residentId }, select: { residentId: true } }));
  }
  async invitations(ownerId: bigint, residentId: bigint, page: number, pageSize: number) {
    const where = { ownerId, residentId };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.accountInvitation.findMany({ where, select: invitationSelect, orderBy: [{ createdAt: "desc" }, { invitationId: "desc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.accountInvitation.count({ where }),
    ]);
    return { rows, total };
  }
  async revokeInvitation(ownerId: bigint, invitationId: bigint, now: Date) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ invitation_id: bigint }>>`SELECT invitation_id FROM account_invitations WHERE invitation_id=${invitationId} AND owner_id=${ownerId} FOR UPDATE`;
      if (!locked.length) return "missing" as const;
      const row = await tx.accountInvitation.findFirst({ where: { ownerId, invitationId }, select: invitationSelect });
      if (!row) return "missing" as const;
      if (row.status === "revoked") return row;
      if (row.status !== "pending" || row.expiresAt <= now) return "terminal" as const;
      return tx.accountInvitation.update({ where: { invitationId }, data: { status: "revoked", updatedAt: now }, select: invitationSelect });
    });
  }
}
