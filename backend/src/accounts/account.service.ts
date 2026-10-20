import { ApiError, forbidden } from "../middleware/api-error.js";
import { foreignResourceNotFound } from "../middleware/auth.js";
import type { SessionStore } from "../auth/session-store.js";
import type { AccountManagementRepository } from "./account.types.js";

export class AccountManagementService {
  constructor(readonly repository: AccountManagementRepository, private readonly sessions: SessionStore) {}
  async setStatus(ownerId: bigint, accountId: bigint, status: "active" | "locked") {
    const account = await this.repository.find(ownerId, accountId);
    if (!account) foreignResourceNotFound();
    if (account.role !== "resident") throw forbidden();
    const result = await this.repository.setResidentStatus(ownerId, accountId, status, () => this.sessions.revokeAccount(accountId.toString()));
    if (!result) foreignResourceNotFound();
    return result;
  }
  async revoke(ownerId: bigint, invitationId: bigint) {
    const result = await this.repository.revokeInvitation(ownerId, invitationId, new Date());
    if (result === "missing") foreignResourceNotFound();
    if (result === "terminal") throw new ApiError(409, "INVITATION_NOT_PENDING", "Lời mời đã hết hạn hoặc đã được sử dụng.");
    return result;
  }
  deliveryUnavailable(): never {
    // Approved invitation policy exists; acceptance/reset API and provider are not wired.
    // Do not invalidate invitations, persist tokens or report a fake delivery.
    throw new ApiError(503, "ACCOUNT_DELIVERY_UNAVAILABLE", "Cấp tài khoản và đặt lại mật khẩu chưa khả dụng: chưa cấu hình kênh xác minh an toàn.");
  }
}
