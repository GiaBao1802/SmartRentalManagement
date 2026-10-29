"use client";
import { useEffect, useState, type FormEvent } from "react";
import { apiRequest } from "../../lib/api/apiClient";

type Target = { public_report_code: string; name: string; province: string; address: string };
export default function PlatformReportPage() {
  const [search, setSearch] = useState(""), [targets, setTargets] = useState<Target[]>([]), [code, setCode] = useState(""), [content, setContent] = useState(""), [anonymous, setAnonymous] = useState(true);
  const [contactName, setContactName] = useState(""), [contactEmail, setContactEmail] = useState(""), [contactPhone, setContactPhone] = useState(""), [message, setMessage] = useState("");
  useEffect(() => { void apiRequest<Target[]>(`/public/platform-report-targets?search=${encodeURIComponent(search)}`, { authRequired: false }).then(setTargets).catch(() => setTargets([])); }, [search]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const result = await apiRequest<{ reference_code: string }>("/public/platform-reports", { method: "POST", authRequired: false,
        body: JSON.stringify({ public_report_code: code, content, anonymous, contact_name: contactName || null, contact_email: contactEmail || null, contact_phone: contactPhone || null }) });
      setMessage(`Đã tiếp nhận phản ánh ${result.reference_code}. Mã này chỉ để tham chiếu, không dùng để mở hồ sơ.`); setContent("");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Không gửi được phản ánh."); }
  }
  return <main style={{ maxWidth: 680, margin: "4vh auto", padding: 24, fontFamily: "sans-serif" }}><h1>Gửi phản ánh tới nền tảng</h1><p>Phản ánh này được xử lý bởi nền tảng, tách khỏi phản ánh nội bộ của chủ trọ. Không hỗ trợ tệp đính kèm.</p><form onSubmit={event => void submit(event)}><label>Tìm khu trọ<input value={search} onChange={event => setSearch(event.target.value)} style={{ display: "block", width: "100%", padding: 10, margin: "8px 0" }}/></label><label>Chọn khu trọ<select required value={code} onChange={event => setCode(event.target.value)} style={{ display: "block", width: "100%", padding: 10, margin: "8px 0" }}><option value="">Chọn khu trọ</option>{targets.map(target => <option key={target.public_report_code} value={target.public_report_code}>{target.name} · {target.province} · {target.address}</option>)}</select></label><label>Nội dung<textarea required minLength={10} maxLength={4000} value={content} onChange={event => setContent(event.target.value)} style={{ display: "block", width: "100%", minHeight: 130, padding: 10, margin: "8px 0" }}/></label><label><input type="checkbox" checked={anonymous} onChange={event => setAnonymous(event.target.checked)}/> Gửi ẩn danh</label><p>Nếu không để lại liên hệ, nền tảng không thể phản hồi riêng.</p><label>Tên liên hệ (tùy chọn)<input value={contactName} onChange={event => setContactName(event.target.value)} style={{ display: "block", width: "100%", padding: 10 }}/></label><label>Email (tùy chọn)<input type="email" value={contactEmail} onChange={event => setContactEmail(event.target.value)} style={{ display: "block", width: "100%", padding: 10 }}/></label><label>Điện thoại (tùy chọn)<input value={contactPhone} onChange={event => setContactPhone(event.target.value)} style={{ display: "block", width: "100%", padding: 10 }}/></label><button style={{ marginTop: 18, padding: 12, color: "white", background: "#0E5A4F", border: 0, borderRadius: 8 }}>Gửi phản ánh</button></form><p role="status">{message}</p></main>;
}
