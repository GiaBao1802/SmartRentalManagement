"use client";

import { FormEvent, useRef, useState } from "react";
import { createPublicContactRequest } from "../../../lib/api/publicRoomApi";
import { createSingleFlightGate } from "../../../lib/singleFlight";
import { publicContactErrorMessage, validatePublicContactInput } from "../../../lib/publicContact";

export function PublicContactForm({ roomId, roomLabel }: { roomId: string; roomLabel: string }) {
  const gate = useRef(createSingleFlightGate());
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState(false);
  const [validationError, setValidationError] = useState("");
  const [requestError, setRequestError] = useState("");
  const [sent, setSent] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setValidationError(""); setRequestError("");
    const input = { room_id: roomId, requester_name: name.trim(), phone: phone.trim(), ...(email.trim() ? { email: email.trim() } : {}), ...(message.trim() ? { message: message.trim() } : {}) };
    const validationError = validatePublicContactInput(input);
    if (validationError) { setValidationError(validationError); return; }

    await gate.current(async () => {
      setPending(true);
      try {
        await createPublicContactRequest(input);
        setSent(true); setName(""); setPhone(""); setEmail(""); setMessage("");
      } catch (error) { setRequestError(publicContactErrorMessage(error)); }
      finally { setPending(false); }
    });
  }

  if (sent) return <div className="public-contact-success" role="status"><span aria-hidden="true">✓</span><strong>Thông tin của bạn đã được gửi đến chủ nhà.</strong><p>Chủ trọ sẽ liên hệ theo thông tin bạn đã cung cấp.</p><a href="/rooms">Tiếp tục xem phòng</a></div>;

  return <form className="public-contact-form" onSubmit={(event) => void submit(event)} aria-label="Gửi yêu cầu liên hệ">
    <p className="public-contact-room">Phòng bạn quan tâm: <strong>{roomLabel}</strong></p>
    <label>Họ và tên <span aria-hidden="true">*</span><input name="requester_name" autoComplete="name" required minLength={2} maxLength={200} value={name} onChange={(event) => setName(event.target.value)} /></label>
    <label>Số điện thoại <span aria-hidden="true">*</span><input name="phone" autoComplete="tel" type="tel" inputMode="tel" required minLength={8} maxLength={30} value={phone} onChange={(event) => setPhone(event.target.value)} /></label>
    <label>Email <small>Tùy chọn</small><input name="email" autoComplete="email" type="email" maxLength={254} value={email} onChange={(event) => setEmail(event.target.value)} /></label>
    <label>Lời nhắn <small>Tùy chọn</small><textarea name="message" rows={4} maxLength={2000} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Bạn muốn hỏi thêm điều gì về phòng?" /></label>
    {validationError && <p className="public-form-error" role="alert">{validationError}</p>}{requestError && <p className="public-form-error" role="alert">{requestError}</p>}
    <button className="button primary" type="submit" disabled={pending}>{pending ? "Đang gửi thông tin…" : "Gửi yêu cầu liên hệ"}</button>
    <small className="public-contact-privacy">Không cần đăng nhập. Gửi yêu cầu chưa phải xác nhận đặt phòng.</small>
  </form>;
}
