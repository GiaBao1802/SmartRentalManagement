export type AccountListQuery = { page: number; page_size: number; role?: "admin" | "resident"; status?: "active" | "locked"; residentId?: bigint };
export type AccountRecord = {
  accountId: bigint; residentId: bigint | null; role: string; email: string | null; phone: string | null; status: string;
  lastLoginAt: Date | null; createdAt: Date; updatedAt: Date;
  resident: { residentId: bigint; fullName: string } | null;
};
export type InvitationRecord = {
  invitationId: bigint; residentId: bigint; status: string; expiresAt: Date; acceptedAt: Date | null; createdAt: Date; updatedAt: Date;
};
export interface AccountManagementRepository {
  list(ownerId: bigint, query: AccountListQuery): Promise<{ rows: AccountRecord[]; total: number }>;
  find(ownerId: bigint, accountId: bigint): Promise<AccountRecord | null>;
  setResidentStatus(ownerId: bigint, accountId: bigint, status: "active" | "locked", revoke: () => Promise<void>): Promise<AccountRecord | null>;
  residentExists(ownerId: bigint, residentId: bigint): Promise<boolean>;
  invitations(ownerId: bigint, residentId: bigint, page: number, pageSize: number): Promise<{ rows: InvitationRecord[]; total: number }>;
  revokeInvitation(ownerId: bigint, invitationId: bigint, now: Date): Promise<InvitationRecord | "missing" | "terminal">;
}
