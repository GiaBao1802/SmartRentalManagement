import { createHash, randomBytes } from "node:crypto";
import express from "express";
import type { PrismaClient, Prisma } from "@prisma/client";
import { ApiError, forbidden, notFound, validationError } from "../middleware/api-error.js";
import { authenticateRequest, requireSuperadmin, type AuthDependencies } from "../middleware/auth.js";
import { verifyPassword, hashPassword } from "../auth/password.js";
import { getCookie, SESSION_COOKIE } from "../middleware/csrf.js";
import { hashSessionToken } from "../auth/session-store.js";

type Db = PrismaClient | Prisma.TransactionClient;
const token = () => randomBytes(32).toString("base64url");
const digest = (value: string) => createHash("sha256").update(value).digest("hex");
const text = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : "";
const id = (value: unknown) => {
  if (typeof value !== "string" || !/^[1-9]\d*$/.test(value)) throw validationError();
  return BigInt(value);
};
const fail = (code: string, message: string) => new ApiError(409, code, message);
const invalidToken = () => new ApiError(400, "TOKEN_INVALID", "Liên kết không hợp lệ hoặc đã hết hạn.");
const emailOf = (value: unknown) => {
  const email = text(value, 254).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw validationError("Email chưa hợp lệ.");
  return email;
};
const passwordOf = (value: unknown) => {
  if (typeof value !== "string" || value.length < 12 || value.length > 1024) throw validationError("Mật khẩu cần từ 12 đến 1024 ký tự.");
  return value;
};
const pageOf = (value: unknown) => Math.min(10000, Math.max(1, Number.parseInt(String(value ?? 1), 10) || 1));
const limited = (value: unknown) => Math.min(100, Math.max(1, Number.parseInt(String(value ?? 20), 10) || 20));
const noStore: express.RequestHandler = (_request, response, next) => { response.setHeader("Cache-Control", "no-store"); next(); };
const demoAvailable = (deps: AuthDependencies) =>
  deps.config.nodeEnv !== "production" && !new URL(deps.config.databaseUrl).hostname.endsWith(".neon.tech");
const demoOnly = (deps: AuthDependencies): express.RequestHandler => (_request, _response, next) =>
  !demoAvailable(deps) ? next(new ApiError(503, "DEMO_ONLY", "Tiện ích cấp tài khoản demo không hoạt động trên Neon hoặc production.")) : next();
const requireInvitationDelivery = (deps: AuthDependencies): express.RequestHandler => (_request, _response, next) =>
  !demoAvailable(deps)
    ? next(new ApiError(503, "DELIVERY_NOT_CONFIGURED", "Chưa cấu hình kênh gửi lời mời hoặc liên kết đặt lại; chưa tạo và chưa gửi liên kết."))
    : next();
const send = (response: express.Response, status: number, data: unknown) => response.status(status).json({ data });
const safeAuditReason = (reason?: string) => reason?.replace(/https?:\/\/\S+/gi, "[link]")
  .replace(/[A-Za-z0-9_-]{32,}/g, "[mã]")
  .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]")
  .replace(/\+?\d[\d\s.-]{8,}\d/g, "[số]").slice(0, 1000);
const audit = async (db: Db, actor: bigint | null, action: string, result: "SUCCESS" | "DENIED" | "FAILED", targetType?: string, targetId?: bigint, reason?: string) => {
  await db.$executeRaw`INSERT INTO platform_audit_events(actor_account_id, action, result, target_type, target_id, reason)
    VALUES (${actor}, ${action}, ${result}, ${targetType ?? null}, ${targetId ?? null}, ${safeAuditReason(reason) ?? null})`;
};
const demoLink = (deps: AuthDependencies, kind: "owner-invitation" | "owner-reset", raw: string) =>
  !demoAvailable(deps) ? undefined : `${deps.config.frontendOrigin}/${kind}#token=${encodeURIComponent(raw)}`;

export function createPlatformRouter(db: PrismaClient, deps: AuthDependencies): express.Router {
  const router = express.Router();
  router.use(noStore);
  router.use(authenticateRequest(deps), requireSuperadmin);
  async function command<T extends Record<string, unknown>>(request: express.Request, operation: string, work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
    const actor = request.auth!.accountId;
    const rawKey = request.header("Idempotency-Key");
    if (!rawKey || rawKey.length > 128 || !/^[\x21-\x7e]+$/.test(rawKey)) throw validationError("Cần Idempotency-Key hợp lệ.");
    const keyHash = digest(rawKey), fingerprint = digest(JSON.stringify(request.body ?? {}));
    for (let attempt = 0; attempt < 3; attempt += 1) try {
    return await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${`${actor}:${operation}:${keyHash}`}))) lock_row`;
      const existing = await tx.$queryRaw<Array<{ fingerprint: string; safe_response: T }>>`
        SELECT fingerprint,safe_response FROM platform_command_requests
        WHERE actor_account_id=${actor} AND operation=${operation} AND key_hash=${keyHash} FOR UPDATE`;
      if (existing.length) {
        if (existing[0].fingerprint.trim() !== fingerprint) throw fail("IDEMPOTENCY_KEY_REUSED", "Khóa thử lại đã dùng cho nội dung khác.");
        return { ...existing[0].safe_response, demo_link: undefined, delivery_message: "Link chỉ hiển thị ở lần cấp đầu. Hãy tạo link mới nếu cần." } as T;
      }
      const result = await work(tx);
      const safe = { ...result, demo_link: undefined };
      await tx.$executeRaw`INSERT INTO platform_command_requests(actor_account_id,operation,key_hash,fingerprint,safe_response)
        VALUES (${actor},${operation},${keyHash},${fingerprint},CAST(${JSON.stringify(safe)} AS jsonb))`;
      return result;
    }, { isolationLevel: "Serializable" });
    } catch (error) {
      const serialization = error && typeof error === "object" && "code" in error &&
        (error.code === "P2034" || (error.code === "P2010" && "meta" in error && error.meta && typeof error.meta === "object" && "code" in error.meta && error.meta.code === "40001"));
      if (attempt < 2 && serialization) continue;
      throw error;
    }
    throw fail("CONCURRENT_CHANGE", "Dữ liệu vừa thay đổi; vui lòng thử lại.");
  }

  router.get("/owners", async (request, response, next) => {
    try {
      const page = pageOf(request.query.page), size = limited(request.query.page_size);
      const search = `%${text(request.query.search, 150)}%`;
      const rows = await db.$queryRaw<Array<{ owner_id: bigint; display_name: string; contact_email: string | null; contact_phone: string | null; account_id: bigint | null; status: string | null; property_count: bigint }>>`
        SELECT o.owner_id, o.display_name, o.contact_email, o.contact_phone, a.account_id, a.status,
          (SELECT count(*) FROM properties p WHERE p.owner_id=o.owner_id) property_count
        FROM owners o LEFT JOIN accounts a ON a.owner_id=o.owner_id AND a.role='admin'
        WHERE o.display_name ILIKE ${search} OR o.contact_email ILIKE ${search}
        ORDER BY o.owner_id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`;
      send(response, 200, rows.map(row => ({ ...row, owner_id: row.owner_id.toString(), account_id: row.account_id?.toString() ?? null, property_count: Number(row.property_count), account_state: row.account_id === null ? "pending_setup" : row.status })));
    } catch (error) { next(error); }
  });
  router.get("/owners/:ownerId", async (request, response, next) => {
    try {
      const ownerId = id(request.params.ownerId);
      const owners = await db.$queryRaw<Array<{ owner_id: bigint; display_name: string; contact_email: string | null; contact_phone: string | null; account_id: bigint | null; account_status: string | null; created_at: Date }>>`
        SELECT o.owner_id,o.display_name,o.contact_email,o.contact_phone,o.created_at,a.account_id,a.status account_status
        FROM owners o LEFT JOIN accounts a ON a.owner_id=o.owner_id AND a.role='admin' WHERE o.owner_id=${ownerId}`;
      if (!owners.length) throw notFound();
      const invitations = await db.$queryRaw<Array<{ invitation_id: bigint; status: string; expires_at: Date; delivery_status: string; created_at: Date }>>`
        SELECT invitation_id,status,expires_at,delivery_status,created_at FROM owner_account_invitations WHERE owner_id=${ownerId} ORDER BY invitation_id DESC LIMIT 10`;
      const owner = owners[0];
      send(response, 200, { ...owner, owner_id: owner.owner_id.toString(), account_id: owner.account_id?.toString() ?? null, account_state: owner.account_id === null ? "pending_setup" : owner.account_status, invitations: invitations.map(item => ({ ...item, invitation_id: item.invitation_id.toString() })) });
    } catch (error) { next(error); }
  });

  router.post("/owners", requireInvitationDelivery(deps), async (request, response, next) => {
    try {
      const name = text(request.body?.display_name, 200);
      const email = emailOf(request.body?.contact_email);
      const phone = text(request.body?.contact_phone, 30) || null;
      const verification = request.body?.recipient_verification;
      if (!name || !verification || text(verification.method, 40) !== "phone_call" || !text(verification.note, 500)) throw validationError("Cần tên và xác nhận người nhận qua điện thoại.");
      if (phone && !/^\+84\d{9}$/.test(phone)) throw validationError("Số điện thoại cần theo dạng +84XXXXXXXXX.");
      const actor = request.auth!.accountId;
      const raw = token(), hash = digest(raw);
      const result = await command(request, "OWNER_CREATE", async tx => {
        await tx.$queryRaw`SELECT 1::int AS locked FROM (SELECT pg_advisory_xact_lock(hashtext(${email}))) lock_row`;
        const existing = await tx.$queryRaw<Array<{ found: number }>>`
          SELECT 1 found FROM owners WHERE lower(trim(contact_email))=${email}
          UNION ALL SELECT 1 FROM accounts WHERE lower(trim(email))=${email}
          UNION ALL SELECT 1 FROM owner_account_invitations WHERE lower(trim(recipient_email))=${email} AND status='pending'
          LIMIT 1`;
        if (existing.length) throw fail("OWNER_IDENTITY_CONFLICT", "Liên hệ đã thuộc hồ sơ khác; cần đối soát.");
        if (phone) {
          const duplicate = await tx.$queryRaw<Array<{ found: number }>>`
            SELECT 1 found FROM owners WHERE contact_phone=${phone}
            UNION ALL SELECT 1 FROM accounts WHERE phone=${phone} LIMIT 1`;
          if (duplicate.length) throw fail("OWNER_PHONE_REVIEW", "Số điện thoại đã có; cần đối soát người nhận.");
        }
        const [owner] = await tx.$queryRaw<Array<{ owner_id: bigint }>>`
          INSERT INTO owners(display_name,contact_email,contact_phone) VALUES (${name},${email},${phone}) RETURNING owner_id`;
        const [invitation] = await tx.$queryRaw<Array<{ invitation_id: bigint; expires_at: Date }>>`
          INSERT INTO owner_account_invitations(owner_id,recipient_email,token_hash,expires_at,created_by_account_id)
          VALUES (${owner.owner_id},${email},${hash},now()+interval '24 hours',${actor}) RETURNING invitation_id,expires_at`;
        await audit(tx, actor, "OWNER_CREATE_INVITE", "SUCCESS", "OWNER", owner.owner_id);
        return { owner_id: owner.owner_id.toString(), invitation_id: invitation.invitation_id.toString(), account_state: "pending_setup", expires_at: invitation.expires_at, delivery_status: "demo_not_sent", delivery_message: "Chưa gửi thật qua Zalo/số điện thoại.", demo_link: demoLink(deps, "owner-invitation", raw) };
      });
      send(response, 201, result);
    } catch (error) { next(error); }
  });

  router.post("/owners/:ownerId/invitation-resend", requireInvitationDelivery(deps), async (request, response, next) => {
    try {
      const ownerId = id(request.params.ownerId), actor = request.auth!.accountId;
      const raw = token(), hash = digest(raw);
      const result = await command(request, `OWNER_INVITE_RESEND:${ownerId}`, async tx => {
        const owners = await tx.$queryRaw<Array<{ contact_email: string | null }>>`SELECT contact_email FROM owners WHERE owner_id=${ownerId} FOR UPDATE`;
        const owner = owners[0]; if (!owner) throw notFound();
        const accounts = await tx.$queryRaw<Array<{ account_id: bigint }>>`SELECT account_id FROM accounts WHERE owner_id=${ownerId}`;
        if (accounts.length) throw fail("ACCOUNT_EXISTS", "Chủ trọ đã có tài khoản; dùng đặt lại mật khẩu.");
        if (!owner.contact_email) throw validationError("Chủ trọ chưa có email.");
        await tx.$executeRaw`UPDATE owner_account_invitations SET status='revoked',updated_at=now() WHERE owner_id=${ownerId} AND status='pending'`;
        const [result] = await tx.$queryRaw<Array<{ invitation_id: bigint; expires_at: Date }>>`
          INSERT INTO owner_account_invitations(owner_id,recipient_email,token_hash,expires_at,created_by_account_id)
          VALUES (${ownerId},${owner.contact_email},${hash},now()+interval '24 hours',${actor}) RETURNING invitation_id,expires_at`;
        await audit(tx, actor, "OWNER_INVITE_RESEND", "SUCCESS", "OWNER", ownerId);
        return { invitation_id: result.invitation_id.toString(), expires_at: result.expires_at, delivery_status: "demo_not_sent", delivery_message: "Chưa gửi thật qua Zalo/số điện thoại.", demo_link: demoLink(deps, "owner-invitation", raw) };
      });
      send(response, 202, result);
    } catch (error) { next(error); }
  });

  router.post("/accounts/:accountId/password-reset", requireInvitationDelivery(deps), async (request, response, next) => {
    try {
      const accountId = id(request.params.accountId), actor = request.auth!.accountId;
      const raw = token(), hash = digest(raw);
      const result = await command(request, `OWNER_PASSWORD_RESET_REQUEST:${accountId}`, async tx => {
        const rows = await tx.$queryRaw<Array<{ email: string | null }>>`SELECT email FROM accounts WHERE account_id=${accountId} AND role='admin' AND owner_id IS NOT NULL FOR UPDATE`;
        if (!rows[0]?.email) throw notFound();
        await tx.$executeRaw`UPDATE owner_password_resets SET status='revoked' WHERE account_id=${accountId} AND status='pending'`;
        const [result] = await tx.$queryRaw<Array<{ reset_id: bigint; expires_at: Date }>>`
          INSERT INTO owner_password_resets(account_id,recipient_email,token_hash,expires_at,created_by_account_id)
          VALUES (${accountId},${rows[0].email},${hash},now()+interval '30 minutes',${actor}) RETURNING reset_id,expires_at`;
        await audit(tx, actor, "OWNER_PASSWORD_RESET_REQUEST", "SUCCESS", "ACCOUNT", accountId);
        return { reset_id: result.reset_id.toString(), expires_at: result.expires_at, delivery_status: "demo_not_sent", delivery_message: "Chưa gửi thật qua Zalo/số điện thoại.", demo_link: demoLink(deps, "owner-reset", raw) };
      });
      send(response, 202, result);
    } catch (error) { next(error); }
  });

  for (const mode of ["lock", "unlock"] as const) router.post(`/accounts/:accountId/${mode}`, async (request, response, next) => {
    try {
      const accountId = id(request.params.accountId), reason = text(request.body?.reason, 1000), actor = request.auth!.accountId;
      if (!reason) throw validationError("Cần ghi lý do.");
      const status = mode === "lock" ? "locked" : "active";
      const result = await command(request, `OWNER_ACCOUNT_${mode}:${accountId}`, async tx => {
        const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM accounts WHERE account_id=${accountId} AND role='admin' AND owner_id IS NOT NULL FOR UPDATE`;
        if (!rows.length) throw notFound();
        if (rows[0].status !== status) await tx.$executeRaw`UPDATE accounts SET status=${status},updated_at=now() WHERE account_id=${accountId}`;
        await audit(tx, actor, mode === "lock" ? "OWNER_ACCOUNT_LOCK" : "OWNER_ACCOUNT_UNLOCK", "SUCCESS", "ACCOUNT", accountId, `${rows[0].status}->${status}; ${reason}`);
        return { account_id: accountId.toString(), status };
      });
      let revoked = true;
      try { if (mode === "lock") await deps.sessions.revokeAccount(accountId.toString()); }
      catch { revoked = false; }
      send(response, 200, { ...result, sessions_revoked: revoked, requires_reconciliation: !revoked });
    } catch (error) { next(error); }
  });

  router.get("/properties", async (request, response, next) => {
    try {
      const page = pageOf(request.query.page), size = limited(request.query.page_size);
      const search = `%${text(request.query.search, 150)}%`, province = text(request.query.province, 120), status = text(request.query.status, 20);
      if (status && !["active", "building", "paused", "archived"].includes(status)) throw validationError();
      const ownerId = request.query.owner_id ? id(request.query.owner_id) : null;
      const rows = await db.$queryRaw<Array<{ property_id: bigint; owner_id: bigint; name: string; province: string; address: string; status: string; display_name: string }>>`
        SELECT p.property_id,p.owner_id,p.name,p.province,p.address,p.status,o.display_name
        FROM properties p JOIN owners o ON o.owner_id=p.owner_id
        WHERE (${status}='' OR p.status=${status}) AND (${province}='' OR p.province=${province})
          AND (${ownerId}::bigint IS NULL OR p.owner_id=${ownerId}::bigint)
          AND (p.name ILIKE ${search} OR o.display_name ILIKE ${search} OR p.address ILIKE ${search})
        ORDER BY p.property_id DESC LIMIT ${size} OFFSET ${(page - 1) * size}`;
      send(response, 200, rows.map(row => ({ ...row, property_id: row.property_id.toString(), owner_id: row.owner_id.toString() })));
    } catch (error) { next(error); }
  });

  router.get("/reports", async (request, response, next) => {
    try {
      const page = pageOf(request.query.page), size = limited(request.query.page_size);
      const status = text(request.query.status, 16);
      if (status && !["NEW", "IN_PROGRESS", "RESOLVED"].includes(status)) throw validationError();
      const rows = await db.$queryRaw<Array<{ report_id: bigint; reference_code: string; property_id: bigint; owner_id: bigint; content: string; anonymous: boolean; status: string; created_at: Date; property_name: string }>>`
        SELECT r.report_id,r.reference_code,r.property_id,r.owner_id,r.content,r.anonymous,r.status,r.created_at,p.name property_name
        FROM platform_reports r JOIN properties p ON p.property_id=r.property_id
        WHERE (${status}='' OR r.status=${status}) ORDER BY r.created_at DESC,r.report_id DESC
        LIMIT ${size} OFFSET ${(page-1)*size}`;
      send(response, 200, rows.map(row => ({ ...row, report_id: row.report_id.toString(), property_id: row.property_id.toString(), owner_id: row.owner_id.toString() })));
    } catch (error) { next(error); }
  });
  router.get("/reports/:reportId", async (request, response, next) => {
    try {
      const reportId = id(request.params.reportId);
      const rows = await db.$queryRaw<Array<{ report_id: bigint; reference_code: string; property_id: bigint; owner_id: bigint; content: string; anonymous: boolean; contact_name: string | null; contact_email: string | null; contact_phone: string | null; status: string; created_at: Date }>>`
        SELECT report_id,reference_code,property_id,owner_id,content,anonymous,contact_name,contact_email,contact_phone,status,created_at
        FROM platform_reports WHERE report_id=${reportId}`;
      if (!rows.length) throw notFound();
      const history = await db.$queryRaw<Array<{ history_id: bigint; actor_account_id: bigint | null; action: string; from_status: string | null; to_status: string | null; note: string | null; created_at: Date }>>`
        SELECT history_id,actor_account_id,action,from_status,to_status,note,created_at FROM platform_report_history WHERE report_id=${reportId} ORDER BY history_id`;
      send(response, 200, { ...rows[0], report_id: reportId.toString(), property_id: rows[0].property_id.toString(), owner_id: rows[0].owner_id.toString(), history: history.map(item => ({ ...item, history_id: item.history_id.toString(), actor_account_id: item.actor_account_id?.toString() ?? null })) });
    } catch (error) { next(error); }
  });
  router.post("/reports/:reportId/transition", async (request, response, next) => {
    try {
      const reportId = id(request.params.reportId), nextStatus = text(request.body?.to_status, 16), note = text(request.body?.note, 2000);
      if (!note || !["IN_PROGRESS", "RESOLVED"].includes(nextStatus)) throw validationError();
      const actor = request.auth!.accountId;
      const result = await command(request, `PLATFORM_REPORT_TRANSITION:${reportId}`, async tx => {
        const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM platform_reports WHERE report_id=${reportId} FOR UPDATE`;
        if (!rows.length) throw notFound();
        const from = rows[0].status;
        if (!((from === "NEW" && nextStatus === "IN_PROGRESS") || (from === "IN_PROGRESS" && nextStatus === "RESOLVED"))) throw fail("REPORT_STATUS_CHANGED", "Trạng thái đã thay đổi; vui lòng tải lại.");
        await tx.$executeRaw`UPDATE platform_reports SET status=${nextStatus},updated_at=now(),resolved_at=CASE WHEN ${nextStatus}='RESOLVED' THEN now() ELSE NULL END WHERE report_id=${reportId}`;
        await tx.$executeRaw`INSERT INTO platform_report_history(report_id,actor_account_id,action,from_status,to_status,note)
          VALUES (${reportId},${actor},'TRANSITION',${from},${nextStatus},${note})`;
        await audit(tx, actor, "PLATFORM_REPORT_TRANSITION", "SUCCESS", "REPORT", reportId, `${from}->${nextStatus}`);
        return { report_id: reportId.toString(), status: nextStatus };
      });
      send(response, 200, result);
    } catch (error) { next(error); }
  });
  router.post("/reports/:reportId/notes", async (request, response, next) => {
    try {
      const reportId = id(request.params.reportId), note = text(request.body?.note, 2000), actor = request.auth!.accountId;
      if (!note) throw validationError();
      await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ status: string }>>`SELECT status FROM platform_reports WHERE report_id=${reportId} FOR UPDATE`;
        if (!rows.length) throw notFound();
        await tx.$executeRaw`INSERT INTO platform_report_history(report_id,actor_account_id,action,from_status,to_status,note)
          VALUES (${reportId},${actor},'NOTE',${rows[0].status},${rows[0].status},${note})`;
        await audit(tx, actor, "PLATFORM_REPORT_NOTE", "SUCCESS", "REPORT", reportId);
      });
      send(response, 200, { added: true });
    } catch (error) { next(error); }
  });

  const auditPermission = async (accountId: bigint) => {
    const rows = await db.$queryRaw<Array<{ permission_id: bigint }>>`
      SELECT p.permission_id FROM platform_permissions p JOIN accounts a ON a.account_id=p.account_id
      WHERE p.account_id=${accountId} AND p.permission='PLATFORM_AUDIT_READ' AND p.revoked_at IS NULL AND a.role='superadmin' AND a.status='active'`;
    return rows.length > 0;
  };
  const recheckAttempts = new Map<string, { count: number; until: number }>();
  router.post("/audit/recheck", async (request, response, next) => {
    const actor = request.auth!.accountId;
    try {
      if (!await auditPermission(actor)) { await audit(db, actor, "AUDIT_RECHECK", "DENIED"); throw forbidden(); }
      const attempt = recheckAttempts.get(actor.toString());
      if (attempt && attempt.until > Date.now() && attempt.count >= 5) {
        await audit(db, actor, "AUDIT_RECHECK_RATE_LIMIT", "DENIED");
        throw new ApiError(429, "RATE_LIMITED", "Vui lòng thử lại sau.");
      }
      const password = request.body?.password;
      if (typeof password !== "string" || password.length > 1024) throw validationError();
      const rows = await db.$queryRaw<Array<{ password_hash: string }>>`SELECT password_hash FROM accounts WHERE account_id=${actor} AND role='superadmin' AND status='active'`;
      const ok = await verifyPassword(password, rows[0]?.password_hash);
      if (!ok) {
        recheckAttempts.set(actor.toString(), { count: attempt && attempt.until > Date.now() ? attempt.count + 1 : 1, until: attempt && attempt.until > Date.now() ? attempt.until : Date.now() + 900000 });
        await audit(db, actor, "AUDIT_RECHECK", "DENIED"); throw new ApiError(401, "RECHECK_FAILED", "Mật khẩu chưa đúng.");
      }
      recheckAttempts.delete(actor.toString());
      const cookie = getCookie(request, SESSION_COOKIE);
      if (!cookie) throw forbidden();
      const sessionHash = hashSessionToken(cookie, deps.config.sessionSecret);
      await db.$transaction(async tx => {
        await tx.$executeRaw`INSERT INTO platform_audit_grants(session_token_hash,account_id,verified_at,last_used_at)
          VALUES (${sessionHash},${actor},now(),now())
          ON CONFLICT (session_token_hash) DO UPDATE SET verified_at=now(),last_used_at=now(),account_id=EXCLUDED.account_id`;
        await audit(tx, actor, "AUDIT_RECHECK", "SUCCESS");
      });
      send(response, 200, { verified: true, idle_expires_at: new Date(Date.now()+600000), absolute_expires_at: new Date(Date.now()+1800000) });
    } catch (error) { next(error); }
  });
  router.get("/audit-events", async (request, response, next) => {
    const actor = request.auth!.accountId;
    try {
      const cookie = getCookie(request, SESSION_COOKIE);
      const sessionHash = cookie && hashSessionToken(cookie, deps.config.sessionSecret);
      if (!sessionHash || !await auditPermission(actor)) { await audit(db, actor, "AUDIT_READ", "DENIED"); throw forbidden(); }
      const page = pageOf(request.query.page), size = limited(request.query.page_size);
      const events = await db.$transaction(async tx => {
        const grant = await tx.$queryRaw<Array<{ session_token_hash: string }>>`
          UPDATE platform_audit_grants SET last_used_at=now()
          WHERE session_token_hash=${sessionHash} AND account_id=${actor}
            AND verified_at>now()-interval '30 minutes' AND last_used_at>now()-interval '10 minutes'
          RETURNING session_token_hash`;
        if (!grant.length) return null;
        await audit(tx, actor, "AUDIT_READ", "SUCCESS");
        return tx.$queryRaw<Array<{ event_id: bigint; occurred_at: Date; actor_account_id: bigint | null; action: string; result: string; target_type: string | null; target_id: bigint | null; reason: string | null }>>`
          SELECT event_id,occurred_at,actor_account_id,action,result,target_type,target_id,reason
          FROM platform_audit_events ORDER BY occurred_at DESC,event_id DESC LIMIT ${size} OFFSET ${(page-1)*size}`;
      });
      if (!events) { await audit(db, actor, "AUDIT_READ", "DENIED"); throw forbidden(); }
      send(response, 200, events.map(event => ({ ...event, event_id: event.event_id.toString(), actor_account_id: event.actor_account_id?.toString() ?? null, target_id: event.target_id?.toString() ?? null })));
    } catch (error) { next(error); }
  });

  const recordDenied: express.ErrorRequestHandler = async (error, request, _response, next) => {
    if (request.auth?.accountId) {
      try {
        const code = error instanceof ApiError ? error.code : "UNEXPECTED_ERROR";
        await audit(db, request.auth.accountId, "PLATFORM_REQUEST_REJECTED", error instanceof ApiError && error.status < 500 ? "DENIED" : "FAILED", undefined, undefined, code);
      } catch { /* The original request remains failed; never write request data or token to fallback logs. */ }
    }
    next(error);
  };
  router.use(recordDenied);
  return router;
}

export function createPlatformPublicRouter(db: PrismaClient, deps: AuthDependencies, scope: "auth" | "reports"): express.Router {
  const router = express.Router();
  const platformPaths = scope === "auth"
    ? new Set(["/operator-invitation/inspect", "/accept-operator-invitation", "/owner-invitation/inspect", "/accept-owner-invitation", "/owner-reset/inspect", "/complete-owner-reset"])
    : new Set(["/platform-report-targets", "/platform-reports"]);
  router.use((request, response, next) => {
    if (!platformPaths.has(request.path)) return next();
    noStore(request, response, () => {
      if (scope === "auth" && (request.path === "/operator-invitation/inspect" || request.path === "/accept-operator-invitation")) {
        return demoOnly(deps)(request, response, next);
      }
      next();
    });
  });
  if (scope === "auth") {
  router.post("/operator-invitation/inspect", async (request, response, next) => {
    try {
      const hash = digest(text(request.body?.token, 256));
      const rows = await db.$queryRaw<Array<{ expires_at: Date }>>`
        SELECT expires_at FROM platform_operator_invitations WHERE token_hash=${hash} AND status='pending' AND expires_at>now()`;
      if (!rows.length) throw invalidToken();
      send(response, 200, { valid: true, expires_at: rows[0].expires_at });
    } catch (error) { next(error); }
  });
  router.post("/accept-operator-invitation", async (request, response, next) => {
    try {
      const raw = text(request.body?.token, 256), password = passwordOf(request.body?.password);
      if (!raw) throw invalidToken();
      const hash = digest(raw), passwordHash = await hashPassword(password);
      await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ invitation_id: bigint; recipient_email: string }>>`
          SELECT invitation_id,recipient_email FROM platform_operator_invitations
          WHERE token_hash=${hash} AND status='pending' AND expires_at>now() FOR UPDATE`;
        const invite = rows[0]; if (!invite) throw invalidToken();
        const existing = await tx.$queryRaw<Array<{ account_id: bigint }>>`SELECT account_id FROM accounts WHERE lower(trim(email))=lower(trim(${invite.recipient_email}))`;
        if (existing.length) throw invalidToken();
        const [account] = await tx.$queryRaw<Array<{ account_id: bigint }>>`
          INSERT INTO accounts(role,email,password_hash) VALUES ('superadmin',${invite.recipient_email},${passwordHash}) RETURNING account_id`;
        await tx.$executeRaw`UPDATE platform_operator_invitations SET status='accepted',accepted_at=now() WHERE invitation_id=${invite.invitation_id}`;
        await audit(tx, account.account_id, "OPERATOR_INVITE_ACCEPT", "SUCCESS", "ACCOUNT", account.account_id);
      });
      send(response, 200, { accepted: true });
    } catch (error) { next(error); }
  });
  router.post("/owner-invitation/inspect", async (request, response, next) => {
    try {
      const hash = digest(text(request.body?.token, 256));
      const rows = await db.$queryRaw<Array<{ expires_at: Date }>>`SELECT expires_at FROM owner_account_invitations WHERE token_hash=${hash} AND status='pending' AND expires_at>now()`;
      if (!rows.length) throw invalidToken();
      send(response, 200, { valid: true, expires_at: rows[0].expires_at });
    } catch (error) { next(error); }
  });
  router.post("/accept-owner-invitation", async (request, response, next) => {
    try {
      const raw = text(request.body?.token, 256), password = passwordOf(request.body?.password);
      if (!raw) throw invalidToken();
      const passwordHash = await hashPassword(password), hash = digest(raw);
      await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ invitation_id: bigint; owner_id: bigint; recipient_email: string }>>`
          SELECT invitation_id,owner_id,recipient_email FROM owner_account_invitations
          WHERE token_hash=${hash} AND status='pending' AND expires_at>now() FOR UPDATE`;
        const invite = rows[0]; if (!invite) throw invalidToken();
        const owner = await tx.$queryRaw<Array<{ contact_email: string | null }>>`SELECT contact_email FROM owners WHERE owner_id=${invite.owner_id} FOR UPDATE`;
        if (owner[0]?.contact_email?.toLowerCase().trim() !== invite.recipient_email.toLowerCase().trim()) throw invalidToken();
        const existing = await tx.$queryRaw<Array<{ account_id: bigint }>>`SELECT account_id FROM accounts WHERE owner_id=${invite.owner_id}`;
        if (existing.length) throw invalidToken();
        const [account] = await tx.$queryRaw<Array<{ account_id: bigint }>>`
          INSERT INTO accounts(owner_id,role,email,password_hash) VALUES (${invite.owner_id},'admin',${invite.recipient_email},${passwordHash}) RETURNING account_id`;
        await tx.$executeRaw`UPDATE owner_account_invitations SET status='accepted',accepted_at=now(),updated_at=now() WHERE invitation_id=${invite.invitation_id}`;
        await audit(tx, account.account_id, "OWNER_INVITE_ACCEPT", "SUCCESS", "OWNER", invite.owner_id);
      });
      send(response, 200, { accepted: true });
    } catch (error) { next(error); }
  });
  router.post("/owner-reset/inspect", async (request, response, next) => {
    try {
      const hash = digest(text(request.body?.token, 256));
      const rows = await db.$queryRaw<Array<{ expires_at: Date }>>`SELECT expires_at FROM owner_password_resets WHERE token_hash=${hash} AND status='pending' AND expires_at>now()`;
      if (!rows.length) throw invalidToken();
      send(response, 200, { valid: true, expires_at: rows[0].expires_at });
    } catch (error) { next(error); }
  });
  router.post("/complete-owner-reset", async (request, response, next) => {
    try {
      const raw = text(request.body?.token, 256), password = passwordOf(request.body?.password);
      if (!raw) throw invalidToken();
      const hash = digest(raw), passwordHash = await hashPassword(password);
      const accountId = await db.$transaction(async tx => {
        const rows = await tx.$queryRaw<Array<{ reset_id: bigint; account_id: bigint; recipient_email: string }>>`
          SELECT reset_id,account_id,recipient_email FROM owner_password_resets
          WHERE token_hash=${hash} AND status='pending' AND expires_at>now() FOR UPDATE`;
        const reset = rows[0]; if (!reset) throw invalidToken();
        const accounts = await tx.$queryRaw<Array<{ email: string | null }>>`SELECT email FROM accounts WHERE account_id=${reset.account_id} AND role='admin' FOR UPDATE`;
        if (accounts[0]?.email?.toLowerCase().trim() !== reset.recipient_email.toLowerCase().trim()) throw invalidToken();
        await tx.$executeRaw`UPDATE accounts SET password_hash=${passwordHash},updated_at=now() WHERE account_id=${reset.account_id}`;
        await tx.$executeRaw`UPDATE owner_password_resets SET status='used',used_at=now() WHERE reset_id=${reset.reset_id}`;
        await tx.$executeRaw`UPDATE owner_password_resets SET status='revoked' WHERE account_id=${reset.account_id} AND status='pending'`;
        await tx.$executeRaw`DELETE FROM auth_sessions WHERE account_id=${reset.account_id}`;
        await audit(tx, reset.account_id, "OWNER_PASSWORD_RESET_COMPLETE", "SUCCESS", "ACCOUNT", reset.account_id);
        return reset.account_id;
      });
      await deps.sessions.revokeAccount(accountId.toString());
      send(response, 200, { completed: true, account_id: accountId.toString() });
    } catch (error) { next(error); }
  });
  return router;
  }
  router.get("/platform-report-targets", async (request, response, next) => {
    try {
      const search = `%${text(request.query.search, 100)}%`;
      const rows = await db.$queryRaw<Array<{ public_report_code: string; name: string; province: string; address: string }>>`
        SELECT p.public_report_code,p.name,p.province,p.address FROM properties p
        WHERE p.status='active' AND EXISTS (SELECT 1 FROM rooms r WHERE r.property_id=p.property_id AND r.is_public AND r.is_active)
          AND (p.name ILIKE ${search} OR p.province ILIKE ${search})
        ORDER BY p.property_id DESC LIMIT 30`;
      send(response, 200, rows);
    } catch (error) { next(error); }
  });
  const reportHits = new Map<string, { count: number; until: number }>();
  router.post("/platform-reports", async (request, response, next) => {
    try {
      const ip = request.ip || "unknown", now = Date.now(), hit = reportHits.get(ip);
      if (hit && hit.until > now && hit.count >= 5) throw new ApiError(429, "RATE_LIMITED", "Vui lòng thử lại sau.");
      reportHits.set(ip, { count: hit && hit.until > now ? hit.count + 1 : 1, until: hit && hit.until > now ? hit.until : now + 3600000 });
      const code = text(request.body?.public_report_code, 32), content = text(request.body?.content, 4000);
      const anonymous = request.body?.anonymous === true;
      if (!code || content.length < 10 || typeof request.body?.anonymous !== "boolean") throw validationError();
      const contactName = text(request.body?.contact_name, 200) || null;
      const contactEmail = text(request.body?.contact_email, 254) || null;
      const contactPhone = text(request.body?.contact_phone, 30) || null;
      const reference = `GT-${randomBytes(7).toString("hex").toUpperCase()}`;
      await db.$transaction(async tx => {
        const properties = await tx.$queryRaw<Array<{ property_id: bigint; owner_id: bigint }>>`SELECT property_id,owner_id FROM properties WHERE public_report_code=${code}`;
        if (!properties.length) throw notFound();
        const [report] = await tx.$queryRaw<Array<{ report_id: bigint }>>`
          INSERT INTO platform_reports(reference_code,property_id,owner_id,content,anonymous,contact_name,contact_email,contact_phone)
          VALUES (${reference},${properties[0].property_id},${properties[0].owner_id},${content},${anonymous},${contactName},${contactEmail},${contactPhone}) RETURNING report_id`;
        await tx.$executeRaw`INSERT INTO platform_report_history(report_id,action,to_status) VALUES (${report.report_id},'CREATED','NEW')`;
        await audit(tx, null, "PLATFORM_REPORT_CREATE", "SUCCESS", "REPORT", report.report_id);
      });
      send(response, 201, { reference_code: reference, status: "NEW" });
    } catch (error) { next(error); }
  });
  return router;
}
