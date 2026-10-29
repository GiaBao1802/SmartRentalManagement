type AccountSafe = {
  email: string | null;
  phone: string | null;
  status: "active";
};

export type AdminAuthContext = {
  accountId: bigint;
  role: "admin";
  ownerId: bigint;
  residentId: null;
  account: AccountSafe;
  owner: { ownerId: bigint; displayName: string };
};

export type ResidentAuthContext = {
  accountId: bigint;
  role: "resident";
  ownerId: bigint;
  residentId: bigint;
  account: AccountSafe;
  resident: { residentId: bigint; ownerId: bigint; fullName: string };
};

export type SuperadminAuthContext = {
  accountId: bigint;
  role: "superadmin";
  ownerId: null;
  residentId: null;
  account: AccountSafe;
};

export type AuthContext = AdminAuthContext | ResidentAuthContext | SuperadminAuthContext;

export type LoginAccountRecord = {
  accountId: bigint;
  ownerId: bigint | null;
  residentId: bigint | null;
  role: string;
  email: string | null;
  phone: string | null;
  passwordHash: string;
  status: string;
  owner: { ownerId: bigint; displayName: string } | null;
  resident: { residentId: bigint; ownerId: bigint; fullName: string } | null;
};

export type CurrentAccountRecord = Omit<LoginAccountRecord, "passwordHash">;

export interface AuthRepository {
  findCandidates(login: string): Promise<LoginAccountRecord[]>;
  findCurrentAccount(accountId: bigint): Promise<CurrentAccountRecord | null>;
}
