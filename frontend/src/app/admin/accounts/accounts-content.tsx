"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import AdminShell from "../../components/admin-shell";
import { accountApi, createInvitationRevoker, deliveryMessage, type AccountResource, type AccountListFilters, type InvitationResource } from "../../../lib/api/accountApi";
import { residentApi, type Resident } from "../../../lib/api/residentApi";
import type { PageMeta } from "../../../lib/api/propertyApi";

const initialMeta: PageMeta = { page: 1, page_size: 20, total_items: 0, total_pages: 0 };
const invitationLabels = { pending: "Chờ xác nhận", accepted: "Đã chấp nhận", expired: "Đã hết hạn", revoked: "Đã thu hồi" };
const message = (reason: unknown) => reason instanceof Error ? reason.message : "Không thể tải tài khoản. Vui lòng thử lại.";
const date = (value: string | null) => value ? new Date(value).toLocaleString("vi-VN") : "—";

export function AccountsTable({ rows, pending, onDetail, onStatus }: {
  rows: AccountResource[]; pending: boolean; onDetail: (row: AccountResource) => void; onStatus: (row: AccountResource) => void;
}) {
  return <div className="table-wrap"><table><thead><tr><th>Tài khoản</th><th>Vai trò</th><th>Liên hệ</th><th>Trạng thái</th><th>Thao tác</th></tr></thead><tbody>
    {rows.map((row) => <tr key={row.account_id}><td><strong>{row.resident?.full_name ?? "Chủ trọ"}</strong><br />Mã {row.account_id}</td><td>{row.role === "admin" ? "Chủ trọ" : "Cư dân"}</td><td>{row.email ?? "—"}<br />{row.phone ?? "—"}</td><td><span className={`chip ${row.status === "active" ? "success" : "warning"}`}>{row.status === "active" ? "Hoạt động" : "Đã khóa"}</span></td><td>
      <button type="button" className="text-action" disabled={pending} onClick={() => onDetail(row)}>Chi tiết</button>{row.role === "resident" && <button type="button" className="text-action" disabled={pending} onClick={() => onStatus(row)}>{row.status === "active" ? "Khóa tài khoản" : "Mở tài khoản"}</button>}
    </td></tr>)}
  </tbody></table></div>;
}

export default function AccountsContent() {
  const [residentRows, setResidentRows] = useState<Resident[]>([]);
  const [residentPage, setResidentPage] = useState(1);
  const [residentTotalPages, setResidentTotalPages] = useState(1);
  const [residentId, setResidentId] = useState("");
  const [residentLoading, setResidentLoading] = useState(true);
  const operationKeys = useRef(new Map<string, string>());
  useEffect(() => { let active = true; setResidentLoading(true); void residentApi.list({ page: residentPage, page_size: 20 }).then(result => { if (active) { setResidentRows(result.data); setResidentTotalPages(result.meta.total_pages); setResidentId(""); } }).catch(reason => { if (active) setError(message(reason)); }).finally(() => { if (active) setResidentLoading(false); }); return () => { active = false; }; }, [residentPage]);
  const [rows, setRows] = useState<AccountResource[]>([]);
  const [meta, setMeta] = useState(initialMeta);
  const [page, setPage] = useState(1);
  const [role, setRole] = useState<AccountListFilters["role"]>();
  const [status, setStatus] = useState<AccountListFilters["status"]>();
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [listError, setListError] = useState("");
  const [invitationError, setInvitationError] = useState("");
  const [notice, setNotice] = useState("");
  const [selected, setSelected] = useState<AccountResource | null>(null);
  const [invitations, setInvitations] = useState<InvitationResource[]>([]);
  const [invitationMeta, setInvitationMeta] = useState(initialMeta);
  const [invitationPage, setInvitationPage] = useState(1);
  const [detailLoading, setDetailLoading] = useState(false);
  const listRequest = useRef(0);
  const mutation = useRef(false);
  const revokeOperation = useRef<ReturnType<typeof createInvitationRevoker> | null>(null);
  if (!revokeOperation.current) revokeOperation.current = createInvitationRevoker();
  const load = useCallback(async () => {
    const request = ++listRequest.current;
    setLoading(true); setError(""); setListError("");
    try { const result = await accountApi.list({ page, role, status }); if (request === listRequest.current) { setRows(result.data); setMeta(result.meta); } }
    catch (reason) { if (request === listRequest.current) setListError(message(reason)); }
    finally { if (request === listRequest.current) setLoading(false); }
  }, [page, role, status]);
  useEffect(() => { void load(); return () => { listRequest.current += 1; }; }, [load]);
  useEffect(() => {
    let active = true;
    setInvitationError("");
    if (!selected?.resident_id) { setInvitations([]); setInvitationMeta(initialMeta); setDetailLoading(false); return; }
    setDetailLoading(true); setInvitations([]);
    void accountApi.invitations(selected.resident_id, invitationPage).then((result) => { if (active) { setInvitations(result.data); setInvitationMeta(result.meta); } }).catch((reason) => { if (active) { setInvitations([]); setInvitationError(message(reason)); } }).finally(() => { if (active) setDetailLoading(false); });
    return () => { active = false; };
  }, [selected?.resident_id, invitationPage]);

  async function details(row: AccountResource) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError("");
    try { const detail = await accountApi.detail(row.account_id); setSelected(detail); setInvitationPage(1); }
    catch (reason) { setError(message(reason)); }
    finally { mutation.current = false; setPending(false); }
  }
  async function changeStatus(row: AccountResource) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(""); setNotice("");
    try { const updated = await accountApi.setStatus(row.account_id, row.status === "active" ? "locked" : "active"); setSelected((previous) => previous?.account_id === updated.account_id ? updated : previous); setNotice(updated.status === "locked" ? "Đã khóa tài khoản và thu hồi phiên đăng nhập." : "Đã mở tài khoản. Cư dân cần đăng nhập lại."); await load(); }
    catch (reason) { setError(message(reason)); }
    finally { mutation.current = false; setPending(false); }
  }
  async function deliver(target: string, action: "invite" | "resend" | "reset") {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(""); setNotice("");
    const scope = action + ":" + target;
    let key = operationKeys.current.get(scope);
    if (!key) { key = crypto.randomUUID(); operationKeys.current.set(scope, key); }
    try {
      const result = action === "reset" ? await accountApi.reset(target, key) : await accountApi.invite(target, key, action === "resend");
      setNotice(deliveryMessage(result.delivery_status)); operationKeys.current.delete(scope);
    } catch (reason) { setError(message(reason)); }
    finally { mutation.current = false; setPending(false); }
  }
  async function revoke(row: InvitationResource) {
    if (mutation.current) return;
    mutation.current = true; setPending(true); setError(""); setNotice("");
    try { const updated = await revokeOperation.current!(row.invitation_id); setInvitations((current) => current.map((item) => item.invitation_id === updated.invitation_id ? updated : item)); setNotice("Đã thu hồi lời mời. Lịch sử vẫn được giữ lại."); }
    catch (reason) { setError(message(reason)); }
    finally { mutation.current = false; setPending(false); }
  }

  return <AdminShell active="/admin/accounts"><main className="admin-main account-management-page"><div className="breadcrumb">Quản lý · Tài khoản</div><div className="page-heading"><div><h1>Tài khoản và quyền truy cập</h1><p>Quản lý tài khoản cư dân thuộc phạm vi chủ trọ. Tài khoản chủ trọ được giữ nguyên quyền.</p></div></div>
    {(error || listError || invitationError) && <p className="notice" role="alert">{error || listError || invitationError} <button type="button" className="text-action" disabled={loading || pending} onClick={() => void load()}>Tải lại danh sách</button></p>}{notice && <p className="notice" role="status">{notice}</p>}
    <section className="admin-card account-invitation-panel"><h2>Mời cư dân thiết lập tài khoản</h2><p>Cư dân tự đặt mật khẩu qua liên kết xác minh. Chủ trọ không thể xem mã xác minh hoặc đặt mật khẩu thay cư dân. Nếu kênh gửi lời mời chưa khả dụng hoặc chưa gửi được hướng dẫn, hệ thống sẽ báo lỗi và không tính là đã gửi.</p>
      <label>Cư dân<select disabled={pending || residentLoading} value={residentId} onChange={e => setResidentId(e.target.value)}><option value="">Chọn cư dân trong trang</option>{residentRows.map(row => <option key={row.resident_id} value={row.resident_id}>{row.full_name} · {row.phone ?? "Chưa có số điện thoại"}</option>)}</select></label>
      <button className="button" disabled={pending || !residentId} onClick={() => void deliver(residentId, "invite")}>Gửi lời mời</button> <button className="button" disabled={pending || !residentId} onClick={() => void deliver(residentId, "resend")}>Gửi lại</button>
      <button disabled={pending || residentLoading || residentPage <= 1} onClick={() => setResidentPage(p => p - 1)}>Cư dân trước</button><span> Trang {residentPage} / {Math.max(1, residentTotalPages)} </span><button disabled={pending || residentLoading || residentPage >= residentTotalPages} onClick={() => setResidentPage(p => p + 1)}>Cư dân sau</button>
    </section>
    <section className="admin-card"><h2>Danh sách tài khoản ({meta.total_items})</h2><div className="account-create-form"><label>Vai trò<select value={role ?? ""} disabled={pending} onChange={(event) => { setRole(event.target.value ? event.target.value as AccountListFilters["role"] : undefined); setPage(1); }}><option value="">Tất cả</option><option value="admin">Chủ trọ</option><option value="resident">Cư dân</option></select></label><label>Trạng thái<select value={status ?? ""} disabled={pending} onChange={(event) => { setStatus(event.target.value ? event.target.value as AccountListFilters["status"] : undefined); setPage(1); }}><option value="">Tất cả</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></label></div>
      {loading ? <p role="status">Đang tải tài khoản…</p> : listError ? <p>Chưa tải được danh sách tài khoản. Vui lòng thử lại.</p> : !rows.length ? <p>Không có tài khoản phù hợp bộ lọc trong phạm vi quản lý.</p> : <AccountsTable rows={rows} pending={pending} onDetail={(row) => void details(row)} onStatus={(row) => void changeStatus(row)} />}
      <div className="pagination"><button type="button" className="button" disabled={loading || pending || page <= 1} onClick={() => setPage((value) => value - 1)}>Trang trước</button><span> Trang {meta.page} / {Math.max(1, meta.total_pages)} </span><button type="button" className="button" disabled={loading || pending || page >= meta.total_pages} onClick={() => setPage((value) => value + 1)}>Trang sau</button></div>
    </section>
    {selected && <section className="admin-card account-detail-card" aria-label="Chi tiết tài khoản"><h2>{selected.resident?.full_name ?? "Tài khoản chủ trọ"}</h2><div className="account-detail-content"><p>Mã tài khoản: {selected.account_id} · Đăng nhập gần nhất: {date(selected.last_login_at)}</p>
      <div className="account-detail-actions"><button type="button" className="text-action" disabled={pending} onClick={() => setSelected(null)}>Đóng chi tiết</button>{selected.resident_id && <button className="button" disabled={pending} onClick={() => void deliver(selected.account_id, "reset")}>Yêu cầu đặt lại mật khẩu</button>}</div>
      {selected.resident_id && <><h3>Lịch sử lời mời</h3>{detailLoading ? <p role="status">Đang tải lời mời…</p> : invitationError ? <p>Chưa tải được lịch sử lời mời.</p> : !invitations.length ? <p>Chưa có lời mời.</p> : <div className="table-wrap"><table><thead><tr><th>Lời mời</th><th>Trạng thái</th><th>Hết hạn</th><th>Thao tác</th></tr></thead><tbody>{invitations.map((row) => <tr key={row.invitation_id}><td>{row.invitation_id}</td><td>{invitationLabels[row.status]}</td><td>{date(row.expires_at)}</td><td>{row.status === "pending" && <button type="button" className="text-action" disabled={pending} onClick={() => void revoke(row)}>Thu hồi</button>}</td></tr>)}</tbody></table></div>}
        <div className="account-detail-pagination"><button type="button" className="text-action" disabled={detailLoading || pending || invitationPage <= 1} onClick={() => setInvitationPage((value) => value - 1)}>Lời mời trước</button><span>Trang {invitationPage} / {Math.max(1, invitationMeta.total_pages)}</span><button type="button" className="text-action" disabled={detailLoading || pending || invitationPage >= invitationMeta.total_pages} onClick={() => setInvitationPage((value) => value + 1)}>Lời mời sau</button></div></>}
      </div>
    </section>}
  </main></AdminShell>;
}
