import type { PrismaClient } from "@prisma/client";
import type { AuthRepository, CurrentAccountRecord, LoginAccountRecord } from "./auth.types.js";

export class PrismaAuthRepository implements AuthRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findCandidates(login: string): Promise<LoginAccountRecord[]> {
    return this.prisma.account.findMany({
      where: { OR: [{ email: { equals: login, mode: "insensitive" } }, { phone: { in: login.startsWith("+84") ? [login, "0" + login.slice(3)] : [login] } }] },
      take: 3,
      select: {
        accountId: true, ownerId: true, residentId: true, role: true, email: true, phone: true,
        passwordHash: true, status: true,
        owner: { select: { ownerId: true, displayName: true } },
        resident: { select: { residentId: true, ownerId: true, fullName: true } },
      },
    }) as Promise<LoginAccountRecord[]>;
  }

  async findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null> {
    return this.prisma.account.findUnique({
      where: { accountId },
      select: {
        accountId: true, ownerId: true, residentId: true, role: true, email: true, phone: true, status: true,
        owner: { select: { ownerId: true, displayName: true } },
        resident: { select: { residentId: true, ownerId: true, fullName: true } },
      },
    }) as Promise<CurrentAccountRecord | null>;
  }
}
